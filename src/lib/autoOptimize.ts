/**
 * 全自動最適化: レッスン（営業・授業）の踏み方 × サポカ編成 をまとめて探索する。
 *
 * 決定的パイプライン（乱数なし。毎回同じ入力なら同じ答えになる）:
 * 1. 候補出し（buildShortlist）: 代表踏み方でプールを採点し、素点上位・配り屋・
 *    SP率持ちをタイプ別に絞る（人間の「このサポカ強そう」に相当）
 * 2. 配分列挙（deterministicSearch）: レッスンのタイプ別枚数の全分割
 *    （HIF45/NIA36/初21通り）を小ビームで下見 → 上位配分だけ編成ビームサーチ。
 *    編成候補は選抜の寄せ方プリセットでも評価して「寄せると勝つ」結合解を拾う
 * 3. 仕上げ: 選抜プリセット×日入替の結合手（refineDayExamJoint）→
 *    相互詰め（refineExams・climbStepping・swapLessonPicks・編成組み直し）→
 *    スワップ×レッスンflipの結合手（swapFormationMove）
 * 目的は素直に「Σmin(上限, タイプ別ステ)を最大化」。溢れた分は上限で頭打ちになるだけで
 * ペナルティは無いので、溢れても合計が高くなる配分ならそれを選ぶ。
 *
 * 評価は計算ページと同じ流儀:
 * - パラメータボーナスは全ソース合算→1回変換（summedParaboByType）
 * - パラボ追従メモリーは踏み方ごとに「パラボ母数上位2タイプ」へ展開し直す
 * - NIAは札（スキル獲得→投票→評価値）の価値をステ換算で編成評価に足す
 * ※ 踏み方で変わるのはステ由来の評価値のみ（スター性・投票数・本戦は不変）なので、
 *    比較は Σmin(上限, ステ)＋NIA札換算 で行い、最終的な評価値は勝者だけ算出する。
 */
import {
  CLASSES,
  EXAMS,
  FINAL_ROUNDS,
  finalRoundValue,
  LESSONS,
  WAPPEN_MAX,
} from "@/data/schedule";
import {
  HATSU_CLASSES,
  HATSU_LESSONS,
  HATSU_PARAM_RATE,
  HATSU_RANK_VALUES,
  hatsuExamValue,
  NIA_LESSONS,
  NIA_PARAM_RATE,
  NIA_SALES,
  niaFanValue,
  niaFudaVotes,
  type NiaTag,
  type ScenarioKey,
} from "@/data/scenarios";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import {
  planAllows,
  evaluateTeam,
  eventBudgetScales,
  examAssistSum,
  MAX_STAT_EXCESS_WEIGHT,
  findBestFormation,
  typeConstraintFromRatio,
  minStatBonus,
  SP_PENALTY,
  spConditionShortfall,
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
import { climbStepping } from "./optimize/anneal";
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

/** 踏み方探索（編成固定）で山登りをかけるシード数（決定的） */
const CLIMB_STARTS = 6;
/** 全体の探索時間の上限（約5秒。超えたら新しい段階・ラウンドを始めない） */
const TIME_BUDGET_MS = 6200;
/** 決定的探索（分割列挙＋編成ビーム）に使う時間 */
const SEARCH_PHASE_MS = 3000;
/** 末尾の結合手（スワップ×レッスンflip）用に予約する時間 */
const JOINT_RESERVE_MS = 1200;

const ZERO_STATS: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };

/**
 * 編成候補を評価するときの選抜スコアの寄せ方プリセット（HIF）。
 * [Vo,Da,Vi]の整数比。細かい配分は最後に refineExams が詰めるので、
 * ここでは「どのタイプに寄せるか」の方向だけ見る。
 */
/** 固定カードの使用制限チェック用 */
const DB_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

/** 非HIFでグリーディ組成を回す分割数（下見上位から。1回 ~50-100ms） */
const GREEDY_PARTS = 12;
/** 詰め直し（polish）まで持ち越す「カードセットの異なる」候補数 */
const SEARCH_FINALISTS = 4;
/**
 * ステータスの寄せ方（軸: VoDa/DaVi/VoVi = レッスンを多く踏む2タイプ）ごとに、
 * 本気ビームへ必ず回す配分の最低数。下見の推定値だけで上位を選ぶと1つの軸に
 * 偏って別の軸（例: VoDa）が本気で試されないことがあるため
 */
const AXIS_MIN_PARTS = 2;
const AXIS_SHORT: Record<TypeKey, string> = { vocal: "Vo", dance: "Da", visual: "Vi" };

const EXAM_PRESET_RATIOS: [number, number, number][] = [
  [1, 1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [2, 1, 0],
  [2, 0, 1],
  [1, 2, 0],
  [0, 2, 1],
  [1, 0, 2],
  [0, 1, 2],
];

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
   * サポカ編成のタイプ構成の指定（例 {vocal:1,dance:3,visual:2}）。
   * 合計が6以上なら比率どおり6枚へ按分して固定、6未満なら指定枚数を
   * 最低条件にして残り枠は自由に探索する（typeConstraintFromRatio）。
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
  /** H.I.F.の評価値の固定部分（本戦。ワッペンは札取得回数から自動算出） */
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
   * （取得OFF / 後イベ✕）。計算ページのイベント設定へ適用する。
   * ※ pre（前イベ回数の削減）は現状の割当ロジックでは生成されない（将来用の予約）。
   */
  eventOps?: { id: string; pre?: number; acquire?: false; post?: 0 }[];
  /**
   * ステータスの寄せ方（軸）ごとの最良候補の評価値（仕上げ前の比較値）。
   * 3軸（VoDa/DaVi/VoVi）それぞれを本気で試したことの開示用
   */
  axisReport?: {
    axis: string;
    rating: number;
    chosen: boolean;
    /** 条件設定（SP率持ち枚数・最低ステ・最高ステ）の未達。採用軸は空 */
    issues: string[];
  }[];
  /** 探索の内訳（/debug でどう選ばれたかを開示するため） */
  debug?: OptimizeDebug;
};

/** /debug 用: 探索の起点・勝ち踏み方・候補プール・採用理由 */
export type OptimizeDebug = {
  /** 下見した配分の数（＝startScoresの件数） */
  starts: number;
  /** 評価した編成・踏み方の候補数 */
  evaluated: number;
  /** 配分（レッスン枚数の分割）上位の推定スコア（決定的探索の下見結果） */
  startScores: number[];
  /**
   * フェーズ別の到達スコア。
   * starts=決定的探索（分割×編成ビーム）後 / polish=踏み方の詰め直し後 /
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
  /**
   * 踏み方で変わるスター性（HIFのレッスン★・選抜★）のステ換算値（★1=評価値7.5=ステ3.75）。
   * SPの有無・踏まない日で★が変わるため、目的関数に入れて評価値と向きを揃える。
   */
  starStat: number;
};

/** 同じ6枚（レンタル区別）か */
function sameSlots(a: SelectedSlot[], b: SelectedSlot[]): boolean {
  const key = (x: SelectedSlot[]) =>
    x.map((s) => s.id + (s.rental ? "*" : "")).sort().join("|");
  return key(a) === key(b);
}

