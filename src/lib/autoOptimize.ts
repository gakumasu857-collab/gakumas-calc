/**
 * 全自動最適化: レッスン（営業・授業）の踏み方 × サポカ編成 をまとめて探索する。
 *
 * 踏み方（レッスンのメイン/サブ・授業・選抜スコアの分配）は焼きなまし法で最適化する。
 * 目的は素直に「Σmin(上限, タイプ別ステ)を最大化」。溢れた分は上限で頭打ちになるだけで
 * ペナルティは無いので、溢れても合計が高くなる配分ならそれを選ぶ。授業も他と同じく
 * 踏んだとおりに評価し、焼きなまし・山登りの中で一緒に最適化する（特別扱いしない）。
 *
 * 探索は「踏み方 ⇄ 編成」の交互反復を、初期値非依存の固定9起点から回す:
 * 1. 固定9起点（レッスン偏重×授業寄せの格子。現在の踏み方は含めない）
 * 2. 各起点で焼きなまし法（乱数はシード非固定＝実行のたびに少し違う解）＋仕上げ山登り
 *    でレッスン・授業・選抜を同時に探索 ⇄ その踏み方で理想編成（findBestFormation）を組み直す
 * 3. 全起点の最良を採用
 *
 * 評価は計算ページと同じ流儀:
 * - パラメータボーナスは全ソース合算→1回変換（summedParaboByType）
 * - パラボ追従メモリーは踏み方ごとに「パラボ母数上位2タイプ」へ展開し直す
 * - NIAは札（スキル獲得→投票→評価値）の価値をステ換算で編成評価に足す
 * ※ 踏み方で変わるのはステ由来の評価値のみ（スター性・投票数・本戦は不変）なので、
 *    比較は Σmin(上限, ステ)＋NIA札換算 で行い、最終的な評価値は勝者だけ算出する。
 */
import { EXAMS, FINAL_ROUNDS, finalRoundValue, LESSONS } from "@/data/schedule";
import {
  HATSU_PARAM_RATE,
  HATSU_RANK_VALUES,
  hatsuExamValue,
  NIA_PARAM_RATE,
  niaFanValue,
  niaFudaVotes,
  type NiaTag,
  type ScenarioKey,
} from "@/data/scenarios";
import {
  evaluateTeam,
  eventBudgetScales,
  examAssistSum,
  MAX_STAT_EXCESS_WEIGHT,
  findBestFormation,
  minStatBonus,
  SP_PENALTY,
  spConditionShortfall,
  typeCountsFromRatio,
  scoreOwnedCards,
  scoreRentalCandidates,
  scoreSelectedCards,
  summedParaboByType,
  type CardFlagSets,
  type EventBudget,
  type MinStatCondition,
  type ScoredCard,
  type SelectedSlot,
  type SpMinCondition,
} from "./formation";
import { calcMemoryTotals, resolveParaboMemory } from "./memoryTotals";
import type { Memory } from "./memoryTypes";
import { annealStepping, climbStepping } from "./optimize/anneal";
import {
  buildSeeds,
  EXAM_RATIOS_FINE,
  examScoresFromRatio,
  examScoresUniform,
  sameExamScores,
  steppingAxes,
  uniformStepping,
  type Stepping,
} from "./optimize/stepping";
import {
  buildHatsuScoreContext,
  buildNiaScoreContext,
  computeHatsuGains,
  computeNiaGains,
  type HatsuStateLike,
  type NiaStateLike,
  type TypeRanks,
} from "./scenarioGains";
import {
  buildSheetScoreContext,
  paraboAssignFromGains,
  TYPE_SHEET_ROLE,
} from "./sheetContext";
import { paraboConvert, type SheetScoreContext } from "./sheetScore";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";
import type { HatsuLessonPick } from "./useHatsuSchedule";
import type { NiaLessonPick, NiaSalePick } from "./useNiaSchedule";
import {
  computeScheduleGains,
  type ExamScores,
  type LessonPick,
} from "./useSchedule";

/**
 * 焼きなましのシード数。乱数はシードを固定しない（Math.random）ので実行のたびに
 * 少し違う解が出るが、初期の踏み方には依存しない（固定9起点＋各起点から焼きなまし）。
 * 反復回数・温度は optimize/anneal.ts 側。
 */
const SA_STARTS = 6;
/** 「踏み方探索 ⇄ 編成組み直し」の最大ラウンド数 */
const MAX_ROUNDS = 2;
/** 全体の探索時間の上限（約5秒。超えたら新しい起点・ラウンドを始めない） */
const TIME_BUDGET_MS = 4800;
/**
 * 広域探索（9起点＋踏み方の詰め直し）に使う時間の割合。
 * 残りは仕上げの相互詰め直し（選抜細分配⇄編成⇄踏み方）と
 * 余り時間の焼きなましリスタートに確保する。
 */
const MAIN_PHASE_RATIO = 0.62;

const ZERO_STATS: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };

export type AutoOptimizeInput = {
  scenario: ScenarioKey;
  /** 探索の起点になる現在の踏み方（ストアの状態そのまま） */
  hif: {
    lessons: LessonPick[];
    classTypes: TypeKey[];
    examScores: ExamScores[];
  };
  nia: NiaStateLike;
  hatsu: HatsuStateLike & { midScore: number; finalScore: number };
  /** メモリースロット4枚（パラボ追従は踏み方ごとにここから展開する） */
  memories: (Memory | undefined)[];
  pStats: {
    fixed: Record<TypeKey, number>;
    parabo: Record<TypeKey, number>;
  } | null;
  plan: string | null;
  statCap: number;
  tag: NiaTag;
  /** タイプ→審査基準ランク（NIAのオーディション式に使用） */
  ranks: TypeRanks;
  manual: (label: string) => number | undefined;
  eventCounts: SheetScoreContext["eventCounts"];
  getLevel: (id: string) => number;
  flags: CardFlagSets;
  spMin: SpMinCondition;
  /**
   * 編成全体の前イベ・後イベの合計発動回数の上限。
   * 実際の合計が超える分は比例配分でスケールして評価する（未指定は制限なし）。
   */
  eventBudget?: EventBudget;
  /**
   * サポカ編成のタイプ構成をこの比率に固定する（例 {vocal:1,dance:3,visual:2}）。
   * 指定すると編成6枚を比率どおりのタイプ枚数（typeCountsFromRatio）に固定して探索する。
   * 未指定ならタイプ構成も自由に探索する。
   */
  typeRatio?: Record<TypeKey, number> | null;
  /** 試験補助を強める（アイテム評価・ドリンク獲得・SP率持ちを優先して編成） */
  examAssist?: boolean;
  /** 現在の育成スタイルタグ（試験補助のアイテム評点のゲート用。発動回数セット名由来） */
  examStyleTags?: string[] | null;
  /** ステージ（試験中）に持ち込むPアイテムのサポカを編成しない（固定は貫通） */
  noStageItems?: boolean;
  /**
   * タイプ別の最低ステータス（0=条件なし）。
   * 全部満たせないときはアイドルの審査基準が高いタイプから優先して満たす。
   */
  minStats?: Record<TypeKey, number>;
  /**
   * タイプ別の最高ステータス（上限）。min(シナリオ上限, この値) で評価する。
   * 「この属性はこれ以上盛らない」の指定（デフォルト3200=制限なし）。
   */
  maxStats?: Record<TypeKey, number>;
  /** H.I.F.の評価値の固定部分（ワッペン・本戦） */
  wappenCount: number;
  round1: number;
  round2: number;
};

export type SteppingResult = {
  hif?: {
    lessons: LessonPick[];
    classTypes: TypeKey[];
    examScores: ExamScores[];
  };
  nia?: { lessons: NiaLessonPick[]; sales: NiaSalePick[] };
  hatsu?: { lessons: HatsuLessonPick[]; classTypes: TypeKey[] };
};

export type AutoOptimizeResult = SteppingResult & {
  /** 理想編成（選択サポカへ適用する） */
  slots: SelectedSlot[];
  /** 理論評価値（適用後に計算ページで出る値と同じ計算） */
  rating: number;
  cappedSum: number;
  spShortfall: number;
  /** 探索で評価した踏み方の候補数（シード＋山登りの試行） */
  evaluated: number;
  elapsedMs: number;
  /**
   * イベント予算で「発動しない」ことにした前イベ・後イベのカード別設定
   * （取得OFF / 前イベ回数の削減 / 後イベ✕）。計算ページのイベント設定へ適用する。
   */
  eventOps?: { id: string; pre?: number; acquire?: false; post?: 0 }[];
  /** 探索の内訳（/debug でどう選ばれたかを開示するため） */
  debug?: OptimizeDebug;
};

/** /debug 用: 探索の起点・勝ち踏み方・候補プール・採用理由 */
export type OptimizeDebug = {
  /** 起点数（固定9） */
  starts: number;
  /** 全起点合わせて評価した踏み方の候補数 */
  evaluated: number;
  /** 各起点から焼きなましで到達したスコア（初期値非依存・ばらつきの確認用） */
  startScores: number[];
  /**
   * フェーズ別の到達スコア。
   * starts=9起点の交互反復後 / polish=踏み方の詰め直し後 /
   * refine=仕上げの相互詰め直し（選抜細分配・結合手・リスタート）後。
   */
  phaseScores: { starts: number; polish: number; refine: number };
  /** 勝ち踏み方のレッスン詳細（HIFのみ。main=null は踏まない） */
  lessonDetail:
    | {
        label: string;
        main: TypeKey | null;
        sub: TypeKey;
        sp: boolean;
      }[]
    | null;
  /** 勝ち踏み方の選抜スコア実配分（HIFのみ） */
  examDetail:
    | { name: string; vocal: number; dance: number; visual: number }[]
    | null;
  /** 勝ち踏み方の要約（HIF: メイン枚数・授業枚数・選抜の寄せ先） */
  stepping: {
    lessonMains: Record<TypeKey, number>;
    classTypes: Record<TypeKey, number>;
    examBias: (TypeKey | "均等")[];
  } | null;
  /** 勝ち踏み方での理想編成の組まれ方（候補プール＋採用理由） */
  formation: {
    ownedCount: number;
    rentalCount: number;
    /** タイプ別の所持カード上位（点数順） */
    topOwned: Record<
      TypeKey,
      { name: string; points: number; hasSpUp: boolean; picked: boolean }[]
    >;
    /** 採用6枚（点数＋シナジー＋イベント上乗せ） */
    picks: {
      id: string;
      name: string;
      type: TypeKey;
      /** アシスト（トレーナー）カードか（表示は「アシスト」にする） */
      assist: boolean;
      level: number;
      rental: boolean;
      points: number;
      synergy: number;
      eventContrib: Record<string, number>;
    }[];
  } | null;
};

/**
 * ある踏み方で決まる「サポカ抜きの土台」。踏み方を変えるたびに作り直す。
 * - ctx: シート式の計算コンテキスト（発動回数・パラボ母数）
 * - baseNoConv: パラボ変換前のタイプ別ステ（授業・レッスン・選抜・メモリー・Pアイドル）
 * - basePct: サポカ抜きのパラボ%（メモリー＋Pアイドル＋基礎10%）
 * - baseStats: 理想編成を選ぶときの土台（baseNoConv＋パラボ変換）
 */
type Ectx = {
  ctx: SheetScoreContext;
  baseNoConv: Record<TypeKey, number>;
  basePct: Record<TypeKey, number>;
  baseStats: Record<TypeKey, number>;
};

/**
 * 踏み方（レッスン・授業・選抜）と理想編成をまとめて探索する本体。
 * 固定9起点から「踏み方⇄編成」を交互反復し、最後に勝ち編成の踏み方を詰め直す。
 * 結果はそのまま計算ページの各ストアへ適用できる形で返す。
 */