/**
 * 踏み方（レッスン・授業・選抜）と理想編成をまとめて探索する本体。
 * 決定的探索（候補出し→配分列挙→編成ビーム/グリーディ）→ 詰め直し → 結合仕上げ。
 * 結果はそのまま計算ページの各ストアへ適用できる形で返す。
 */
export function runFullOptimize(
  input: AutoOptimizeInput,
): AutoOptimizeResult | null {
  const t0 = performance.now();
  const engine = new OptimizeEngine(input);
  const finalDeadline = t0 + TIME_BUDGET_MS;
  // 決定的探索は前半で切り上げ、残りを仕上げ（日入替・選抜細分配・結合手）に使う
  engine.deadline = t0 + SEARCH_PHASE_MS;

  // 決定的パイプライン:
  //   1. 候補出し（代表踏み方でプールを採点→タイプ別ショートリスト）
  //   2. レッスン配分の全列挙（授業・選抜は後段で解析的に決める）→ 軽量評価で絞る
  //   3. 上位配分ごとに編成のビームサーチ（増分サロゲート）＋上位のみ正確評価
  // 乱数を使わないので毎回同じ答えになり、配分×編成の大域構造を取りこぼさない。
  engine.buildShortlist();
  let best = engine.deterministicSearch();
  const startScores = engine.lastPartitionEsts;
  if (!best) return null;
  const scoreAfterStarts = best.score;
  const axisPolished: typeof best[] = [];

  // 勝った編成に対して踏み方を詰め直す。
  // 非HIFは「カードセットの異なる」上位候補それぞれを新しいデッドラインで
  // 入念に詰めてから勝者を選ぶ（詰める前の優劣が詰めた後に逆転するため。
  // 1候補 ~250ms）。HIFはここに時間を使うと後段の相互詰めが痩せて損なので、
  // 探索フェーズの期限のまま軽く流す（従来どおり）
  // 候補 = カードセットの異なる上位 ∪ 軸（VoDa/DaVi/VoVi）ごとの最良（重複は除く）
  // 同じ6枚でも軸（踏み方の寄せ方）が違えば別候補として詰め直す
  const finalists = [...engine.searchFinalists];
  for (const a of engine.axisBests.values()) {
    const dup = finalists.some(
      (f) =>
        f === a ||
        (sameSlots(f.slots, a.slots) &&
          engine.axisOf(f.stepping) === engine.axisOf(a.stepping)),
    );
    if (!dup) finalists.push(a);
  }
  if (input.scenario !== "hif") {
    engine.deadline = finalDeadline - JOINT_RESERVE_MS;
  }
  let polishedBest = best;
  for (const f of finalists) {
    const cand = { ...f };
    const p = engine.optimizeStepping(cand.slots);
    if (p && p.score > cand.score) {
      cand.stepping = p.stepping;
      cand.score = p.score;
    }
    axisPolished.push(cand);
    if (cand.score > polishedBest.score) polishedBest = cand;
  }
  best = polishedBest;
  const scoreAfterPolish = best.score;

  // 仕上げ: 残り時間で「選抜スコアの細分配 ⇄ 編成の組み直し ⇄ 踏み方の山登り・日入替」を
  // 収束するまで相互に詰める。末尾の「スワップ×踏み方の結合手」用に時間を予約しておく
  engine.deadline = finalDeadline - JOINT_RESERVE_MS;
  // まず「選抜の寄せ方 × レッスン日の入れ替え」の2手谷を越えてから相互詰めに入る
  engine.refineDayExamJoint(best);
  best = engine.refineLoop(best);

  // 結合手（保証枠）: グリーディ組成が出さないカードへの1枚スワップを正確評価し、
  // 「惜しい」スワップにはレッスンflip＋選抜寄せを重ねて峠を越える。
  // （例: Da特化パラボのアイドルで、Daカードを入れつつレッスン1日と選抜を
  //   他タイプへ逃がすと溢れが消えて勝つ——3点同時でしか到達できない解）
  engine.deadline = finalDeadline + 400;
  if (engine.swapFormationMove(best, true)) {
    // 当たったら軽く仕上げ直す（踏み方の山登り＋選抜の細分配）
    const evalOf = (s: Stepping) =>
      engine.preciseObjective(best.slots, engine.buildEctx(s)).obj;
    const climbed = climbStepping(
      best.stepping,
      best.score,
      evalOf,
      engine.deadline,
    );
    if (climbed.score > best.score + 1e-9) {
      best.stepping = climbed.stepping;
      best.score = climbed.score;
    }
    const fine = engine.refineExams(best.slots, best.stepping, best.score);
    if (fine && fine.score > best.score + 1e-9) {
      best.stepping = fine.stepping;
      best.score = fine.score;
    }
  }
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
  // 授業を流行タイプの閾値ルール（第1流行2100+/第3流行1100+/余りは第1流行）へ寄せる
  finalEngine.applyClassPreference(best);
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
    // 軸別の比較値は本探索時点（仕上げ前）の軸別最良から作る
    // （詰め直し後は踏み方が勝ち軸へ収束するので、軸ごとの比較にならない）
    axisReport: (() => {
      const chosenAxis = engine.axisOf(best.stepping);
      return [...engine.axisBests.entries()]
        .map(([axis, c]) => {
          const chosen = axis === chosenAxis;
          const ectx = engine.buildEctx(c.stepping);
          const { cappedSum, members: mem, stats } = engine.preciseObjective(
            c.slots,
            ectx,
          );
          return {
            axis,
            // 採用軸は仕上げ後の評価値（＝反映される値）、他は本探索時点の値
            rating: chosen ? rating : engine.fullRating(c.stepping, cappedSum, mem),
            chosen,
            issues: chosen ? [] : engine.conditionIssues(mem, stats),
          };
        })
        .sort((a, b) => b.rating - a.rating);
    })(),
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
 * 2. 探索        : buildShortlist / deterministicSearch / bestFormationBeam /
 *                  optimizeStepping / searchStepping
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
    // HIFのワッペンは札（スキルカード取得）の回数ぶん発動する（最大20回）。
    // 編成サポカのスキル獲得分もワッペン★になるため、ステ換算で編成選定に効かせる
    // （★1回=15、評価値=★×7.5、ステ1=評価値2 → 1札 = 15×7.5/2 ステ相当）。
    // 上限20を超える札には価値がないので、超過分は加点しない
    if (input.scenario === "hif") {
      this.fudaBase = input.manual("スキル獲得") ?? 0;
      this.extraScore = (cards) => {
        const withCards = Math.min(WAPPEN_MAX, this.fudaBase + this.supportFudaOf(cards));
        const without = Math.min(WAPPEN_MAX, this.fudaBase);
        return ((withCards - without) * 15 * 7.5) / 2;
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
   * 編成を固定して踏み方（レッスン・授業・選抜）を最適化する。
   * 編成固定で踏み方を入念に詰め直す（シード群→決定的山登り）。
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
   * 全シード（現在＋一様＋タイプ別枚数の全分割）を評価 → 上位から決定的な山登り。
   */
  searchStepping(
    slots: SelectedSlot[],
    current: Stepping,
  ): { stepping: Stepping; score: number } {
    const evalOf = (s: Stepping) =>
      this.preciseObjective(slots, this.buildEctx(s)).obj;

    // シード = 一様×分割（stepping.ts）＋ HIFはそれぞれに選抜の寄せ方プリセット10種
    // （分割は合っていても選抜が均等だと順位が下がり、山登りの起点から漏れるため）
    const baseSeeds = buildSeeds(current);
    const seeds: Stepping[] = [...baseSeeds];
    if (current.kind === "hif") {
      for (const seed of baseSeeds) {
        if (seed.kind !== "hif") continue;
        for (const ratio of EXAM_PRESET_RATIOS) {
          seeds.push({
            ...seed,
            examScores: EXAMS.map((_, i) => examScoresFromRatio(i, ratio)),
          });
        }
      }
    }
    const scored = seeds
      .map((s) => ({ stepping: s, score: evalOf(s) }))
      .sort((a, b) => b.score - a.score);

    // 上位シードから決定的な山登り（全軸の近傍を総当たり）。乱数は使わない
    let best = scored[0];
    for (const seed of scored.slice(0, CLIMB_STARTS)) {
      const climbed = climbStepping(
        seed.stepping,
        seed.score,
        evalOf,
        this.deadline,
      );
      if (climbed.score > best.score) best = climbed;
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
   * 編成の1枚スワップ局所探索（preciseObjective 直評価）。
   * 通常の編成更新はグリーディ組成（buildFormation）経由のため、組成ヒューリスティックが
   * 出さないカードには到達できない。ここでは候補プール上位との1枚入れ替えを
   * 正確な目的関数で直接評価する。さらに「入れ替え＋レッスン1箇所のメイン変更」の
   * 結合手も試す（例: Da特化パラボのアイドルで、Daカードを入れつつレッスンを
   * 1日だけ他タイプへ逃がすと溢れが消えて勝つ——どちらか単独では悪化する峠越え）。
   */
  swapFormationMove(
    best: {
      stepping: Stepping;
      slots: SelectedSlot[];
      score: number;
      spShortfall: number;
    },
    joint: boolean,
  ): boolean {
    const ectx = this.buildEctx(best.stepping);
    const opts = {
      flags: this.input.flags,
      plan: this.input.plan,
      noStageItems: this.input.noStageItems,
    };
    const owned = scoreOwnedCards(
      this.input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
      opts,
    );
    const rentals = scoreRentalCandidates(ectx.ctx, TYPE_SHEET_ROLE, opts);
    // 候補: タイプごとの上位 + アシスト上位 + レンタル上位（点数順）
    const byPoints = (a: ScoredCard, b: ScoredCard) => b.points - a.points;
    const cands: { card: ScoredCard; rental: boolean }[] = [];
    for (const type of TYPE_KEYS) {
      owned
        .filter((c) => c.type === type && !c.assist)
        .sort(byPoints)
        .slice(0, 12)
        .forEach((card) => cands.push({ card, rental: false }));
    }
    owned
      .filter((c) => c.assist)
      .sort(byPoints)
      .slice(0, 4)
      .forEach((card) => cands.push({ card, rental: false }));
    rentals
      .sort(byPoints)
      .slice(0, 6)
      // 完凸所持のカードはレンタルにしても同一評価なので除外（重複試行の削減）
      .filter((card) => this.input.getLevel(card.id) !== 4)
      .forEach((card) => cands.push({ card, rental: true }));

    const typeOf = new Map<string, TypeKey>();
    for (const c of [...owned, ...rentals]) typeOf.set(c.id, c.type);
    const ratioCons = this.input.typeRatio
      ? typeConstraintFromRatio(this.input.typeRatio)
      : {};
    const violatesRatio = (slots: SelectedSlot[]): boolean => {
      if (!ratioCons.typeCounts && !ratioCons.typeMinCounts) return false;
      const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const s of slots) {
        const t = typeOf.get(s.id);
        if (t) counts[t]++;
      }
      for (const type of TYPE_KEYS) {
        if (ratioCons.typeCounts && counts[type] !== ratioCons.typeCounts[type])
          return true;
        if (
          ratioCons.typeMinCounts &&
          counts[type] < ratioCons.typeMinCounts[type]
        )
          return true;
      }
      return false;
    };

    const inUse = new Set(best.slots.map((s) => s.id));
    const pinned = this.input.flags.pinned;
    // 結合手用の「惜しい」スワップ。順位付けは「即時obj＋溢れ量」——
    // 溢れているスワップほど、踏み方を他タイプへ逃がしたときの回収余地が大きい
    // （「溢れるように見えて実は入れて逃がすと勝つ」カードを狙い撃つための基準）
    const nearMisses: {
      slots: SelectedSlot[];
      score: number;
      potential: number;
    }[] = [];
    const NEAR_DELTA = 900;

    let improved = false;
    let bestTrial: { slots: SelectedSlot[]; score: number } | null = null;
    for (let i = 0; i < best.slots.length; i++) {
      if (pinned.has(best.slots[i].id)) continue;
      for (const { card, rental } of cands) {
        if (performance.now() > this.deadline) break;
        if (inUse.has(card.id)) continue;
        const trial = best.slots.map((s, j) =>
          j === i ? { id: card.id, rental } : s,
        );
        if (trial.filter((s) => s.rental).length > 1) continue;
        if (violatesRatio(trial)) continue;
        const { obj, overflow } = this.preciseObjective(trial, ectx);
        if (obj > (bestTrial?.score ?? best.score) + 1e-9) {
          bestTrial = { slots: trial, score: obj };
        } else if (joint && obj > best.score - NEAR_DELTA) {
          nearMisses.push({ slots: trial, score: obj, potential: obj + overflow });
        }
      }
    }
    if (bestTrial) {
      best.slots = bestTrial.slots;
      best.score = bestTrial.score;
      improved = true;
    }

    // 結合手: 惜しいスワップ上位に「レッスン1箇所のメイン/サブ変更」を重ね、
    // さらに一番良かった形へ選抜スコアの細分配（refineExams）まで通して評価する。
    // 実測では swap単体・swap+レッスンflipのどちらも現ベスト未満なのに、
    // swap+flip+選抜再配分の3点同時なら勝つ谷がある（例: Da特化アイドルの無我採用）。
    if (joint && best.stepping.kind === "hif") {
      const cur = best.stepping as Stepping & { kind: "hif" };
      nearMisses.sort((a, b) => b.potential - a.potential);
      // このフェーズは収束後にだけ走るが、全体の時間予算を食い潰さないよう上限を切る
      const jointDeadline = Math.min(
        this.deadline,
        performance.now() + 1600,
      );
      for (const miss of nearMisses.slice(0, 5)) {
        if (performance.now() > jointDeadline) break;
        // このスワップに対するレッスンflip候補（無flip含む）を全部採点する
        const flips: { stepping: Stepping; score: number }[] = [
          { stepping: cur, score: miss.score },
        ];
        for (let i = 0; i < cur.lessons.length; i++) {
          const li = cur.lessons[i];
          for (const newMain of TYPE_KEYS) {
            if (newMain === li.main) continue;
            for (const sub of TYPE_KEYS) {
              if (sub === newMain) continue;
              if (performance.now() > jointDeadline) break;
              const lessons = cur.lessons.map((l, j) =>
                j === i ? { ...l, main: newMain, sub } : l,
              );
              const s: Stepping = { ...cur, lessons };
              const { obj } = this.preciseObjective(
                miss.slots,
                this.buildEctx(s),
              );
              flips.push({ stepping: s, score: obj });
            }
          }
        }
        // flipのサブ選択と選抜配分は相互依存（選抜を寄せ直すと勝つサブが変わる）ため、
        // 上位flipそれぞれに粗い選抜変形（全選抜の単タイプ寄せ）を重ねて採否を判断する。
        // 細かい比率はこの手が当たったあとの refineExams（採用時＋通常ラウンド）で詰まる
        flips.sort((a, b) => b.score - a.score);
        for (const flip of flips.slice(0, 3)) {
          if (performance.now() > jointDeadline) break;
          const base = flip.stepping as Stepping & { kind: "hif" };
          const examVariants: Stepping[] = [base];
          for (const type of TYPE_KEYS) {
            const ratio: [number, number, number] = [
              type === "vocal" ? 1 : 0,
              type === "dance" ? 1 : 0,
              type === "visual" ? 1 : 0,
            ];
            examVariants.push({
              ...base,
              examScores: base.examScores.map((_, k) =>
                examScoresFromRatio(k, ratio),
              ),
            });
          }
          for (const trial of examVariants) {
            const { obj } =
              trial === base
                ? { obj: flip.score }
                : this.preciseObjective(miss.slots, this.buildEctx(trial));
            if (obj > best.score + 1e-9) {
              best.stepping = trial;
              best.slots = miss.slots;
              best.score = obj;
              improved = true;
            }
          }
        }
      }
      // 当たったら選抜の細分配で仕上げる（1回だけ）
      if (improved) {
        const fine = this.refineExams(best.slots, best.stepping, best.score);
        if (fine && fine.score > best.score + 1e-9) {
          best.stepping = fine.stepping;
          best.score = fine.score;
        }
      }
    }
    return improved;
  }

  /**
   * 授業を「第1流行タイプが2100以上・第3流行タイプが1100以上・両方満たすなら
   * 第1流行へ」の優先度で割り当て直す（評価値を落とさない範囲で）。
   * 授業は固定値（パラボ・上限溢れ以外は配置に依らず合計不変）のため、
   * 全割当（3^授業数）を正確に評価し、合計最優先→閾値優先の辞書式で選ぶ。
   */
  applyClassPreference(best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
  }): void {
    const s = best.stepping;
    if (s.kind !== "hif" && s.kind !== "hatsu") return;
    const n = s.classTypes.length;
    if (n === 0 || n > 6) return; // 3^6=729評価まで（パッケージ時に1回だけ）
    const ranks = this.input.ranks;
    const t1 = TYPE_KEYS.find((t) => ranks[t] === 1) ?? "vocal";
    const t3 = TYPE_KEYS.find((t) => ranks[t] === 3) ?? "visual";
    type Key = [number, number, number, number];
    const better = (a: Key, b: Key) => {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
      }
      return false;
    };
    let bestKey: Key | null = null;
    let bestAssign: TypeKey[] | null = null;
    const assign = new Array<TypeKey>(n);
    const walk = (i: number): void => {
      if (i === n) {
        const trial: Stepping = { ...s, classTypes: [...assign] } as Stepping;
        const { cappedSum, stats } = this.preciseObjective(
          best.slots,
          this.buildEctx(trial),
          true,
        );
        const key: Key = [
          Math.round(cappedSum),
          Math.min(stats[t1], 2100),
          Math.min(stats[t3], 1100),
          stats[t1],
        ];
        if (!bestKey || better(key, bestKey)) {
          bestKey = key;
          bestAssign = [...assign];
        }
        return;
      }
      for (const t of TYPE_KEYS) {
        assign[i] = t;
        walk(i + 1);
      }
    };
    walk(0);
    if (bestAssign) {
      best.stepping = { ...s, classTypes: bestAssign } as Stepping;
    }
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
   * を収束するまで反復し、時間が余れば踏み方の広域再探索で局所解の脱出を試みる。
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

      // 選抜の寄せ方×日入替の2手谷（refineExamsの微調整後に改めて試す）
      {
        const before = best.score;
        this.refineDayExamJoint(best);
        if (best.score > before + 1e-9) changed = true;
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
          changed = true;
        }
      }
      // 片方ずつの改善が尽きたら、レッスン変更＋編成組み直しの同時手を試す
      if (!changed && !this.jointLessonFormationMove(best)) break;
    }

    // 余り時間で踏み方の広域再探索（改善したら編成・選抜も追い詰め直す）。
    // 探索は決定的なので、外れたら再挑戦しても同じ結果＝即終了する
    while (performance.now() < this.deadline - 150) {
      const searched = this.searchStepping(best.slots, best.stepping);
      if (searched.score <= best.score + 1e-9) break;
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
    let starStat = 0;
    if (s.kind === "hif") {
      const state = {
        lessons: s.lessons,
        classTypes: s.classTypes,
        examScores: s.examScores,
      };
      const sched = computeScheduleGains(state);
      bd = sched.breakdown;
      starStat = (sched.star * 7.5) / 2;
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

    // 変換前ベース(baseNoConv)とパラボ%(basePct)を分けて持ち、パラボ変換は後段でまとめて適用する
    const baseNoConv = {} as Record<TypeKey, number>;
    const basePct = {} as Record<TypeKey, number>;
    const baseStats = {} as Record<TypeKey, number>;
    // HIFボーナス（全タイプ+100・パラボ+10%）はHIFシナリオ限定
    const hifFixed = input.scenario === "hif" ? 100 : 0;
    const hifPct = input.scenario === "hif" ? 10 : 0;
    for (const type of TYPE_KEYS) {
      basePct[type] =
        memPct[type] + (input.pStats?.parabo[type] ?? 0) + hifPct;
      baseNoConv[type] =
        bd.classes[type] +
        memFixed[type] +
        (input.pStats?.fixed[type] ?? 0) +
        hifFixed +
        bd.lessons[type] +
        bd.exams[type];
      const g = ctx.gains[TYPE_SHEET_ROLE[type]];
      baseStats[type] =
        baseNoConv[type] +
        paraboConvert(basePct[type] / 100, g.lessons, g.exams);
    }
    return { ctx, baseNoConv, basePct, baseStats, starStat };
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
    /** 上限を超えて溢れているステの合計（踏み方の逃しで回収し得る量） */
    overflow: number;
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
    /** 上限を超えて溢れているステの合計（踏み方の逃しで回収し得る量） */
    overflow: number;
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
    let overflow = 0;
    const stats: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    for (const type of TYPE_KEYS) {
      const raw =
        ectx.baseNoConv[type] +
        adj[type].support +
        adj[type].conv -
        itemCut[type];
      stats[type] = Math.min(this.caps[type], raw);
      cappedSum += stats[type];
      excess += Math.max(0, stats[type] - this.maxTargets[type]);
      overflow += Math.max(0, raw - this.caps[type]);
    }
    const obj =
      cappedSum +
      // 踏み方で変わるスター性（HIF）。評価値と同じ向きで踏み方を比べるため
      ectx.starStat -
      // 最高ステ設定の超過分は探索価値を割り引く（評価値からは削らない）
      (1 - MAX_STAT_EXCESS_WEIGHT) * excess +
      (this.extraScore ? this.extraScore(members) : 0) +
      // 試験補助の加点は探索の目的関数のみ。表示・評価値には足さない
      (!forReport && this.input.examAssist
        ? examAssistSum(members, this.input.examStyleTags)
        : 0) +
      minStatBonus(stats, this.minStatCond) -
      spConditionShortfall(members, this.input.spMin) * SP_PENALTY;
    return { obj, cappedSum, members, stats, overflow };
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
  /** 探索対象のショートリスト（buildShortlistで作る。null=全プール） */
  private shortlistIds: Set<string> | null = null;
  private rentalShortlistIds: Set<string> | null = null;
  /** /debug用: 決定的探索の分割別推定スコア（上位から） */
  lastPartitionEsts: number[] = [];
  /** 軸（レッスンを多く踏む2タイプ）ごとの最良候補 */
  axisBests = new Map<
    string,
    {
      stepping: Stepping;
      slots: SelectedSlot[];
      score: number;
      spShortfall: number;
    }
  >();
  /** 決定的探索が残した「カードセットの異なる」上位候補（詰め直し用） */
  searchFinalists: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  }[] = [];

  private formationOpts() {
    const { input } = this;
    return {
      flags: input.flags,
      plan: input.plan,
      noStageItems: input.noStageItems,
    };
  }

  /**
   * 候補出し（人間の「このサポカ強そう」に相当する絞り込み）。
   * 代表的な踏み方（単タイプ×3＋バランス）でプール全体を採点し、タイプごとに
   * - 素点上位
   * - 配り屋上位（前イベ・後イベで編成全体の発動回数を増やすカード。
   *   ドリンク獲得・スキル獲得持ちなどがここで拾われる）
   * - SP率持ち上位（SP枚数条件用）
   * を合流させる（試験補助ON時はその加点も順位に効かせる）。
   * 以降の探索はこのリストだけを見る（採点が数倍速くなり、反復を深くできる）。
   */
  buildShortlist(): void {
    const ids = new Set<string>();
    const rentalIds = new Set<string>();
    const opts = this.formationOpts();
    for (const s of this.representativeSteppings()) {
      const ectx = this.buildEctx(s);
      const owned = scoreOwnedCards(
        this.input.getLevel,
        ectx.ctx,
        TYPE_SHEET_ROLE,
        opts,
      );
      const rentals = scoreRentalCandidates(ectx.ctx, TYPE_SHEET_ROLE, opts);
      // 受け手価値の目安: 回数キーごとの最大効果量（配り屋の価値づけ用）
      const keyValue: Record<string, number> = {};
      for (const c of owned) {
        for (const k in c.valuesByKey) {
          keyValue[k] = Math.max(keyValue[k] ?? 0, c.valuesByKey[k]);
        }
      }
      const giveValue = (c: ScoredCard) => {
        let v = 0;
        for (const k in c.eventContrib) {
          v += c.eventContrib[k] * (keyValue[k] ?? 0) * 5;
        }
        return v;
      };
      const assistOf = (c: ScoredCard) =>
        this.input.examAssist
          ? examAssistSum([c], this.input.examStyleTags)
          : 0;
      for (const type of TYPE_KEYS) {
        const group = owned.filter((c) => c.type === type && !c.assist);
        const byPoints = [...group].sort((a, b) => b.points - a.points);
        byPoints.slice(0, 12).forEach((c) => ids.add(c.id));
        [...group]
          .sort(
            (a, b) =>
              b.points + giveValue(b) + assistOf(b) -
              (a.points + giveValue(a) + assistOf(a)),
          )
          .slice(0, 6)
          .forEach((c) => ids.add(c.id));
        byPoints
          .filter((c) => c.hasSpUp)
          .slice(0, 3)
          .forEach((c) => ids.add(c.id));
        [...rentals.filter((c) => c.type === type)]
          .sort((a, b) => b.points - a.points)
          .slice(0, 2)
          .forEach((c) => rentalIds.add(c.id));
      }
      owned
        .filter((c) => c.assist)
        .sort((a, b) => b.points - a.points)
        .slice(0, 4)
        .forEach((c) => ids.add(c.id));
    }
    // 固定カードは必ず候補に含める。ただし使用制限（プラン）が合わないカードは
    // 編成できないので除外する（固定してもプラン違いは反映しない）
    for (const id of this.input.flags.pinned) {
      const card = DB_BY_ID.get(id);
      if (card && !planAllows(card.plan, this.input.plan)) continue;
      ids.add(id);
    }
    this.shortlistIds = ids;
    this.rentalShortlistIds = rentalIds;
  }

  /** 候補出しに使う代表踏み方（単タイプ×3＋バランス） */
  private representativeSteppings(): Stepping[] {
    const parts: [number, number, number][] =
      this.input.scenario === "hif"
        ? [
            [8, 0, 0],
            [0, 8, 0],
            [0, 0, 8],
            [3, 3, 2],
          ]
        : this.input.scenario === "niaMaster"
          ? [
              [7, 0, 0],
              [0, 7, 0],
              [0, 0, 7],
              [3, 2, 2],
            ]
          : [
              [5, 0, 0],
              [0, 5, 0],
              [0, 0, 5],
              [2, 2, 1],
            ];
    return parts.map((p) => this.steppingFromPartition(p));
  }

  /**
   * レッスンのタイプ別枚数（分割）→ 踏み方。
   * 授業/営業は後段（climbStepping・applyClassPreference）が決めるのでここでは一様、
   * 選抜は均等（refineExamsが詰める）、全SP（非SP・踏まないは結合手が試す）。
   */
  private steppingFromPartition(part: [number, number, number]): Stepping {
    // 日割り当ての初期配置: 枚数の多いタイプから順に、獲得の大きい日を取る
    // （少数タイプは小さい日に置くのが概ね最適。細部は swapLessonPicks が詰める）
    const dayGains: number[] =
      this.input.scenario === "hif"
        ? LESSONS.map((l) => l.main[1])
        : this.input.scenario === "niaMaster"
          ? NIA_LESSONS.map((l) => l.value[1])
          : HATSU_LESSONS.map((l) => l.perfectMain[1]);
    const dayOrder = dayGains
      .map((g, i) => ({ g, i }))
      .sort((a, b) => b.g - a.g)
      .map((x) => x.i);
    const typeOrder = TYPE_KEYS.map((t, i) => ({ t, c: part[i] })).sort(
      (a, b) => b.c - a.c,
    );
    const mains: TypeKey[] = new Array(dayGains.length);
    let cursor = 0;
    for (const { t, c } of typeOrder) {
      for (let k = 0; k < c; k++) mains[dayOrder[cursor++]] = t;
    }
    if (this.input.scenario === "niaMaster") {
      const sales =
        this.input.nia.sales.length > 0
          ? this.input.nia.sales
          : NIA_SALES.map(() => ({
              type: "visual" as TypeKey,
              resort: true,
              great: true,
            }));
      return {
        kind: "nia",
        lessons: NIA_LESSONS.map((_, i) => ({
          main: mains[i] ?? null,
          sp: true,
        })),
        sales: sales.map((sale) => ({ ...sale })),
      };
    }
    if (this.input.scenario === "hatsuLegend") {
      return {
        kind: "hatsu",
        lessons: HATSU_LESSONS.map((_, i) => ({
          main: mains[i] ?? null,
          sp: true,
          perfect: this.input.hatsu.lessons[i]?.perfect ?? true,
        })),
        classTypes: HATSU_CLASSES.map(() => "visual" as TypeKey),
      };
    }
    // サブ枠は「メイン以外で審査基準が高い方」へ（パラボ母数の大きいタイプに
    // 寄せるのが概ね最適。細部は climbStepping が微調整する）
    const subFor = (main: TypeKey): TypeKey => {
      const others = TYPE_KEYS.filter((t) => t !== main);
      return this.input.ranks[others[0]] <= this.input.ranks[others[1]]
        ? others[0]
        : others[1];
    };
    return {
      kind: "hif",
      lessons: LESSONS.map((_, i) => ({
        main: mains[i] ?? null,
        sub: subFor(mains[i] ?? "vocal"),
        sp: true,
      })),
      classTypes: CLASSES.map(() => "visual" as TypeKey),
      examScores: EXAMS.map((_, i) => examScoresUniform(i)),
    };
  }

  /** レッスン数nの3タイプ分割の全列挙（HIF=45 / NIA=36 / 初=21通り） */
  private lessonPartitions(): [number, number, number][] {
    const n =
      this.input.scenario === "hif"
        ? LESSONS.length
        : this.input.scenario === "niaMaster"
          ? NIA_LESSONS.length
          : HATSU_LESSONS.length;
    const out: [number, number, number][] = [];
    for (let a = 0; a <= n; a++) {
      for (let b = 0; b <= n - a; b++) out.push([a, b, n - a - b]);
    }
    return out;
  }

  /** ショートリストだけを採点する（全プール採点の数分の一のコスト） */
  private scorePool(ectx: Ectx): {
    owned: ScoredCard[];
    rentals: ScoredCard[];
  } {
    if (!this.shortlistIds) {
      const opts = this.formationOpts();
      return {
        owned: scoreOwnedCards(
          this.input.getLevel,
          ectx.ctx,
          TYPE_SHEET_ROLE,
          opts,
        ),
        rentals: scoreRentalCandidates(ectx.ctx, TYPE_SHEET_ROLE, opts),
      };
    }
    const owned = scoreSelectedCards(
      [...this.shortlistIds].map((id) => ({ id, rental: false })),
      this.input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
    ).filter((c): c is ScoredCard => c !== null && !c.rental);
    const ownedAt4 = new Set(
      owned.filter((c) => c.level >= 4).map((c) => c.id),
    );
    const rentals = scoreSelectedCards(
      [...(this.rentalShortlistIds ?? [])]
        .filter((id) => !ownedAt4.has(id))
        .map((id) => ({ id, rental: true })),
      this.input.getLevel,
      ectx.ctx,
      TYPE_SHEET_ROLE,
    ).filter((c): c is ScoredCard => c !== null);
    return { owned, rentals };
  }

  /**
   * 編成のビームサーチ（1枚ずつ追加。順位づけは増分サロゲート、上位のみ正確評価）。
   * サロゲート = 素点＋アイテム補正＋ペアシナジー（配布回数×受け手効果量の双方向）
   *   ＋試験補助加点＋NIA札の単体価値。上限・合算パラボ・SP条件は正確評価側で効く。
   * 決定的（乱数なし）。レンタルは1枚まで・同名重複なし・固定カードは必ず入れる。
   */
  bestFormationBeam(
    ectx: Ectx,
    opts?: {
      beamWidth?: number;
      exactTop?: number;
      /** 渡すと最終候補を選抜スコアのプリセット（寄せ方7種）でも評価して、
       *  「この編成はDaに寄せると勝つ」型の結合解を拾う（HIFのみ） */
      stepping?: Stepping;
      examFinalists?: number;
    },
  ): { members: ScoredCard[]; obj: number; stepping?: Stepping } | null {
    const beamWidth = opts?.beamWidth ?? 220;
    const exactTop = opts?.exactTop ?? 240;
    const { owned, rentals } = this.scorePool(ectx);
    const pinnedIds = this.input.flags.pinned;
    const pool: ScoredCard[] = [...owned, ...rentals];
    if (pool.length < 6) return null;

    const assistExtra = (c: ScoredCard) =>
      this.input.examAssist ? examAssistSum([c], this.input.examStyleTags) : 0;
    const soloExtra = this.extraScore
      ? (c: ScoredCard) => this.extraScore!([c])
      : () => 0;
    const baseValue = pool.map(
      (c) => c.points + c.itemBonus + assistExtra(c) + soloExtra(c),
    );

    type Node = {
      picks: number[];
      ids: Set<string>;
      rentalUsed: boolean;
      surrogate: number;
      /** 選択済みの受け手効果量の累積（回数キー→合計） */
      recv: Record<string, number>;
      /** 選択済みの配布回数の累積（回数キー→合計） */
      give: Record<string, number>;
      typeCount: Record<TypeKey, number>;
    };
    const mkRoot = (): Node => ({
      picks: [],
      ids: new Set(),
      rentalUsed: false,
      surrogate: 0,
      recv: {},
      give: {},
      typeCount: { vocal: 0, dance: 0, visual: 0 },
    });
    const addTo = (node: Node, idx: number): Node => {
      const c = pool[idx];
      let inc = baseValue[idx];
      for (const k in c.eventContrib) {
        inc +=
          c.eventContrib[k] * ((node.recv[k] ?? 0) + (c.valuesByKey[k] ?? 0));
      }
      for (const k in c.valuesByKey) {
        inc += (c.valuesByKey[k] ?? 0) * (node.give[k] ?? 0);
      }
      const recv = { ...node.recv };
      for (const k in c.valuesByKey) {
        recv[k] = (recv[k] ?? 0) + c.valuesByKey[k];
      }
      const give = { ...node.give };
      for (const k in c.eventContrib) {
        give[k] = (give[k] ?? 0) + c.eventContrib[k];
      }
      const typeCount = { ...node.typeCount };
      if (!c.assist) typeCount[c.type]++;
      return {
        picks: [...node.picks, idx],
        ids: new Set(node.ids).add(c.id),
        rentalUsed: node.rentalUsed || c.rental,
        surrogate: node.surrogate + inc,
        recv,
        give,
        typeCount,
      };
    };

    // 固定カードを最初に強制投入
    let beam: Node[] = [mkRoot()];
    for (const id of pinnedIds) {
      const idx = pool.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      beam = beam.map((nd) =>
        nd.ids.has(id) || nd.picks.length >= 6 ? nd : addTo(nd, idx),
      );
    }

    // タイプ割合の制約（固定枚数指定のときは超過を弾く）
    const ratioConstraint = this.input.typeRatio
      ? typeConstraintFromRatio(this.input.typeRatio)
      : {};
    const fixedCounts = (
      ratioConstraint as { typeCounts?: Record<TypeKey, number> }
    ).typeCounts;
    const allowedByType = (nd: Node, c: ScoredCard): boolean => {
      if (c.assist) return true;
      if (fixedCounts && nd.typeCount[c.type] >= fixedCounts[c.type]) {
        return false;
      }
      return true;
    };

    // 候補は「親ノード＋追加index＋サロゲート」だけ持ち、上位beamWidth件だけ実体化する
    // （ノードの複製が支配コストになるのを避ける）
    const seen = new Set<string>();
    while (beam.length > 0 && beam[0].picks.length < 6) {
      const cands: { nd: Node; i: number; surrogate: number }[] = [];
      for (const nd of beam) {
        for (let i = 0; i < pool.length; i++) {
          const c = pool[i];
          if (nd.ids.has(c.id)) continue;
          if (c.rental && nd.rentalUsed) continue;
          if (!allowedByType(nd, c)) continue;
          let inc = baseValue[i];
          for (const k in c.eventContrib) {
            inc +=
              c.eventContrib[k] *
              ((nd.recv[k] ?? 0) + (c.valuesByKey[k] ?? 0));
          }
          for (const k in c.valuesByKey) {
            inc += (c.valuesByKey[k] ?? 0) * (nd.give[k] ?? 0);
          }
          cands.push({ nd, i, surrogate: nd.surrogate + inc });
        }
      }
      cands.sort((a, b) => b.surrogate - a.surrogate);
      beam = [];
      seen.clear();
      for (const cand of cands) {
        const key = [...cand.nd.picks, cand.i].sort((a, b) => a - b).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        beam.push(addTo(cand.nd, cand.i));
        if (beam.length >= beamWidth) break;
      }
    }
    if (beam.length === 0) return null;

    // 上位候補だけ正確評価（合算パラボ・上限・SP条件・最低ステはここで効く）
    let best: { members: ScoredCard[]; obj: number; stepping?: Stepping } | null =
      null;
    const finalists: { members: ScoredCard[]; obj: number }[] = [];
    for (const nd of beam.slice(0, exactTop)) {
      const members = nd.picks.map((i) => pool[i]);
      const { obj } = this.preciseMembers(members, ectx);
      finalists.push({ members, obj });
      if (!best || obj > best.obj) best = { members, obj };
    }

    // 編成⇄選抜の結合: 上位の編成候補を「選抜の寄せ方」プリセットでも評価する。
    // 均等選抜では2位でも、Daに寄せると1位になる編成（上限溢れの解消型）を拾う。
    const baseStepping = opts?.stepping;
    if (baseStepping && baseStepping.kind === "hif" && best) {
      finalists.sort((a, b) => b.obj - a.obj);
      const top = finalists.slice(0, opts?.examFinalists ?? 10);
      for (const ratio of EXAM_PRESET_RATIOS) {
        const stepping: Stepping = {
          ...baseStepping,
          examScores: EXAMS.map((_, i) => examScoresFromRatio(i, ratio)),
        };
        const varEctx = this.buildEctx(stepping);
        for (const f of top) {
          // 選抜配分が変わるとパラボ母数が変わるので採点し直す
          const slots = f.members.map((m) => ({ id: m.id, rental: m.rental }));
          const { obj } = this.preciseObjective(slots, varEctx);
          if (obj > best.obj) {
            best = {
              members: f.members,
              obj,
              stepping,
            };
          }
        }
      }
    }
    return best;
  }

  /**
   * 全分割の下見。小さいビームで編成まで見て推定スコアを付ける
   * （件数有限＝最大45件なので、大幅超過時のみ非常停止する）。
   */
  private previewPartitions(opts?: {
    beamWidth?: number;
    exactTop?: number;
    examFinalists?: number;
  }): { est: number; stepping: Stepping }[] {
    const scored: { est: number; stepping: Stepping }[] = [];
    for (const part of this.lessonPartitions()) {
      const stepping = this.steppingFromPartition(part);
      const ectx = this.buildEctx(stepping);
      const r = this.bestFormationBeam(ectx, {
        beamWidth: opts?.beamWidth ?? 30,
        exactTop: opts?.exactTop ?? 8,
        stepping,
        examFinalists: opts?.examFinalists ?? 2,
      });
      if (!r) continue;
      // 本気ビームは下見で勝った選抜の寄せ方から始める
      scored.push({ est: r.obj, stepping: r.stepping ?? stepping });
      if (performance.now() > this.deadline + 800) break;
    }
    return scored;
  }

  /**
   * 踏み方の軸 = レッスンのメイン踏みが多い2タイプ（同数なら審査基準の高い方）。
   * 例: Da5/Vi2/Vo1 → DaVi。表示は TYPE_KEYS 順（VoDa/VoVi/DaVi）
   */
  axisOf(stepping: Stepping): string {
    const count: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    for (const l of stepping.lessons) if (l.main) count[l.main]++;
    const mains = [...TYPE_KEYS]
      .sort((a, b) => count[b] - count[a] || this.input.ranks[a] - this.input.ranks[b])
      .slice(0, 2)
      .sort((a, b) => TYPE_KEYS.indexOf(a) - TYPE_KEYS.indexOf(b));
    return mains.map((t) => AXIS_SHORT[t]).join("");
  }

  /**
   * 決定的探索の本体。
   * レッスン配分（分割）を全列挙 → グリーディ編成の正確評価で足切り →
   * 上位配分だけ編成ビームサーチ。乱数を一切使わないので毎回同じ答えになる。
   */
  deterministicSearch(): {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  } | null {
    // 1. 分割の下見（小さいビームで編成まで見て順位づけする）
    const scored = this.previewPartitions();
    if (scored.length === 0) return null;
    scored.sort((a, b) => b.est - a.est);

    // 候補は「カードセットごとの最良」も残す（searchFinalists）。
    // 詰める前の優劣は詰めた後に逆転し得るので、勝者1つに絞らず
    // 上位数セットを polish 段階まで持ち越して選ばせる
    type Cand = {
      stepping: Stepping;
      slots: SelectedSlot[];
      score: number;
      spShortfall: number;
    };
    let best: Cand | null = null;
    const bySet = new Map<string, Cand>();
    const consider = (cand: Cand): void => {
      const key = cand.slots
        .map((x) => x.id + (x.rental ? "*" : ""))
        .sort()
        .join("|");
      const cur = bySet.get(key);
      if (!cur || cand.score > cur.score) bySet.set(key, cand);
      const axis = this.axisOf(cand.stepping);
      const curAxis = this.axisBests.get(axis);
      if (!curAxis || cand.score > curAxis.score) this.axisBests.set(axis, cand);
      if (!best || cand.score > best.score) best = cand;
    };

    // 2. 非HIFはグリーディ組成でも補強する。ビームの増分サロゲートは
    //    削除・投票札型（クールダウン等）の価値を取りこぼして正解編成に
    //    届かないことがあるが、グリーディ（正確評価で1枚ずつ成長）は拾える。
    //    さらに見つけた編成群（ポートフォリオ）を全分割で正確評価し直して
    //    下見の順位づけ自体を補正する（勝ち分割が31位に沈む型の対策）。
    const greedied = new Set<Stepping>();
    if (this.input.scenario !== "hif") {
      const portfolio: SelectedSlot[][] = [];
      for (const p of scored.slice(0, GREEDY_PARTS)) {
        const ectx = this.buildEctx(p.stepping);
        const g = this.buildFormation(ectx);
        greedied.add(p.stepping);
        if (!g) continue;
        const slots = g.picks.map((x) => ({ id: x.id, rental: x.rental }));
        const { obj, members } = this.preciseObjective(slots, ectx);
        portfolio.push(slots);
        if (obj > p.est) p.est = obj;
        consider({
          stepping: p.stepping,
          slots,
          score: obj,
          spShortfall: spConditionShortfall(members, this.input.spMin),
        });
      }
      // ポートフォリオ×全分割の正確評価で est を引き上げて再ランク
      for (const p of scored) {
        const ectx = this.buildEctx(p.stepping);
        for (const slots of portfolio) {
          const { obj, members } = this.preciseObjective(slots, ectx);
          if (obj > p.est) p.est = obj;
          consider({
            stepping: p.stepping,
            slots,
            score: obj,
            spShortfall: spConditionShortfall(members, this.input.spMin),
          });
        }
      }
      scored.sort((a, b) => b.est - a.est);
    }
    this.lastPartitionEsts = scored.slice(0, 9).map((p) => Math.round(p.est));

    // 3. 上位配分だけ本気のビームサーチ（非HIFは未実施ならグリーディも）。
    //    選抜プリセット込みで評価して「寄せると勝つ」編成も拾う
    // 最初のGUARANTEED_PARTS件は時計に関係なく必ず見る（結果が時計に依らず
    // 決定的になるように）。余裕があればTOP_PARTSまで広げる
    const TOP_PARTS = 10;
    // 上位配分に加えて、軸（VoDa/DaVi/VoVi）ごとに最低 AXIS_MIN_PARTS 配分は本気で見る
    const picked = scored.slice(0, TOP_PARTS);
    const perAxis = new Map<string, number>();
    for (const p of picked) {
      const k = this.axisOf(p.stepping);
      perAxis.set(k, (perAxis.get(k) ?? 0) + 1);
    }
    for (const p of scored.slice(TOP_PARTS)) {
      const k = this.axisOf(p.stepping);
      if ((perAxis.get(k) ?? 0) >= AXIS_MIN_PARTS) continue;
      picked.push(p);
      perAxis.set(k, (perAxis.get(k) ?? 0) + 1);
    }
    // 選んだ配分はすべて時計に関係なく見る（結果が時計に依らず決定的になるように）
    let searched = 0;
    for (const p of picked) {
      const ectx = this.buildEctx(p.stepping);
      const r = this.bestFormationBeam(ectx, {
        stepping: p.stepping,
      });
      searched++;
      if (r) {
        consider({
          stepping: r.stepping ?? p.stepping,
          slots: r.members.map((m) => ({ id: m.id, rental: m.rental })),
          score: r.obj,
          spShortfall: spConditionShortfall(r.members, this.input.spMin),
        });
      }
      if (this.input.scenario !== "hif" && !greedied.has(p.stepping)) {
        const g = this.buildFormation(ectx);
        greedied.add(p.stepping);
        if (g) {
          const slots = g.picks.map((x) => ({ id: x.id, rental: x.rental }));
          const { obj, members } = this.preciseObjective(slots, ectx);
          consider({
            stepping: p.stepping,
            slots,
            score: obj,
            spShortfall: spConditionShortfall(members, this.input.spMin),
          });
        }
      }
    }
    this.searchFinalists = [...bySet.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, SEARCH_FINALISTS);
    return best;
  }

  /**
   * 編成を固定して「選抜の寄せ方 × レッスン日の入れ替え」を同時に詰める（HIFのみ）。
   * どちらか一方ずつの山登りでは越えられない2手谷
   * （例: 選抜を全部Viに寄せる＋Viレッスンを小さい日へ移す）をプリセット総当たりで越える。
   */
  refineDayExamJoint(best: {
    stepping: Stepping;
    slots: SelectedSlot[];
    score: number;
    spShortfall: number;
  }): void {
    const base = best.stepping;
    if (base.kind !== "hif") return;
    // まず各プリセットを素で評価し、有望な上位だけ日入替まで回す（時間節約）
    const rated = EXAM_PRESET_RATIOS.map((ratio) => {
      const trial: Stepping = {
        ...base,
        examScores: EXAMS.map((_, i) => examScoresFromRatio(i, ratio)),
      };
      return {
        stepping: trial,
        score: this.preciseObjective(best.slots, this.buildEctx(trial)).obj,
      };
    }).sort((a, b) => b.score - a.score);
    for (const seed of rated.slice(0, 3)) {
      const cand: { stepping: Stepping; slots: SelectedSlot[]; score: number } = {
        stepping: seed.stepping,
        slots: best.slots,
        score: seed.score,
      };
      // このプリセット前提での日入替（ペア交換の山登り・正確評価）
      this.swapLessonPicks(cand);
      if (cand.score > best.score + 1e-9) {
        best.stepping = cand.stepping;
        best.score = cand.score;
      }
    }
  }

  buildFormation(ectx: Ectx) {
    const { input } = this;
    // ショートリストがあればそれだけを採点する（探索の反復で編成を
    // 組み直すときの主コストがここ。62ms→十数msに短縮）
    const { owned, rentals } = this.scorePool(ectx);
    return findBestFormation(owned, rentals, ectx.baseStats, {
      pinned: input.flags.pinned,
      spMin: input.spMin,
      cap: this.caps,
      maxTargets: this.maxTargets,
      eventBudget: input.eventBudget,
      extraScore: this.extraScore,
      examAssist: input.examAssist,
      examStyleTags: input.examStyleTags,
      // 割合の合計が6以上=固定/按分、6未満=最低枚数（残り枠は自由）
      ...(input.typeRatio ? typeConstraintFromRatio(input.typeRatio) : {}),
      minStat: this.minStatCond,
    });
  }


  /** 最終的な評価値（計算ページと同じ式・シナリオ別の固定部分込み） */
  /**
   * 候補が条件設定（SP率持ちの最低枚数・最低ステ・最高ステ）を満たしていない点を列挙する。
   * 探索の目的関数はこれらをペナルティ/割引で扱うため、評価値だけ見ると高い候補が
   * 採用されないことがある。その理由を画面に出すために使う。
   */
  conditionIssues(
    members: ScoredCard[],
    stats: Record<TypeKey, number>,
  ): string[] {
    const issues: string[] = [];
    const short = spConditionShortfall(members, this.input.spMin);
    if (short > 0) issues.push(`SP率持ちが${short}枚不足`);
    const label: Record<TypeKey, string> = { vocal: "Vo", dance: "Da", visual: "Vi" };
    if (this.minStatCond) {
      for (const t of this.minStatCond.priority) {
        const req = this.minStatCond.req[t];
        if (req > 0 && stats[t] < req) issues.push(`最低ステ${label[t]}未達`);
      }
    }
    for (const t of TYPE_KEYS) {
      if (stats[t] > this.maxTargets[t] + 1e-9) issues.push(`最高ステ${label[t]}超過`);
    }
    return issues;
  }

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
    // ワッペン発動回数 = 札取得回数（セットのスキル獲得＋編成サポカのスキル獲得分）。最大20回
    const wappen = Math.min(WAPPEN_MAX, this.fudaBase + this.supportFudaOf(members));
    const totalStar = 15 * wappen + sched.star + finalStar;
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