export function runFullOptimize(
  input: AutoOptimizeInput,
): AutoOptimizeResult | null {
  const t0 = performance.now();
  const engine = new OptimizeEngine(input);
  const finalDeadline = t0 + TIME_BUDGET_MS;
  // 広域探索は時間の一部で切り上げ、残りを仕上げの詰め直しに確保する
  engine.deadline = t0 + TIME_BUDGET_MS * MAIN_PHASE_RATIO;

  // 「踏み方⇄編成」の交互反復を、初期値非依存の固定9起点から回す。
  // 各起点で焼きなまし法により局所解を脱出する（乱数はシード非固定）。
  let best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  } | null = null;
  const startScores: number[] = [];
  for (const start of engine.startCandidates()) {
    // 1起点は必ず回すが、以降は時間上限を超えたら打ち切る
    if (best && performance.now() > engine.deadline) break;
    const settled = engine.alternate(start);
    if (!settled) continue;
    startScores.push(Math.round(settled.score));
    if (!best || settled.score > best.score) best = settled;
  }
  if (!best) return null;
  const scoreAfterStarts = best.score;

  // 勝った編成に対して踏み方を9起点から入念に詰め直す（交互反復の取りこぼしを補う）。
  const polished = engine.optimizeStepping(best.slots);
  if (polished && polished.score > best.score) {
    best.stepping = polished.stepping;
    best.score = polished.score;
  }
  const scoreAfterPolish = best.score;

  // 仕上げ: 残り時間で「選抜スコアの細分配 ⇄ 編成の組み直し ⇄ 踏み方の山登り」を
  // 収束するまで相互に詰め、まだ余れば焼きなましリスタートで局所解の脱出を試みる。
  engine.deadline = finalDeadline;
  best = engine.refineLoop(best);
  const phaseScores = {
    starts: Math.round(scoreAfterStarts),
    polish: Math.round(scoreAfterPolish),
    refine: Math.round(best.score),
  };

  // ---- イベント予算の離散割り当て ----
  // 探索中は比例配分の近似で評価していたが、最終結果では「どのカードのイベントを
  // 発動させるか」を価値の高い順に割り当てて、カード別の設定（取得OFF・✕など）として返す。
  let eventOps: AutoOptimizeResult["eventOps"];
  let finalEngine = engine;
  if (input.eventBudget) {
    const alloc = engine.allocateEvents(best.stepping, best.slots);
    eventOps = alloc.ops;
    // 割り当てを適用した状態で最終評価（設定適用後の計算ページ表示と一致させる）
    finalEngine = new OptimizeEngine({
      ...input,
      eventBudget: undefined,
      eventCounts: alloc.eventCounts,
    });
  }

  // ---- 最終評価値の算出（勝者のみ・計算ページと同じ式） ----
  // 試験補助の加点（examAssist）は探索専用なので、表示する評価値からは外す
  const ectx = finalEngine.buildEctx(best.stepping);
  const { cappedSum, members } = finalEngine.preciseObjective(
    best.slots,
    ectx,
    true,
  );
  const rating = finalEngine.fullRating(best.stepping, cappedSum, members);

  return {
    ...engine.toSteppingResult(best.stepping),
    slots: best.slots,
    rating: Math.round(rating),
    cappedSum,
    spShortfall: best.spShortfall,
    evaluated: engine.evaluated,
    elapsedMs: performance.now() - t0,
    eventOps,
    debug: finalEngine.buildDebug(
      best.stepping,
      best.slots,
      startScores,
      phaseScores,
    ),
  };
}

/**
 * 踏み方だけの広域探索（編成は固定）。
 * レッスンページの「選択サポカで踏み方を最適化」ボタン用。
 */
export function optimizeSteppingForSlots(
  input: AutoOptimizeInput,
  slots: SelectedSlot[],
): (SteppingResult & { cappedSum: number }) | null {
  const t0 = performance.now();
  const engine = new OptimizeEngine(input);
  const finalDeadline = t0 + TIME_BUDGET_MS;
  engine.deadline = t0 + TIME_BUDGET_MS * 0.9;
  let best = engine.optimizeStepping(slots);
  if (!best) return null;
  // 仕上げ: 選抜スコアの細分配（上限ちょうどへの寄せ）
  engine.deadline = finalDeadline;
  const fine = engine.refineExams(slots, best.stepping, best.score);
  if (fine && fine.score > best.score) best = fine;
  const ectx = engine.buildEctx(best.stepping);
  const { cappedSum } = engine.preciseObjective(slots, ectx);
  return { ...engine.toSteppingResult(best.stepping), cappedSum };
}

/**
 * 探索の実装本体（入力を束ねて使い回すためのクラス）。
 * メソッドは次の順に並べている:
 * 1. 起点づくり  : initialStepping / toSteppingResult / startCandidates
 * 2. 探索        : alternate / optimizeStepping / searchStepping
 * 3. 評価        : buildEctx / preciseObjective / preciseMembers
 * 4. 編成・仕上げ: allocateEvents / buildFormation / fullRating / buildDebug
 * 踏み方そのものの定義と局所探索は optimize/stepping.ts・optimize/anneal.ts 側。
 * export は開発検証用（devHarness）。アプリからは runFullOptimize 経由で使う。
 */
export class OptimizeEngine {
  evaluated = 0;
  /** この時刻を過ぎたら新しい起点・ラウンドを始めない（探索時間の上限） */
  deadline = Infinity;
  private extraScore?: (cards: ScoredCard[]) => number;
  private votesBase = 0;
  private fudaBase = 0;
  /** 最低ステータス条件（審査基準の高いタイプから優先して満たす） */
  private minStatCond?: MinStatCondition;
  /** パラボ追従メモリーの展開結果キャッシュ（割当は高々6通り） */
  private memCache = new Map<
    string,
    { fixed: Record<TypeKey, number>; pct: Record<TypeKey, number> }
  >();
  /** タイプ別のステ上限（シナリオ上限。評価値はここまで全額入る） */
  private caps: Record<TypeKey, number>;
  /**
   * 最高ステ設定のソフト上限（min(シナリオ上限, 設定値)）。
   * 超過分は評価値から削らず、探索の価値だけ MAX_STAT_EXCESS_WEIGHT へ割り引く
   * （わざわざ積みに行かない・溢れ込みを選抜の微調整で削りにも行かない）。
   */
  private maxTargets: Record<TypeKey, number>;

  constructor(private input: AutoOptimizeInput) {
    this.caps = {
      vocal: input.statCap,
      dance: input.statCap,
      visual: input.statCap,
    };
    this.maxTargets = {
      vocal: Math.min(input.statCap, input.maxStats?.vocal || input.statCap),
      dance: Math.min(input.statCap, input.maxStats?.dance || input.statCap),
      visual: Math.min(input.statCap, input.maxStats?.visual || input.statCap),
    };
    const req = input.minStats;
    if (req && TYPE_KEYS.some((t) => (req[t] ?? 0) > 0)) {
      this.minStatCond = {
        req: { vocal: req.vocal ?? 0, dance: req.dance ?? 0, visual: req.visual ?? 0 },
        priority: [...TYPE_KEYS].sort(
          (a, b) => input.ranks[a] - input.ranks[b],
        ),
      };
    }
    // NIAの固定部分（踏み方・編成で変わらない投票と、札のステ換算）
    if (input.scenario === "niaMaster") {
      this.votesBase = computeNiaGains(input.nia, input.tag, input.ranks).votes
        .base;
      this.fudaBase = input.manual("スキル獲得") ?? 0;
      this.extraScore = (cards) => {
        const withVotes =
          this.votesBase +
          niaFudaVotes(this.fudaBase + this.supportFudaOf(cards));
        const without = this.votesBase + niaFudaVotes(this.fudaBase);
        return (niaFanValue(withVotes) - niaFanValue(without)) / NIA_PARAM_RATE;
      };
    }
  }

  supportFudaOf(cards: ScoredCard[]): number {
    // 札は前イベ（スキル獲得）由来なので、合計発動回数の予算で同率に目減りする
    const scale = eventBudgetScales(cards, this.input.eventBudget).pre;
    return (
      cards.reduce((sum, m) => sum + (m.preContrib["スキル獲得"] ?? 0), 0) *
      scale
    );
  }

  initialStepping(): Stepping {
    const { scenario, nia, hatsu, hif } = this.input;
    if (scenario === "niaMaster") {
      return {
        kind: "nia",
        lessons: nia.lessons.map((l) => ({ ...l })),
        sales: nia.sales.map((s) => ({ ...s })),
      };
    }
    if (scenario === "hatsuLegend") {
      return {
        kind: "hatsu",
        lessons: hatsu.lessons.map((l) => ({ ...l })),
        classTypes: [...hatsu.classTypes],
      };
    }
    return {
      kind: "hif",
      lessons: hif.lessons.map((l) => ({ ...l })),
      classTypes: [...hif.classTypes],
      examScores: hif.examScores.map((e) => ({ ...e })),
    };
  }

  toSteppingResult(s: Stepping): SteppingResult {
    if (s.kind === "nia") return { nia: { lessons: s.lessons, sales: s.sales } };
    if (s.kind === "hatsu")
      return { hatsu: { lessons: s.lessons, classTypes: s.classTypes } };
    return {
      hif: {
        lessons: s.lessons,
        classTypes: s.classTypes,
        examScores: s.examScores,
      },
    };
  }

  /**
   * 交互反復の起点一覧（初期の踏み方には依存しない固定の格子）。
   * 「レッスン偏重 Vo/Da/Vi」×「授業/営業 寄せ Vo/Da/Vi」の9起点。
   * 現在の踏み方は起点に含めない（事前の踏み方に結果が左右されないように）。
   */
  startCandidates(): Stepping[] {
    const base = this.initialStepping();
    const pairs: [TypeKey, TypeKey][] = [];
    for (const lessonType of TYPE_KEYS) {
      for (const secondType of TYPE_KEYS) {
        pairs.push([lessonType, secondType]);
      }
    }
    // 途中打ち切りでも3タイプが均等に試されるよう同タイプの組を先頭へ
    pairs.sort((a, b) => Number(a[0] !== a[1]) - Number(b[0] !== b[1]));
    return pairs.map(([lessonType, secondType]) =>
      uniformStepping(base, lessonType, secondType),
    );
  }

  /**
   * 1起点分の「踏み方の広域探索 ⇄ 編成組み直し」を改善が止まるまで反復する。
   */
  alternate(start: Stepping): {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  } | null {
    let stepping = start;
    let ectx = this.buildEctx(stepping);
    const first = this.buildFormation(ectx);
    if (!first) return null;
    let slots = first.picks.map((p) => ({ id: p.id, rental: p.rental }));
    let spShortfall = first.spShortfall;
    let score = this.preciseObjective(slots, ectx).obj;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (round > 0 && performance.now() > this.deadline) break;
      let improved = false;
      const searched = this.searchStepping(slots, stepping);
      if (searched.score > score + 1e-9) {
        stepping = searched.stepping;
        score = searched.score;
        improved = true;
      }
      ectx = this.buildEctx(stepping);
      const formation = this.buildFormation(ectx);
      if (formation) {
        const newSlots = formation.picks.map((p) => ({
          id: p.id,
          rental: p.rental,
        }));
        const { obj } = this.preciseObjective(newSlots, ectx);
        if (obj > score + 1e-9) {
          slots = newSlots;
          score = obj;
          spShortfall = formation.spShortfall;
          improved = true;
        }
      }
      if (!improved) break;
    }
    return { stepping, slots, score, spShortfall };
  }

  /**
   * 編成を固定して踏み方（レッスン・授業・選抜）を最適化する。
   * 初期値非依存の固定9起点それぞれから焼きなまし＋山登りし、一番良い踏み方を返す。
   * 現在の踏み方は起点に含めない（事前の踏み方に結果が左右されないように）。
   */
  optimizeStepping(
    slots: SelectedSlot[],
  ): { stepping: Stepping; score: number } | null {
    let best: { stepping: Stepping; score: number } | null = null;
    for (const start of this.startCandidates()) {
      if (best && performance.now() > this.deadline) break;
      const searched = this.searchStepping(slots, start);
      if (!best || searched.score > best.score) best = searched;
    }
    return best;
  }

  /**
   * 踏み方の広域探索（編成固定）。
   * 全シード（現在＋一様＋タイプ別枚数の全分割）を評価 → 上位を焼きなましで詰める。
   */
  searchStepping(
    slots: SelectedSlot[],
    current: Stepping,
  ): { stepping: Stepping; score: number } {
    const evalOf = (s: Stepping) =>
      this.preciseObjective(slots, this.buildEctx(s)).obj;

    const scored = buildSeeds(current)
      .map((s) => ({ stepping: s, score: evalOf(s) }))
      .sort((a, b) => b.score - a.score);

    let best = scored[0];
    for (const seed of scored.slice(0, SA_STARTS)) {
      const annealed = annealStepping(
        seed.stepping,
        seed.score,
        evalOf,
        this.deadline,
      );
      if (annealed.score > best.score) best = annealed;
    }
    return best;
  }

  /**
   * 選抜スコアの細分配（HIFのみ）。
   * 広域探索の粗い分配格子では拾えない「上限3200ちょうどへの寄せ」を、
   * 細かい整数比（EXAM_RATIOS_FINE）の座標降下で詰める。
   */
  refineExams(
    slots: SelectedSlot[],
    start: Stepping,
    startScore: number,
  ): { stepping: Stepping; score: number } | null {
    if (start.kind !== "hif") return null;
    const evalOf = (s: Stepping) =>
      this.preciseObjective(slots, this.buildEctx(s)).obj;
    let current = start;
    let score = startScore;
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (let i = 0; i < current.examScores.length; i++) {
        if (performance.now() > this.deadline)
          return { stepping: current, score };
        for (const ratio of EXAM_RATIOS_FINE) {
          const e = examScoresFromRatio(i, ratio);
          if (sameExamScores(e, current.examScores[i])) continue;
          const trial: Stepping = {
            ...current,
            examScores: current.examScores.map((x, j) => (j === i ? e : x)),
          };
          const trialScore = evalOf(trial);
          if (trialScore > score + 1e-9) {
            current = trial;
            score = trialScore;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    return { stepping: current, score };
  }

  /**
   * 「レッスン1箇所の変更」と「編成の組み直し」を同時に試す結合手。
   * 交互反復（踏み方⇄編成）は片方ずつしか動かせないため、
   * 「あるタイプが上限で溢れていて、レッスンを1つ逃がすと別のカードが勝つ」
   * ような解に到達できない。ここではレッスン軸の全代替それぞれで編成を
   * 組み直して同時評価し、改善が見つかり次第 best を更新して true を返す。
   *
   * 第2パスでは選抜スコアの「単タイプ全寄せ」も同時に変える（HIFのみ）。
   * レッスン変更だけ・選抜寄せだけ・編成組み直しだけではどれも悪化するのに、
   * 3点同時なら勝つ谷（例: DaViセンスの「レッスン1つVi化＋選抜全Vi＋
   * ドリンク型カードへ差し替え」）はこのパスでしか越えられない。
   */
  private jointLessonFormationMove(best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  }): boolean {
    const lessonCount = best.stepping.lessons.length;
    // steppingAxes は先頭 lessonCount 個がレッスン軸（stepping.ts の構築順）
    const lessonAxes = steppingAxes(best.stepping).slice(0, lessonCount);
    const tryTrial = (trial: Stepping): boolean => {
      const ectx = this.buildEctx(trial);
      const formation = this.buildFormation(ectx);
      if (!formation) return false;
      const slots = formation.picks.map((p) => ({
        id: p.id,
        rental: p.rental,
      }));
      const { obj } = this.preciseObjective(slots, ectx);
      if (obj > best.score + 1e-9) {
        best.stepping = trial;
        best.slots = slots;
        best.score = obj;
        best.spShortfall = formation.spShortfall;
        return true;
      }
      return false;
    };
    // 第1パス: レッスン軸のみ変更（選抜は現状のまま）
    for (const axis of lessonAxes) {
      for (const trial of axis.alternatives(best.stepping)) {
        if (performance.now() > this.deadline) return false;
        if (tryTrial(trial)) return true;
      }
    }
    // 第2パス: レッスン1箇所のメイン変更＋全選抜の単タイプ寄せを同時に試す。
    // こちらは最良改善（全候補を見て一番良い組を採用）。第1パスと違い
    // 「どの日をオフタイプにするか」で数点変わるため、最初に見つかった改善で
    // 確定すると劣った位置に固まってしまう。サブは「他レッスンで最多のメイン
    // タイプ」で仮置きし、細部は後続の山登り・入れ替え手に任せる
    // （サブの全組まで試すと編成組み直しが倍増して時間切れしやすい）。
    if (best.stepping.kind !== "hif") return false;
    const cur = best.stepping;
    const mainCounts: Record<TypeKey, number> = {
      vocal: 0,
      dance: 0,
      visual: 0,
    };
    for (const l of cur.lessons) if (l.main) mainCounts[l.main]++;
    let bestTrial: {
      stepping: Stepping;
      slots: SelectedSlot[];
      score: number;
      spShortfall: number;
    } | null = null;
    for (let i = 0; i < cur.lessons.length; i++) {
      const li = cur.lessons[i];
      for (const newMain of TYPE_KEYS) {
        if (newMain === li.main) continue;
        const sub = TYPE_KEYS.filter((t) => t !== newMain).sort(
          (a, b) => mainCounts[b] - mainCounts[a],
        )[0];
        const lessons = cur.lessons.map((l, j) =>
          j === i ? { ...l, main: newMain, sub } : l,
        );
        // 寄せ先はその踏み方でメインに使うタイプだけ（無関係な寄せは無駄撃ち）
        const mains = new Set(lessons.map((l) => l.main));
        for (const type of TYPE_KEYS) {
          if (!mains.has(type)) continue;
          if (performance.now() > this.deadline) break;
          const ratio: [number, number, number] = [
            type === "vocal" ? 1 : 0,
            type === "dance" ? 1 : 0,
            type === "visual" ? 1 : 0,
          ];
          const exams = cur.examScores.map((_, k) =>
            examScoresFromRatio(k, ratio),
          );
          if (
            exams.every((e, k) => sameExamScores(e, cur.examScores[k])) &&
            lessons[i].main === li.main
          )
            continue;
          const s: Stepping = { ...cur, lessons, examScores: exams };
          const ectx = this.buildEctx(s);
          const formation = this.buildFormation(ectx);
          if (!formation) continue;
          const slots = formation.picks.map((p) => ({
            id: p.id,
            rental: p.rental,
          }));
          const { obj } = this.preciseObjective(slots, ectx);
          if (obj > (bestTrial?.score ?? best.score) + 1e-9) {
            bestTrial = {
              stepping: s,
              slots,
              score: obj,
              spShortfall: formation.spShortfall,
            };
          }
        }
      }
    }
    if (bestTrial) {
      best.stepping = bestTrial.stepping;
      best.slots = bestTrial.slots;
      best.score = bestTrial.score;
      best.spShortfall = bestTrial.spShortfall;
      return true;
    }
    return false;
  }

  /**
   * レッスン2日分の踏み方（メイン/サブ/SP）をまるごと入れ替える2軸手。
   * 日ごとの獲得量が違うため「どの日をオフタイプにするか」で数点変わるが、
   * 1軸ずつの山登りでは中間状態が悪化して越えられない。編成固定なので速い。
   */
  private swapLessonPicks(best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
  }): boolean {
    const swapAt = <T,>(arr: readonly T[], i: number, j: number): T[] => {
      const out = arr.slice();
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
      return out;
    };
    let improved = false;
    for (let pass = 0; pass < 3; pass++) {
      let roundImproved = false;
      const n = best.stepping.lessons.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (performance.now() > this.deadline) return improved;
          const cur = best.stepping;
          if (JSON.stringify(cur.lessons[i]) === JSON.stringify(cur.lessons[j]))
            continue;
          const trial: Stepping =
            cur.kind === "hif"
              ? { ...cur, lessons: swapAt(cur.lessons, i, j) }
              : cur.kind === "nia"
                ? { ...cur, lessons: swapAt(cur.lessons, i, j) }
                : { ...cur, lessons: swapAt(cur.lessons, i, j) };
          const { obj } = this.preciseObjective(
            best.slots,
            this.buildEctx(trial),
          );
          if (obj > best.score + 1e-9) {
            best.stepping = trial;
            best.score = obj;
            improved = roundImproved = true;
          }
        }
      }
      if (!roundImproved) break;
    }
    return improved;
  }

  /**
   * 仕上げの相互詰め直し。勝ち解に対して
   * 1) 選抜スコアの細分配 → 2) 踏み方の山登り＋レッスン日の入れ替え
   * → 3) 編成の組み直し → 4) レッスン×編成の結合手（改善が無いときだけ）
   * を収束するまで反復し、時間が余れば焼きなましリスタートで局所解の脱出を試みる。
   * （「レッスンを1タイプに寄せてサポカも寄せる」ような結合解はこの反復で詰まる）
   */
  refineLoop(best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  }): {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  } {
    const evalWith = (slots: SelectedSlot[]) => (s: Stepping) =>
      this.preciseObjective(slots, this.buildEctx(s)).obj;

    for (let round = 0; round < 6; round++) {
      if (performance.now() > this.deadline) break;
      let changed = false;

      const fine = this.refineExams(best.slots, best.stepping, best.score);
      if (fine && fine.score > best.score + 1e-9) {
        best.stepping = fine.stepping;
        best.score = fine.score;
        changed = true;
      }

      const climbed = climbStepping(
        best.stepping,
        best.score,
        evalWith(best.slots),
        this.deadline,
      );
      if (climbed.score > best.score + 1e-9) {
        best.stepping = climbed.stepping;
        best.score = climbed.score;
        changed = true;
      }

      if (this.swapLessonPicks(best)) changed = true;

      const ectx = this.buildEctx(best.stepping);
      const formation = this.buildFormation(ectx);
      if (formation) {
        const slots = formation.picks.map((p) => ({
          id: p.id,
          rental: p.rental,
        }));
        const { obj } = this.preciseObjective(slots, ectx);
        if (obj > best.score + 1e-9) {
          best.slots = slots;
          best.score = obj;
          best.spShortfall = formation.spShortfall;
          changed = true;
        }
      }
      // 片方ずつの改善が尽きたら、レッスン変更＋編成組み直しの同時手を試す
      if (!changed && !this.jointLessonFormationMove(best)) break;
    }

    // 余り時間で焼きなましリスタート（改善したら編成・選抜も追い詰め直す）。
    // 焼きなましは確率的なので、1回外れても数回は再挑戦して時間を使い切る。
    let misses = 0;
    while (performance.now() < this.deadline - 150 && misses < 3) {
      const searched = this.searchStepping(best.slots, best.stepping);
      if (searched.score <= best.score + 1e-9) {
        misses++;
        continue;
      }
      misses = 0;
      best.stepping = searched.stepping;
      best.score = searched.score;
      const fine = this.refineExams(best.slots, best.stepping, best.score);
      if (fine && fine.score > best.score + 1e-9) {
        best.stepping = fine.stepping;
        best.score = fine.score;
      }
      const ectx = this.buildEctx(best.stepping);
      const formation = this.buildFormation(ectx);
      if (formation) {
        const slots = formation.picks.map((p) => ({
          id: p.id,
          rental: p.rental,
        }));
        const { obj } = this.preciseObjective(slots, ectx);
        if (obj > best.score + 1e-9) {
          best.slots = slots;
          best.score = obj;
          best.spShortfall = formation.spShortfall;
        }
      }
    }
    return best;
  }

  /** 踏み方から計算コンテキスト・メモリー展開・サポカ抜き基礎ステを作る */
  buildEctx(s: Stepping): Ectx {
    const { input } = this;
    let bd: Record<"lessons" | "classes" | "exams", Record<TypeKey, number>>;
    let ctx: SheetScoreContext;
    if (s.kind === "hif") {
      const state = {
        lessons: s.lessons,
        classTypes: s.classTypes,
        examScores: s.examScores,
      };
      const sched = computeScheduleGains(state);
      bd = sched.breakdown;
      ctx = buildSheetScoreContext(state, input.manual, input.eventCounts);
    } else if (s.kind === "nia") {
      const state: NiaStateLike = {
        ...input.nia,
        lessons: s.lessons,
        sales: s.sales,
      };
      const g = computeNiaGains(state, input.tag, input.ranks);
      bd = g.breakdown;
      ctx = buildNiaScoreContext(
        state,
        input.manual,
        input.eventCounts,
        input.tag,
        input.ranks,
      );
    } else {
      const state: HatsuStateLike = {
        ...input.hatsu,
        lessons: s.lessons,
        classTypes: s.classTypes,
      };
      const g = computeHatsuGains(state);
      bd = g.breakdown;
      ctx = buildHatsuScoreContext(state, input.manual, input.eventCounts);
    }

    // パラボ追従メモリーは踏み方から決まる割当で展開（踏み方を変えると付け替わる）。
    // 割当は高々6通り（メイン2タイプの選び方）なので展開結果をキャッシュする。
    const assign = paraboAssignFromGains(ctx.gains);
    const memKey = `${assign.mains[0]} ${assign.mains[1]}`;
    let memTotals = this.memCache.get(memKey);
    if (!memTotals) {
      const mem = calcMemoryTotals(
        input.memories.map((m) => m && resolveParaboMemory(m, assign)),
      );
      memTotals = {
        fixed: { vocal: mem.Vo.flat, dance: mem.Da.flat, visual: mem.Vi.flat },
        pct: {
          vocal: mem.Vo.percent,
          dance: mem.Da.percent,
          visual: mem.Vi.percent,
        },
      };
      this.memCache.set(memKey, memTotals);
    }
    const memFixed = memTotals.fixed;
    const memPct = memTotals.pct;

    // HIFの授業は最適充填する（踏み方に依らない）ので、理想編成の選定に使う baseStats では
    const baseNoConv = {} as Record<TypeKey, number>;
    const basePct = {} as Record<TypeKey, number>;
    const baseStats = {} as Record<TypeKey, number>;
    for (const type of TYPE_KEYS) {
      basePct[type] =
        memPct[type] + (input.pStats?.parabo[type] ?? 0) + 10;
      baseNoConv[type] =
        bd.classes[type] +
        memFixed[type] +
        (input.pStats?.fixed[type] ?? 0) +
        100 +
        bd.lessons[type] +
        bd.exams[type];
      const g = ctx.gains[TYPE_SHEET_ROLE[type]];
      baseStats[type] =
        baseNoConv[type] +
        paraboConvert(basePct[type] / 100, g.lessons, g.exams);
    }
    return { ctx, baseNoConv, basePct, baseStats };
  }

  /**
   * 編成を固定して正確に評価（合算パラボ・上限・NIA札・イベント予算込み）。
   * @param forReport true なら「試験補助を強める」の加点を外して
   *   実際のステ・評価値を返す（探索用の目的関数と表示値を分離する）。
   */
  preciseObjective(
    slots: SelectedSlot[],
    ectx: Ectx,
    forReport = false,
  ): {
    obj: number;
    cappedSum: number;
    members: ScoredCard[];
    stats: Record<TypeKey, number>;
  } {
    const members = scoreSelectedCards(
      slots,
      this.input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
    ).filter((m): m is ScoredCard => m !== null);
    return this.preciseMembers(members, ectx, forReport);
  }

  /**
   * スコア済みカード列を正確に評価する。評価値は素直に Σmin(上限, タイプ別ステ)。
   * 溢れた分は上限で頭打ちになるだけでペナルティは無い（溢れても合計が高ければ良い）。
   * obj には最低ステ条件のボーナスとSP条件のペナルティも含める。
   */
  preciseMembers(
    members: ScoredCard[],
    ectx: Ectx,
    forReport = false,
  ): {
    obj: number;
    cappedSum: number;
    members: ScoredCard[];
    stats: Record<TypeKey, number>;
  } {
    this.evaluated++;
    const budget = this.input.eventBudget;
    const team = evaluateTeam(members, ZERO_STATS, this.caps, budget);
    const adj = summedParaboByType(
      members,
      team.synergies,
      ectx.ctx,
      TYPE_SHEET_ROLE,
      ectx.basePct,
      team.synergiesByType,
    );
    // 前イベが予算で目減りする分、アイテム補正も同率で引く
    const scales = eventBudgetScales(members, budget);
    const itemCut: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    if (scales.pre < 1) {
      for (const m of members) {
        itemCut[m.type] += (1 - scales.pre) * m.itemBonus;
      }
    }
    let cappedSum = 0;
    let excess = 0;
    const stats: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    for (const type of TYPE_KEYS) {
      stats[type] = Math.min(
        this.caps[type],
        ectx.baseNoConv[type] +
          adj[type].support +
          adj[type].conv -
          itemCut[type],
      );
      cappedSum += stats[type];
      excess += Math.max(0, stats[type] - this.maxTargets[type]);
    }
    const obj =
      cappedSum -
      // 最高ステ設定の超過分は探索価値を割り引く（評価値からは削らない）
      (1 - MAX_STAT_EXCESS_WEIGHT) * excess +
      (this.extraScore ? this.extraScore(members) : 0) +
      // 試験補助の加点は探索の目的関数のみ。表示・評価値には足さない
      (!forReport && this.input.examAssist
        ? examAssistSum(members, this.input.examStyleTags)
        : 0) +
      minStatBonus(stats, this.minStatCond) -
      spConditionShortfall(members, this.input.spMin) * SP_PENALTY;
    return { obj, cappedSum, members, stats };
  }

  /**
   * イベント予算の離散割り当て。
   * 前イベは取得回数（カード1枚=1）、後イベは発動回数を予算とし、価値
   * （編成の受け手アビリティ効果量×寄与＋アイテム補正＋NIA札）が高いカードから
   * 予算ぶんだけ発動させ、残りは前イベ=「取得OFF」・後イベ=「✕」の設定にする。
   */
  allocateEvents(
    stepping: Stepping,
    slots: SelectedSlot[],
  ): {
    ops: NonNullable<AutoOptimizeResult["eventOps"]>;
    eventCounts: SheetScoreContext["eventCounts"];
  } {
    const ectx = this.buildEctx(stepping);
    const members = scoreSelectedCards(
      slots,
      this.input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
    ).filter((m): m is ScoredCard => m !== null);
    // 回数キーごとの受け手側の効果量合計（発動1回の価値の目安）
    const teamValue: Record<string, number> = {};
    for (const m of members) {
      for (const key in m.valuesByKey) {
        teamValue[key] = (teamValue[key] ?? 0) + m.valuesByKey[key];
      }
    }
    // NIA: 札1枚あたりの評価値（ステ換算・2枚3000票の平均値）
    const fudaUnit =
      this.input.scenario === "niaMaster"
        ? (niaFanValue(this.votesBase + niaFudaVotes(this.fudaBase) + 3000) -
            niaFanValue(this.votesBase + niaFudaVotes(this.fudaBase))) /
          2 /
          NIA_PARAM_RATE
        : 0;
    const budget = this.input.eventBudget!;

    // 前イベ: 取得回数（カード1枚=1）ベースで配分。価値の高いカードから
    // 予算枚数だけ「取得」し、残りは取得OFF。取得すれば発動回数はそのまま。
    const preAcquire = new Set<string>();
    let remainingPre = budget.pre ?? Infinity;
    members
      .filter((m) => m.preActs > 0)
      .map((m) => {
        // このカードの前イベ全体の価値（発動回数ぶんすべて合算）
        let value = m.itemBonus;
        for (const key in m.preContrib) {
          value += m.preContrib[key] * (teamValue[key] ?? 0);
          if (key === "スキル獲得") value += m.preContrib[key] * fudaUnit;
        }
        return { m, value };
      })
      .sort((a, b) => b.value - a.value)
      .forEach(({ m }) => {
        if (remainingPre >= 1) {
          preAcquire.add(m.id);
          remainingPre -= 1;
        }
      });

    // 後イベ: 価値が高いカードから予算までON（各カード0/1）
    const postOn = new Set<string>();
    let remainingPost = budget.post ?? Infinity;
    members
      .filter((m) => m.postActs > 0)
      .map((m) => {
        let unit = 0;
        for (const key in m.postContrib) {
          unit += m.postContrib[key] * (teamValue[key] ?? 0);
        }
        return { m, unit };
      })
      .sort((a, b) => b.unit - a.unit)
      .forEach(({ m }) => {
        if (remainingPost >= m.postActs) {
          postOn.add(m.id);
          remainingPost -= m.postActs;
        }
      });

    // 現状から減る分だけ設定として出力
    const ops: NonNullable<AutoOptimizeResult["eventOps"]> = [];
    for (const m of members) {
      const op: { id: string; pre?: number; acquire?: false; post?: 0 } = {
        id: m.id,
      };
      let changed = false;
      if (m.preActs > 0 && !preAcquire.has(m.id)) {
        op.acquire = false;
        changed = true;
      }
      if (m.postActs > 0 && !postOn.has(m.id)) {
        op.post = 0;
        changed = true;
      }
      if (changed) ops.push(op);
    }

    // 割り当て適用後の eventCounts（最終評価と計算ページ表示を一致させるため）
    const patchById = new Map(ops.map((op) => [op.id, op]));
    const baseCounts = this.input.eventCounts;
    const eventCounts: SheetScoreContext["eventCounts"] = (id) => {
      const base = baseCounts?.(id);
      const patch = patchById.get(id);
      if (!patch) return base;
      const merged = { ...(base ?? {}) };
      if (patch.acquire !== undefined) merged.acquire = patch.acquire;
      if (patch.pre !== undefined) merged.pre = patch.pre;
      if (patch.post !== undefined) merged.post = patch.post;
      return merged;
    };
    return { ops, eventCounts };
  }

  /** 理想編成を1回組む（現在の踏み方前提） */
  buildFormation(ectx: Ectx) {
    const { input } = this;
    const opts = {
      flags: input.flags,
      plan: input.plan,
      noStageItems: input.noStageItems,
    };
    const owned = scoreOwnedCards(
      input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
      opts,
    );
    const rentals = scoreRentalCandidates(ectx.ctx, TYPE_SHEET_ROLE, opts);
    return findBestFormation(owned, rentals, ectx.baseStats, {
      pinned: input.flags.pinned,
      spMin: input.spMin,
      cap: this.caps,
      maxTargets: this.maxTargets,
      eventBudget: input.eventBudget,
      extraScore: this.extraScore,
      examAssist: input.examAssist,
      examStyleTags: input.examStyleTags,
      typeCounts: input.typeRatio
        ? typeCountsFromRatio(input.typeRatio)
        : undefined,
      minStat: this.minStatCond,
    });
  }


  /** 最終的な評価値（計算ページと同じ式・シナリオ別の固定部分込み） */
  fullRating(
    stepping: Stepping,
    cappedSum: number,
    members: ScoredCard[],
  ): number {
    const { input } = this;
    if (input.scenario === "niaMaster") {
      const totalVotes =
        this.votesBase +
        niaFudaVotes(this.fudaBase + this.supportFudaOf(members));
      return Math.floor(cappedSum * NIA_PARAM_RATE) + niaFanValue(totalVotes);
    }
    if (input.scenario === "hatsuLegend") {
      return (
        Math.floor(cappedSum * HATSU_PARAM_RATE) +
        (HATSU_RANK_VALUES[input.hatsu.finalRank - 1] ?? 0) +
        hatsuExamValue(0, input.hatsu.midScore) +
        hatsuExamValue(1, input.hatsu.finalScore)
      );
    }
    const s = stepping as Stepping & { kind: "hif" };
    const sched = computeScheduleGains({
      lessons: s.lessons,
      classTypes: s.classTypes,
      examScores: s.examScores,
    });
    const finalStar = FINAL_ROUNDS.reduce((sum, r) => sum + r.star, 0);
    const totalStar = 15 * input.wappenCount + sched.star + finalStar;
    return (
      cappedSum * 2 +
      Math.floor(totalStar * 7.5) +
      finalRoundValue(0, input.round1) +
      finalRoundValue(1, input.round2) -
      2000
    );
  }

  /**
   * /debug 用: 勝ち踏み方での候補プールと採用理由をまとめる。
   * 実際に探索が使ったのと同じ scoreOwnedCards / findBestFormation を通す。
   */
  buildDebug(
    stepping: Stepping,
    slots: SelectedSlot[],
    startScores: number[],
    phaseScores: OptimizeDebug["phaseScores"],
  ): OptimizeDebug {
    const { input } = this;
    const ectx = this.buildEctx(stepping);
    const opts = {
      flags: input.flags,
      plan: input.plan,
      noStageItems: input.noStageItems,
    };
    const owned = scoreOwnedCards(input.getLevel, ectx.ctx, TYPE_SHEET_ROLE, opts);
    const rentals = scoreRentalCandidates(ectx.ctx, TYPE_SHEET_ROLE, opts);
    const pickedIds = new Set(slots.map((s) => s.id));

    // 勝ち踏み方の要約
    let steppingSummary: OptimizeDebug["stepping"] = null;
    if (stepping.kind === "hif") {
      const lessonMains: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const l of stepping.lessons) if (l.main) lessonMains[l.main]++;
      const classTypes: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const c of stepping.classTypes) classTypes[c]++;
      const examBias = stepping.examScores.map((e) => {
        const total = e.vocal + e.dance + e.visual;
        if (total <= 0) return "均等" as const;
        const top = [...TYPE_KEYS].sort((a, b) => e[b] - e[a])[0];
        return e[top] > total * 0.5 ? top : ("均等" as const);
      });
      steppingSummary = { lessonMains, classTypes, examBias };
    }

    // 勝ち踏み方の詳細（HIFのみ。レッスンごとのメイン/サブ/SPと選抜の実配分）
    const lessonDetail =
      stepping.kind === "hif"
        ? stepping.lessons.map((l, i) => ({
            label: LESSONS[i].label,
            main: l.main,
            sub: l.sub,
            sp: l.sp,
          }))
        : null;
    const examDetail =
      stepping.kind === "hif"
        ? stepping.examScores.map((e, i) => ({
            name: EXAMS[i].name,
            vocal: e.vocal,
            dance: e.dance,
            visual: e.visual,
          }))
        : null;

    const topOwned = {} as Record<
      TypeKey,
      { name: string; points: number; hasSpUp: boolean; picked: boolean }[]
    >;
    for (const type of TYPE_KEYS) {
      topOwned[type] = owned
        .filter((c) => c.type === type)
        .sort((a, b) => b.points - a.points)
        .slice(0, 12)
        .map((c) => ({
          name: c.name,
          points: Math.round(c.points),
          hasSpUp: c.hasSpUp,
          picked: pickedIds.has(c.id),
        }));
    }

    // 採用6枚をシナジー込みで開示（最終評価と同じ scoreSelectedCards ＋ evaluateTeam）
    const members = scoreSelectedCards(
      slots,
      input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
    );
    const scored = members.filter((m): m is ScoredCard => m !== null);
    const team = evaluateTeam(scored, ZERO_STATS, this.caps, input.eventBudget);
    const picks = scored.map((m, i) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      assist: m.assist ?? false,
      level: m.level,
      rental: m.rental,
      points: Math.round(m.points),
      synergy: Math.round(team.synergies[i] ?? 0),
      eventContrib: m.eventContrib,
    }));

    return {
      starts: startScores.length,
      evaluated: this.evaluated,
      startScores,
      phaseScores,
      lessonDetail,
      examDetail,
      stepping: steppingSummary,
      formation: {
        ownedCount: owned.length,
        rentalCount: rentals.length,
        topOwned,
        picks,
      },
    };
  }
}
