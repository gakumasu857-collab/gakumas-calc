/**
 * サポカ理想編成の計算ロジック。
 *
 * カード1枚の点数はスプシ検証済みエンジン（sheetScore）＋アイテム補正（自動計算）。
 * カードのロール（メイン1/メイン2/サブ）は「そのカードのタイプが
 * 計算ページの『レッスンの踏み方』でどのロールに割り当てられているか」で決まる。
 *
 * 編成のルール:
 * - Pアイドルのプランに合うカードのみ（共通は誰でも可）
 * - レンタル枠が必ず1枠（全カードから完凸を1枚借りる。レンタルNGは除外）
 * - 前イベ・後イベによる発動回数の上乗せ（イベント相互作用）を編成全体で評価
 * - アシスト（トレーナー）は枠ごとに abi_type 列のタイプへ効く
 */
import { SUPPORT_CARD_DB, type SupportCardData } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import {
  abilityValuesByCountKey,
  cardBonusPercent,
  clampExtraCount,
  eventActivations,
  eventCountContributionSplit,
  itemCorrectionAuto,
  paraboConvert,
  postEventActivations,
  postEventStatRelevant,
  sheetScore,
  slotAbilityEntry,
  type SheetRole,
  type SheetScoreContext,
} from "./sheetScore";
import type { TypeKey } from "./useCalcSettings";

const TYPE_OF_CARD: Record<string, TypeKey> = {
  Vocal: "vocal",
  Dance: "dance",
  Visual: "visual",
};
const TYPE_LIST: TypeKey[] = ["vocal", "dance", "visual"];

export type ScoredCard = {
  id: string;
  name: string;
  image: string;
  rarity: string;
  type: TypeKey;
  /**
   * アシスト（トレーナー）カードか。
   * アシストは枠ごとに効くタイプが違う（abi_type列）。points は全タイプ合計、
   * タイプ別の内訳は pointsByType / valuesByKeyByType に持つ。type は内部都合で vocal。
   */
  assist?: boolean;
  /** アシスト用: タイプ別のアビリティ点（イベント相互作用・アイテム補正は含まない） */
  pointsByType?: Record<TypeKey, number>;
  /** アシスト用: タイプ別の「回数キー→効果量」（シナジーのタイプ割当に使う） */
  valuesByKeyByType?: Record<TypeKey, Record<string, number>>;
  /** 凸数(0〜4) */
  level: number;
  /** ステータス貢献（sheetScore＋アイテム補正。イベント相互作用は含まない） */
  points: number;
  /** うちアイテム補正分 */
  itemBonus: number;
  /** このカードが持つパラメータボーナス%（凸考慮後） */
  bonusPercent: number;
  /** レンタル枠のカード（完凸） */
  rental: boolean;
  /** SPレッスン率アップ持ちか（SP最低枚数条件用） */
  hasSpUp: boolean;
  /**
   * 「試験の助けになる度」のスタイル非依存部分（ドリンク獲得＋SP率持ち。ステ換算）。
   * 試験補助を強めるON時に目的関数へ足す。表示値には含めない。
   */
  examAssist: number;
  /**
   * 試験補助のアイテム評点部分（strongest×重み）。アイテムのおすすめスタイル
   * （recommendPlans）が現在の育成スタイルに合うときだけ加点する。
   */
  examAssistRating: number;
  /** アイテムのおすすめ育成スタイル（recommend_plan列。共通=どのスタイルでも有効） */
  recommendPlans: string[];
  /** 前イベ・後イベが編成全体に与える発動回数の上乗せ（回数キー→回数。前後の合算） */
  eventContrib: Record<string, number>;
  /** 前イベ分の上乗せ（合計発動回数の予算スケール用） */
  preContrib: Record<string, number>;
  /** 後イベ分の上乗せ（同上） */
  postContrib: Record<string, number>;
  /** 前イベの発動回数（予算の分母） */
  preActs: number;
  /** 後イベの発動回数（0/1。予算の分母） */
  postActs: number;
  /** 回数キー→アビリティ効果量の合計（イベント相互作用の受け手側） */
  valuesByKey: Record<string, number>;
  /** 回数キー→基本回数（「〜回まで」の上限クランプ用） */
  baseCounts: Record<string, number>;
};

/** カタログの画像をIDで引けるように */
const IMAGE_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c.image]));

export type CardFlagSets = {
  banned: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  rentalNg?: ReadonlySet<string>;
};

export type FormationOptions = {
  flags?: CardFlagSets;
  /** Pアイドルのプラン（センス/ロジック/アノマリー）。フリー・未指定は制限なし */
  plan?: string | null;
  /**
   * ステージ（試験中）に持ち込むPアイテムのサポカを候補から外す。
   * 固定（ピン）されたカードは除外しない（固定は条件を貫通する）。
   */
  noStageItems?: boolean;
};

/** プラン制限: 共通は誰でも可、それ以外はPアイドルのプランと一致が必要 */
export function planAllows(
  cardPlan: string,
  plan: string | null | undefined,
): boolean {
  if (!plan || plan === "フリー") return true;
  return cardPlan === "" || cardPlan === "共通" || cardPlan === plan;
}

function scoreCard(
  card: SupportCardData,
  level: number,
  ctx: SheetScoreContext,
  typeRole: Partial<Record<TypeKey, SheetRole>>,
  rental: boolean,
): ScoredCard | null {
  // アシスト（トレーナー）: 枠ごとに abi_type 列のタイプへ効く（Assist枠=非ステ）。
  const assist = card.cardType === "アシスト";
  const type = assist ? "vocal" : TYPE_OF_CARD[card.cardType];
  if (!type) return null;
  const role = assist ? "main1" : typeRole[type];
  if (!role) return null; // ロール未割当のタイプ

  let base: number;
  let pointsByType: Record<TypeKey, number> | undefined;
  let valuesByKeyByType: Record<TypeKey, Record<string, number>> | undefined;
  let valuesByKey: Record<string, number>;
  if (assist) {
    pointsByType = { vocal: 0, dance: 0, visual: 0 };
    valuesByKeyByType = { vocal: {}, dance: {}, visual: {} };
    valuesByKey = {};
    for (const slotIndex of [0, 1, 3, 4, 5]) {
      const slotType = TYPE_OF_CARD[card.abilityTypes[slotIndex]];
      if (!slotType) continue; // Assist枠（率系・P系・回復系）はステ計算外
      const slotRole = typeRole[slotType];
      if (!slotRole) continue;
      const entry = slotAbilityEntry(card, level, slotRole, slotIndex);
      if (!entry) continue;
      pointsByType[slotType] += entry.value * ctx.counts(entry.countKey);
      valuesByKeyByType[slotType][entry.countKey] =
        (valuesByKeyByType[slotType][entry.countKey] ?? 0) + entry.value;
      valuesByKey[entry.countKey] =
        (valuesByKey[entry.countKey] ?? 0) + entry.value;
    }
    base = TYPE_LIST.reduce((sum, t) => sum + pointsByType![t], 0);
  } else {
    const score = sheetScore(card, level, role, ctx);
    if (score === null) return null; // ティア表なし等、計算不能
    base = score;
    valuesByKey = abilityValuesByCountKey(card, level, role);
  }
  const itemBonus = itemCorrectionAuto(card, role, ctx)?.points ?? 0;
  const baseCounts: Record<string, number> = {};
  for (const key in valuesByKey) baseCounts[key] = ctx.counts(key);
  const contrib = eventCountContributionSplit(card, role, ctx);
  const eventContrib: Record<string, number> = { ...contrib.pre };
  for (const key in contrib.post) {
    eventContrib[key] = (eventContrib[key] ?? 0) + contrib.post[key];
  }
  const hasSpUp = card.abilities.some(
    (slot) => slot && "key" in slot && slot.key === "up_SP_lesson_rate",
  );
  // 試験の助けになる度: ドリンク獲得本数＋SP率持ち（スタイル非依存）と、
  // アイテム評価（空欄=0。負の評点は弱いだけなので0扱い。スタイル一致時のみ加点）。
  // ステ点はそのまま目的関数に残るので「ステも高い」カードほど自然に勝つ。
  const drinkCount = Number(card.extras["ドリンク獲得"] ?? 0) || 0;
  const examAssist =
    EXAM_ASSIST_WEIGHTS.drink * drinkCount +
    (hasSpUp ? EXAM_ASSIST_WEIGHTS.spRate : 0);
  const examAssistRating =
    EXAM_ASSIST_WEIGHTS.rating * Math.max(0, card.strongest ?? 0);
  return {
    id: card.id,
    name: card.name,
    image: IMAGE_BY_ID.get(card.id) ?? card.imageUrl,
    rarity: card.rarity,
    type,
    assist,
    pointsByType,
    valuesByKeyByType,
    level,
    points: base + itemBonus,
    itemBonus,
    bonusPercent: cardBonusPercent(card, level),
    rental,
    hasSpUp,
    examAssist,
    examAssistRating,
    recommendPlans: card.recommendPlans,
    eventContrib,
    preContrib: contrib.pre,
    postContrib: contrib.post,
    preActs: eventActivations(card, role, ctx),
    postActs: postEventStatRelevant(card)
      ? postEventActivations(card, ctx)
      : 0,
    valuesByKey,
    baseCounts,
  };
}

export type SelectedSlot = { id: string; rental: boolean };

const DB_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

/**
 * 計算ページの「選択サポカ」スロットをスコア化する。
 * レンタルは完凸、それ以外は所持凸（未所持は完凸レンタル扱い）。
 * 計算不能（アシスト・R・ロール未割当）は null。
 */
export function scoreSelectedCards(
  slots: (SelectedSlot | null)[],
  getLevel: (id: string) => number,
  ctx: SheetScoreContext,
  typeRole: Partial<Record<TypeKey, SheetRole>>,
): (ScoredCard | null)[] {
  return slots.map((slot) => {
    if (!slot) return null;
    const card = DB_BY_ID.get(slot.id);
    if (!card) return null;
    const owned = getLevel(slot.id);
    const rental = slot.rental || owned < 0;
    const level = rental ? 4 : owned;
    return scoreCard(card, level, ctx, typeRole, rental);
  });
}

/** 所持サポカ全員の点数を計算する（BAN・プラン外・未所持・アシスト・R等は除外） */
export function scoreOwnedCards(
  getLevel: (id: string) => number,
  ctx: SheetScoreContext,
  typeRole: Partial<Record<TypeKey, SheetRole>>,
  opts?: FormationOptions,
): ScoredCard[] {
  const result: ScoredCard[] = [];
  for (const card of SUPPORT_CARD_DB) {
    if (opts?.flags?.banned.has(card.id)) continue;
    if (!planAllows(card.plan, opts?.plan)) continue;
    if (excludedStageItem(card, opts)) continue;
    const level = getLevel(card.id);
    if (level < 0) continue; // 未所持
    const scored = scoreCard(card, level, ctx, typeRole, false);
    if (scored) result.push(scored);
  }
  return result;
}

/** ステージアイテム除外の対象か（固定カードは貫通して残す） */
function excludedStageItem(
  card: SupportCardData,
  opts: FormationOptions | undefined,
): boolean {
  return (
    !!opts?.noStageItems &&
    card.stageItem &&
    !opts?.flags?.pinned.has(card.id)
  );
}

/** レンタル枠の候補（全カードの完凸。BAN・レンタルNG・プラン外は除外） */
export function scoreRentalCandidates(
  ctx: SheetScoreContext,
  typeRole: Partial<Record<TypeKey, SheetRole>>,
  opts?: FormationOptions,
): ScoredCard[] {
  const result: ScoredCard[] = [];
  for (const card of SUPPORT_CARD_DB) {
    if (opts?.flags?.banned.has(card.id)) continue;
    if (opts?.flags?.rentalNg?.has(card.id)) continue;
    if (!planAllows(card.plan, opts?.plan)) continue;
    if (excludedStageItem(card, opts)) continue;
    const scored = scoreCard(card, 4, ctx, typeRole, true);
    if (scored) result.push(scored);
  }
  return result;
}

export type FormationPick = ScoredCard & {
  /** イベント相互作用によるこのカードの追加点 */
  synergy: number;
};

export type Formation = {
  /** タイプごとの採用枚数 */
  counts: Record<TypeKey, number>;
  picks: FormationPick[];
  /** タイプごとの最終値（上限適用後）と上限超過前の生値（イベント相互作用込み） */
  totals: Record<TypeKey, { capped: number; raw: number }>;
  /** 3タイプ合計（上限適用後） */
  score: number;
  /** レンタル枠のカード（無ければ null） */
  rental: FormationPick | null;
  /** SP最低枚数条件の不足数（0なら条件を満たしている） */
  spShortfall: number;
};

export const STAT_CAP = 3200;
export const DECK_SIZE = 6;

/**
 * ステータス上限。数値ならシナリオ上限（全タイプ共通）、
 * Recordならタイプ別上限（「最高ステータス」設定＝min(シナリオ上限, 設定値)）。
 */
export type StatCaps = number | Record<TypeKey, number>;

/** タイプ別の上限値を取り出す */
export function capFor(cap: StatCaps, type: TypeKey): number {
  return typeof cap === "number" ? cap : cap[type];
}

/**
 * 編成割合の設定値 → findBestFormation の構成条件。
 * 合計が6以上なら比率どおり6枚へ按分して固定（6ちょうどはそのまま）、
 * 合計が6未満なら指定枚数を最低条件にして残り枠は自由に探索する。
 */
export function typeConstraintFromRatio(
  ratio: Record<TypeKey, number>,
): Pick<FindBestOptions, "typeCounts" | "typeMinCounts"> {
  const clean: Record<TypeKey, number> = {
    vocal: Math.max(0, ratio.vocal || 0),
    dance: Math.max(0, ratio.dance || 0),
    visual: Math.max(0, ratio.visual || 0),
  };
  const sum = clean.vocal + clean.dance + clean.visual;
  if (sum <= 0) return {};
  if (sum >= DECK_SIZE) return { typeCounts: typeCountsFromRatio(clean) };
  return { typeMinCounts: clean };
}

/**
 * タイプ比率（例 1:3:2）を編成の6枚へ最大剰余法で配分したタイプ構成。
 * サポカ編成のタイプ割合固定に使う。
 */
export function typeCountsFromRatio(
  ratio: Record<TypeKey, number>,
): Record<TypeKey, number> {
  const weights = TYPE_LIST.map((t) => Math.max(0, ratio[t] || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  if (total <= 0) {
    counts.vocal = DECK_SIZE;
    return counts;
  }
  const raw = weights.map((w) => (w / total) * DECK_SIZE);
  TYPE_LIST.forEach((t, i) => (counts[t] = Math.floor(raw[i])));
  let rem =
    DECK_SIZE - TYPE_LIST.reduce((sum, t) => sum + counts[t], 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0; k++, rem--) counts[TYPE_LIST[order[k % 3].i]]++;
  return counts;
}

/** シード探索でタイプごとに残すレンタル候補数（山登りでは全候補を見る） */
const PRUNE_RENTAL = 8;
/** 山登りの多点スタート数（上位シードから） */
const SEED_STARTS = 4;
/** 編成の山登りの最大ラウンド数（改善が無くなれば途中で抜ける） */
const CLIMB_ROUNDS = 15;

export type EvalResult = {
  totals: Formation["totals"];
  score: number;
  synergies: number[];
  /** アシストのタイプ別シナジー内訳（アシスト以外は null） */
  synergiesByType: (Record<TypeKey, number> | null)[];
};

/** SP最低枚数条件（タイプごとのSPレッスン率アップ持ちの最低枚数） */
export type SpMinCondition = Partial<Record<TypeKey, number>>;

/**
 * タイプ別の最低ステータス条件。
 * req[type] > 0 のタイプだけが対象。全部満たせないときは priority の並び
 * （アイドルの審査基準が高い順）で優先して満たす。
 */
export type MinStatCondition = {
  req: Record<TypeKey, number>;
  priority: TypeKey[];
};

/**
 * 優先度別の重み。上位の条件を満たすことが「下位の条件すべて＋ステ差」より
 * 常に勝つ大きさにして、辞書式（審査基準順）の優先度を作る。
 */
export const MIN_STAT_WEIGHTS = [40_000_000, 2_000_000, 100_000];

/**
 * 最低ステータス条件のボーナス点。満たせば重みの満額、足りない間は
 * 進み具合に応じた半額まで（山登りが条件へ向かう勾配になる）。
 */
export function minStatBonus(
  stats: Record<TypeKey, number>,
  cond: MinStatCondition | undefined,
): number {
  if (!cond) return 0;
  let bonus = 0;
  let level = 0;
  for (const type of cond.priority) {
    const req = cond.req[type];
    if (!(req > 0)) continue;
    const weight = MIN_STAT_WEIGHTS[level++] ?? 0;
    const stat = stats[type];
    bonus +=
      stat >= req ? weight : (0.5 * weight * Math.max(0, stat)) / req;
  }
  return bonus;
}

/** SP条件の不足数（0なら条件クリア） */
export function spConditionShortfall(
  members: ScoredCard[],
  spMin: SpMinCondition | undefined,
): number {
  if (!spMin) return 0;
  const have: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  for (const m of members) if (m.hasSpUp) have[m.type]++;
  let short = 0;
  for (const type of TYPE_LIST) {
    short += Math.max(0, (spMin[type] ?? 0) - have[type]);
  }
  return short;
}

/**
 * パラメータボーナスを「全ソース合算→1回で変換」し直したタイプ別のサポカ合計。
 * ゲームはパラボを合算してからイベントごとに切り捨てるため、
 * カードごとに個別変換（スプシ方式・編成探索で使用）より正確。
 * @param basePct メモリー＋Pアイドル由来の%（タイプ別）。変換結果 conv に含まれる
 * @returns タイプ別 { support: パラボ抜きサポカ点＋シナジー, conv: 合算%の変換値, totalPct }
 */
export function summedParaboByType(
  members: ScoredCard[],
  synergies: number[],
  ctx: SheetScoreContext,
  typeRole: Partial<Record<TypeKey, SheetRole>>,
  basePct: Record<TypeKey, number>,
  synergiesByType?: (Record<TypeKey, number> | null)[],
): Record<TypeKey, { support: number; conv: number; totalPct: number }> {
  const acc = {
    vocal: { support: 0, pct: 0 },
    dance: { support: 0, pct: 0 },
    visual: { support: 0, pct: 0 },
  };
  members.forEach((m, i) => {
    if (m.assist && m.pointsByType) {
      // アシストは枠ごとの効果タイプ（abi_type）に従って各タイプへ配る（パラボは持たない）
      const byType = synergiesByType?.[i] ?? null;
      let assigned = 0;
      for (const t of TYPE_LIST) {
        acc[t].support += m.pointsByType[t] + (byType?.[t] ?? 0);
        assigned += m.pointsByType[t];
      }
      // points に含まれるアイテム補正分は type 側へ
      acc[m.type].support += m.points - assigned;
      return;
    }
    const role = typeRole[m.type];
    const g = role ? ctx.gains[role] : undefined;
    // 各カードの点数から自前のパラボ変換分を抜く（あとで合算して変換し直す）
    const ownParabo = g
      ? paraboConvert(m.bonusPercent / 100, g.lessons, g.exams)
      : 0;
    acc[m.type].support += m.points - ownParabo + (synergies[i] ?? 0);
    acc[m.type].pct += m.bonusPercent;
  });
  const out = {} as Record<
    TypeKey,
    { support: number; conv: number; totalPct: number }
  >;
  for (const type of TYPE_LIST) {
    const role = typeRole[type];
    const g = role ? ctx.gains[role] : undefined;
    const totalPct = (basePct[type] ?? 0) + acc[type].pct;
    out[type] = {
      support: acc[type].support,
      conv: g ? paraboConvert(totalPct / 100, g.lessons, g.exams) : 0,
      totalPct: Math.round(totalPct * 10) / 10,
    };
  }
  return out;
}

/** 編成全員の前イベ・後イベによる発動回数の上乗せを合算する（詳細モーダルでも使用） */
export function sumEventContrib(
  members: ScoredCard[],
): Record<string, number> {
  const extra: Record<string, number> = {};
  for (const m of members) {
    for (const key in m.eventContrib) {
      extra[key] = (extra[key] ?? 0) + m.eventContrib[key];
    }
  }
  return extra;
}

/**
 * 理論評価値用: 編成全体の前イベ取得数・後イベ発動数の上限。
 * 前イベはカード1枚=取得1回で数える。実際の合計が上限を超える場合、
 * 比例配分でスケールして評価する。
 */
export type EventBudget = { pre?: number; post?: number };

/** 予算に対する前イベ・後イベのスケール係数（1以下。予算なし・余裕ありなら1） */
export function eventBudgetScales(
  members: ScoredCard[],
  budget: EventBudget | undefined,
): { pre: number; post: number } {
  if (!budget) return { pre: 1, post: 1 };
  // 前イベは取得回数（=前イベを持つカード枚数）で予算を数える
  const totalPre = members.reduce((sum, m) => sum + (m.preActs > 0 ? 1 : 0), 0);
  const totalPost = members.reduce((sum, m) => sum + m.postActs, 0);
  return {
    pre:
      budget.pre !== undefined && totalPre > budget.pre
        ? budget.pre / totalPre
        : 1,
    post:
      budget.post !== undefined && totalPost > budget.post
        ? budget.post / totalPost
        : 1,
  };
}

/**
 * 編成の合計を評価する（イベント相互作用込み・タイプ上限はシナリオ依存）。選択サポカの評価にも使う。
 * @param budget 前イベ取得数（カード1枚=1）・後イベ発動数の上限（理論評価値用）。
 *   超過分は比例配分でスケールし、前イベ由来のアイテム補正も同率で目減りさせる。
 */
export function evaluateTeam(
  members: ScoredCard[],
  base: Record<TypeKey, number>,
  cap: StatCaps = STAT_CAP,
  budget?: EventBudget,
): EvalResult {
  const scales = eventBudgetScales(members, budget);
  const extra: Record<string, number> = {};
  for (const m of members) {
    for (const key in m.preContrib) {
      extra[key] = (extra[key] ?? 0) + m.preContrib[key] * scales.pre;
    }
    for (const key in m.postContrib) {
      extra[key] = (extra[key] ?? 0) + m.postContrib[key] * scales.post;
    }
  }
  const raw: Record<TypeKey, number> = {
    vocal: base.vocal,
    dance: base.dance,
    visual: base.visual,
  };
  const synergiesByType: (Record<TypeKey, number> | null)[] = [];
  const synergies = members.map((m) => {
    // アシストは枠ごとのタイプ別にシナジーを分けて数える
    if (m.assist && m.valuesByKeyByType) {
      const byType: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const type of TYPE_LIST) {
        const values = m.valuesByKeyByType[type];
        for (const key in values) {
          const e = extra[key];
          if (!e) continue;
          const effective = clampExtraCount(key, m.baseCounts[key] ?? 0, e);
          if (effective > 0) byType[type] += values[key] * effective;
        }
      }
      synergiesByType.push(byType);
      return byType.vocal + byType.dance + byType.visual;
    }
    synergiesByType.push(null);
    let syn = 0;
    for (const key in m.valuesByKey) {
      const e = extra[key];
      if (!e) continue;
      // 「〜回まで」の上限を超える上乗せは効果なし
      const effective = clampExtraCount(key, m.baseCounts[key] ?? 0, e);
      if (effective > 0) syn += m.valuesByKey[key] * effective;
    }
    return syn;
  });
  members.forEach((m, i) => {
    // 前イベが予算で目減りする分、アイテム補正（発動回数×上昇値）も同率で引く
    const itemAdj = -(1 - scales.pre) * m.itemBonus;
    if (m.assist && m.pointsByType) {
      const byType = synergiesByType[i];
      let assigned = 0;
      for (const type of TYPE_LIST) {
        raw[type] += m.pointsByType[type] + (byType?.[type] ?? 0);
        assigned += m.pointsByType[type];
      }
      // points に含まれるアイテム補正分（points − タイプ別合計）と予算調整は type 側へ
      raw[m.type] += m.points - assigned + itemAdj;
    } else {
      raw[m.type] += m.points + synergies[i] + itemAdj;
    }
  });
  const totals = {} as Formation["totals"];
  let score = 0;
  for (const type of TYPE_LIST) {
    const capped = Math.min(capFor(cap, type), raw[type]);
    totals[type] = { capped, raw: raw[type] };
    score += capped;
  }
  return { totals, score, synergies, synergiesByType };
}

function groupByType(
  cards: ScoredCard[],
  value: (c: ScoredCard) => number = (c) => c.points,
): Record<TypeKey, ScoredCard[]> {
  const pools: Record<TypeKey, ScoredCard[]> = {
    vocal: [],
    dance: [],
    visual: [],
  };
  for (const card of cards) pools[card.type].push(card);
  for (const type of TYPE_LIST) pools[type].sort((a, b) => value(b) - value(a));
  return pools;
}

export type FindBestOptions = {
  /** 固定カード（必ず採用） */
  pinned?: ReadonlySet<string>;
  /** タイプごとのSPレッスン率アップ持ちの最低枚数条件 */
  spMin?: SpMinCondition;
  /** ステータス上限（シナリオ上限、またはタイプ別の最高ステ設定。省略時は3200） */
  cap?: StatCaps;
  /** 編成全体の前イベ・後イベの合計発動回数の上限（理論評価値用） */
  eventBudget?: EventBudget;
  /**
   * ステ以外の編成価値（ステ換算値で返す）。
   * NIAの札（スキルカード獲得→ファン投票数→評価値）などに使う。
   */
  extraScore?: (members: ScoredCard[]) => number;
  /** 試験補助を強める（各カードの examAssist を目的関数へ足す）。省略時OFF */
  examAssist?: boolean;
  /** 現在の育成スタイルタグ（試験補助のアイテム評点をゲートする）。null=ゲートなし */
  examStyleTags?: string[] | null;
  /** サポカ編成のタイプ構成（Vo/Da/Vi各枚数・合計6）。指定するとこの構成に固定 */
  typeCounts?: Record<TypeKey, number>;
  /**
   * タイプごとの最低採用枚数（合計6未満の割合指定）。
   * 指定枚数ぶんはそのタイプを必ず採用し、残り枠は自由に探索する。
   */
  typeMinCounts?: Record<TypeKey, number>;
  /** タイプ別の最低ステータス条件（審査基準順の優先つき） */
  minStat?: MinStatCondition;
  /**
   * タイプ別の最高ステータス目標（ソフト上限）。超過分の価値を
   * MAX_STAT_EXCESS_WEIGHT まで割り引いて「積みに行かない」ようにする。
   * 評価値そのもの（cap での頭打ち）はシナリオ上限のまま。
   */
  maxTargets?: Record<TypeKey, number>;
};

/**
 * 「試験補助を強める」の重み（1点＝ステ1相当で目的関数へ足す）。
 * 対象は (1) アイテム評価（strongest列。空欄=助けにならない→加点なし）
 * (2) 前イベのドリンク獲得 (3) SPレッスン率アップ持ち。
 * ステはΣmin(上限,ステ)で評価に残るので「ステも高い」カードが自然に優先され、
 * 最低ステ条件（minStat）が下限の歯止めになる。
 */
export const EXAM_ASSIST_WEIGHTS = {
  /** アイテム評価1点あたり（例: 評点5 → ステ400相当の優先度） */
  rating: 80,
  /** ドリンク獲得1本あたり */
  drink: 80,
  /** SPレッスン率アップ持ち1枚あたり */
  spRate: 60,
} as const;

/**
 * 発動回数セット名の接頭辞 → アイテムおすすめ（recommend_plan列）のスタイルタグ。
 * センス育成のアイテム評価は「好調/集中」向け、といった対応。
 */
const SET_STYLE_TAGS: [string, string[]][] = [
  ["センス", ["好調", "集中"]],
  ["好印象", ["好印象"]],
  ["やる気", ["やる気"]],
  ["強気", ["強気"]],
  ["全力", ["全力"]],
];

/** 発動回数セット名から現在の育成スタイルタグを引く（不明なら null=ゲートしない） */
export function examStyleTags(
  setName: string | null | undefined,
): string[] | null {
  if (!setName) return null;
  for (const [prefix, tags] of SET_STYLE_TAGS) {
    if (setName.startsWith(prefix)) return tags;
  }
  return null;
}

/**
 * カード1枚の試験補助価値。評点（アイテム評価）はおすすめスタイルが
 * 現在の育成スタイルに合うときだけ加点する（好印象育成にやる気アイテムは不要）。
 * スタイル不明（セット未選択等）・おすすめ記載なしはゲートせずそのまま加点。
 */
export function examAssistValueOf(
  c: ScoredCard,
  styleTags?: string[] | null,
): number {
  const ratingOk =
    !styleTags ||
    c.recommendPlans.length === 0 ||
    c.recommendPlans.includes("共通") ||
    c.recommendPlans.some((p) => styleTags.includes(p));
  return c.examAssist + (ratingOk ? c.examAssistRating : 0);
}

/** 編成の「試験の助けになる度」合計（試験補助を強めるON時の加点） */
export function examAssistSum(
  members: ScoredCard[],
  styleTags?: string[] | null,
): number {
  let sum = 0;
  for (const m of members) sum += examAssistValueOf(m, styleTags);
  return sum;
}

/**
 * 最高ステータス設定の超過分に残す価値の割合（探索用のソフト上限）。
 * 設定値を超えた分も評価値には全額入る（ゲームでも実際に付く）が、
 * 探索では価値をこの割合まで割り引いて「わざわざ積みに行かない」ようにする。
 * 0より大きくしておくことで、他タイプが上限で溢れて流れ込むぶんを
 * 選抜スコアの微調整で削るような不毛な動きも起きない（削っても得しない）。
 */
export const MAX_STAT_EXCESS_WEIGHT = 0.05;

/**
 * SP条件の不足1枚あたりのペナルティ。
 * 最低ステータス条件の重み合計より大きくして、SP条件を常に最優先にする。
 */
export const SP_PENALTY = 1_000_000_000;

type Seed = { members: ScoredCard[]; score: number };

/** 編成の同一性キー（並び順は問わない。レンタルは別枠扱い） */
const seedKeyOf = (members: ScoredCard[]) =>
  members
    .map((m) => m.id + (m.rental ? "*" : ""))
    .sort()
    .join("|");

/** 点数上位 limit 件だけを重複なしで保持するシード集め */
function seedCollector(limit: number) {
  const seeds: Seed[] = [];
  const keys = new Set<string>();
  return {
    push(members: ScoredCard[], score: number) {
      // 既に満杯で最下位より低いなら見るまでもない
      if (seeds.length >= limit && score <= seeds[seeds.length - 1].score)
        return;
      const key = seedKeyOf(members);
      if (keys.has(key)) return;
      keys.add(key);
      seeds.push({ members, score });
      seeds.sort((a, b) => b.score - a.score);
      if (seeds.length > limit) keys.delete(seedKeyOf(seeds.pop()!.members));
    },
    list: (): Seed[] => seeds,
  };
}

/**
 * 固定カード（pinned）の割り振り。
 * 未所持の固定はレンタル枠を使う（複数あれば最高点の1枚だけ）。
 * 所持の固定はレンタル枠を除いた残り枠まで採用する。
 */
function resolvePinned(
  owned: ScoredCard[],
  rentals: ScoredCard[],
  pinnedIds: ReadonlySet<string> | undefined,
  useRental: boolean,
): { pinnedRental: ScoredCard | null; ownedPinned: ScoredCard[] } {
  const ownedIds = new Set(owned.map((c) => c.id));
  const byPoints = (a: ScoredCard, b: ScoredCard) => b.points - a.points;
  const pinnedRental =
    rentals
      .filter((c) => pinnedIds?.has(c.id) && !ownedIds.has(c.id))
      .sort(byPoints)[0] ?? null;
  const ownedPinned = owned
    .filter((c) => pinnedIds?.has(c.id))
    .sort(byPoints)
    .slice(0, DECK_SIZE - (useRental ? 1 : 0));
  return { pinnedRental, ownedPinned };
}

/**
 * SP最低枚数条件を満たすため、タイプごとに上位のSP持ちを先取りする（シードに必ず含める）。
 * タイプ構成を固定するときは先取りが構成と衝突しうるので行わない（SPはペナルティで考慮）。
 */
function pickSpForced(
  pools: Record<TypeKey, ScoredCard[]>,
  ownedPinned: ScoredCard[],
  spMin: SpMinCondition | undefined,
  typeConstrained: boolean,
): ScoredCard[] {
  if (!spMin || typeConstrained) return [];
  const forced: ScoredCard[] = [];
  for (const type of TYPE_LIST) {
    const already = ownedPinned.filter(
      (c) => c.type === type && c.hasSpUp,
    ).length;
    const need = Math.max(0, (spMin[type] ?? 0) - already);
    forced.push(...pools[type].filter((c) => c.hasSpUp).slice(0, need));
  }
  return forced;
}

/** シード探索と山登りが共有する探索の材料 */
type SearchCtx = {
  evalPenalized: (members: ScoredCard[]) => number;
  /** 固定・SP先取りを除いたタイプ別の所持カード（点数順） */
  pools: Record<TypeKey, ScoredCard[]>;
  usableRentals: ScoredCard[];
  ownedPinned: ScoredCard[];
  spForced: ScoredCard[];
  spForcedIds: Set<string>;
  typeCounts?: Record<TypeKey, number>;
  typeMinCounts?: Record<TypeKey, number>;
  pinnedIds?: ReadonlySet<string>;
};

/**
 * シード探索: レンタル候補 × 残り枠のタイプ枚数配分を全列挙し、各タイプは上位から取る。
 * 上限3200の溢れやイベント相互作用は上位取りだけでは拾えないため、
 * 上位シードを複数残して山登りを多点スタートする。
 */
function collectSeeds(ctx: SearchCtx, rentalSeeds: (ScoredCard | null)[]): Seed[] {
  const collector = seedCollector(SEED_STARTS);
  for (const rental of rentalSeeds) {
    const forced = ctx.spForced.filter((c) => !rental || c.id !== rental.id);
    const fixed = [
      ...ctx.ownedPinned,
      ...forced,
      ...(rental ? [rental] : []),
    ].slice(0, DECK_SIZE);
    const slots = DECK_SIZE - fixed.length;
    if (slots < 0) continue;

    // レンタル・SP先取りと同名の所持カードは併用不可
    const usable = {} as Record<TypeKey, ScoredCard[]>;
    for (const type of TYPE_LIST) {
      usable[type] = ctx.pools[type].filter(
        (c) => !ctx.spForcedIds.has(c.id) && (!rental || c.id !== rental.id),
      );
    }
    const takeAndPush = (v: number, d: number, s: number) => {
      if (
        v > usable.vocal.length ||
        d > usable.dance.length ||
        s > usable.visual.length
      )
        return;
      const members = [
        ...fixed,
        ...usable.vocal.slice(0, v),
        ...usable.dance.slice(0, d),
        ...usable.visual.slice(0, s),
      ];
      collector.push(members, ctx.evalPenalized(members));
    };

    if (ctx.typeCounts) {
      // タイプ構成を固定: 残り枠は typeCounts − fixed の各タイプ枚数で確定。
      // 固定（ピン）カードだけは構成を超えていても優先し（固定は条件を貫通する）、
      // 超過分は需要が一番大きいタイプの枠から差し引いて帳尻を合わせる。
      // ピン以外の確定枠（レンタル・SP先取り）は構成に収まらなければこの候補は捨てる。
      const fc: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      const pinnedFc: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const c of fixed) {
        fc[c.type]++;
        if (ctx.pinnedIds?.has(c.id)) pinnedFc[c.type]++;
      }
      const overflow = TYPE_LIST.some(
        (t) =>
          fc[t] - pinnedFc[t] >
          Math.max(0, ctx.typeCounts![t] - pinnedFc[t]),
      );
      if (overflow) continue;
      const need = {
        vocal: Math.max(0, ctx.typeCounts.vocal - fc.vocal),
        dance: Math.max(0, ctx.typeCounts.dance - fc.dance),
        visual: Math.max(0, ctx.typeCounts.visual - fc.visual),
      };
      let over = need.vocal + need.dance + need.visual - slots;
      while (over > 0) {
        const t = TYPE_LIST.reduce((a, b) => (need[a] >= need[b] ? a : b));
        if (need[t] <= 0) break;
        need[t]--;
        over--;
      }
      if (need.vocal + need.dance + need.visual !== slots) continue;
      takeAndPush(need.vocal, need.dance, need.visual);
      continue;
    }
    // 最低枚数条件（合計6未満の割合指定）: 確定枠込みで各タイプの最低を満たす分割のみ
    const min = ctx.typeMinCounts;
    const fc: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    if (min) for (const c of fixed) fc[c.type]++;
    for (let v = 0; v <= slots; v++) {
      for (let d = 0; d <= slots - v; d++) {
        const s = slots - v - d;
        if (
          min &&
          (fc.vocal + v < min.vocal ||
            fc.dance + d < min.dance ||
            fc.visual + s < min.visual)
        )
          continue;
        takeAndPush(v, d, s);
      }
    }
  }
  return collector.list();
}

/** 山登り: 1枠ずつ別カードへ入れ替えて、改善が無くなるまで詰める */
function climbFormation(
  seed: Seed,
  ctx: SearchCtx,
  ownedCandidates: ScoredCard[],
): Seed {
  let members = seed.members;
  let score = seed.score;
  for (let round = 0; round < CLIMB_ROUNDS; round++) {
    let improved = false;
    for (let i = 0; i < members.length; i++) {
      const current = members[i];
      if (ctx.pinnedIds?.has(current.id)) continue; // 固定は動かさない
      const candidates = current.rental ? ctx.usableRentals : ownedCandidates;
      for (const cand of candidates) {
        if (cand.id === current.id) continue;
        // タイプ構成を固定するときは同タイプ同士の入れ替えのみ（構成を崩さない）
        if (ctx.typeCounts && cand.type !== current.type) continue;
        // 最低枚数条件: 別タイプへの入れ替えで現タイプが最低枚数を割るなら不可
        if (
          ctx.typeMinCounts &&
          cand.type !== current.type &&
          members.filter((m) => m.type === current.type).length - 1 <
            ctx.typeMinCounts[current.type]
        )
          continue;
        if (members.some((m, j) => j !== i && m.id === cand.id)) continue;
        const trial = members.slice();
        trial[i] = cand;
        const trialScore = ctx.evalPenalized(trial);
        if (trialScore > score + 1e-9) {
          score = trialScore;
          members = trial;
          improved = true;
          break; // このスロットは差し替えたので次へ
        }
      }
    }
    if (!improved) break;
  }
  return { members, score };
}

/**
 * 合計（各タイプ上限3200・イベント相互作用込み）が最大になる6枚を探す。
 * - レンタル候補があれば必ず1枠はレンタル（完凸）
 * - 固定カード（pinned）は必ず採用。未所持の固定はレンタル枠を使う（1枚まで）
 * - SP最低枚数条件は最優先（満たせない場合は spShortfall > 0 で返す）
 * - 探索: 枚数配分×上位取りのシード → 1枚入れ替えの山登りで相互作用を反映
 */
export function findBestFormation(
  owned: ScoredCard[],
  rentals: ScoredCard[],
  base: Record<TypeKey, number>,
  opts?: FindBestOptions,
): Formation | null {
  const cap = opts?.cap ?? STAT_CAP;
  const spMin = opts?.spMin;
  const evalPenalized = (members: ScoredCard[]) => {
    const team = evaluateTeam(members, base, cap, opts?.eventBudget);
    const capped: Record<TypeKey, number> = {
      vocal: team.totals.vocal.capped,
      dance: team.totals.dance.capped,
      visual: team.totals.visual.capped,
    };
    // 最高ステ設定: 超過分の価値を割り引く（評価値から削るのではなく積みに行かせない）
    let excess = 0;
    if (opts?.maxTargets) {
      for (const type of TYPE_LIST) {
        excess += Math.max(0, capped[type] - opts.maxTargets[type]);
      }
    }
    return (
      team.score -
      (1 - MAX_STAT_EXCESS_WEIGHT) * excess +
      (opts?.extraScore?.(members) ?? 0) +
      // 試験補助を強める: アイテム評価・ドリンク・SP率の合成値を加点（表示には出ない）
      (opts?.examAssist ? examAssistSum(members, opts?.examStyleTags) : 0) +
      minStatBonus(capped, opts?.minStat) -
      spConditionShortfall(members, spMin) * SP_PENALTY
    );
  };

  // ---- 固定カード・レンタル枠の確定 ----
  const useRental = rentals.length > 0;
  const { pinnedRental, ownedPinned } = resolvePinned(
    owned,
    rentals,
    opts?.pinned,
    useRental,
  );
  const ownedPinnedIds = new Set(ownedPinned.map((c) => c.id));

  // レンタル候補: 固定があればそれで確定、無ければタイプ別上位からシード
  // （固定済みカードと同名のレンタルは重複になるため除外）。
  // 試験補助を強めるときはシードの上位取りにも examAssist を効かせる
  // （山登りだけでは点数下位の補助カードへ届きにくいため）。
  const seedValue = opts?.examAssist
    ? (c: ScoredCard) => c.points + examAssistValueOf(c, opts?.examStyleTags)
    : undefined;
  const usableRentals = rentals.filter((c) => !ownedPinnedIds.has(c.id));
  const rentalPools = groupByType(usableRentals, seedValue);
  const rentalSeeds: (ScoredCard | null)[] = pinnedRental
    ? [pinnedRental]
    : useRental
      ? TYPE_LIST.flatMap((t) => rentalPools[t].slice(0, PRUNE_RENTAL))
      : [null];

  const pools = groupByType(
    owned.filter((c) => !ownedPinnedIds.has(c.id)),
    seedValue,
  );
  const spForced = pickSpForced(
    pools,
    ownedPinned,
    spMin,
    !!opts?.typeCounts || !!opts?.typeMinCounts,
  );
  const ctx: SearchCtx = {
    evalPenalized,
    pools,
    usableRentals,
    ownedPinned,
    spForced,
    spForcedIds: new Set(spForced.map((c) => c.id)),
    typeCounts: opts?.typeCounts,
    typeMinCounts: opts?.typeMinCounts,
    pinnedIds: opts?.pinned,
  };

  // ---- シード探索 → 各シードから山登り ----
  const seeds = collectSeeds(ctx, rentalSeeds);
  if (seeds.length === 0) return null;
  const ownedCandidates = owned.filter((c) => !ownedPinnedIds.has(c.id));
  let best: Seed | null = null;
  for (const seed of seeds) {
    const climbed = climbFormation(seed, ctx, ownedCandidates);
    if (!best || climbed.score > best.score) best = climbed;
  }
  // レンタル枠に選ばれたカードを自分も完凸で所持している場合、レンタルの意味が
  // 無い（点数が同じ）ので所持カード扱いに戻す。全カード完凸所持のときに
  // 「所持しているのにレンタル表記」になる紛らわしさを防ぐ。
  const ownedById = new Map(owned.map((c) => [c.id, c]));
  const members = best!.members.map((m) => {
    if (!m.rental) return m;
    const own = ownedById.get(m.id);
    return own && own.level >= 4 ? own : m;
  });

  // ---- 結果の組み立て ----
  const result = evaluateTeam(members, base, cap, opts?.eventBudget);
  const picks: FormationPick[] = members
    .map((m, i) => ({ ...m, synergy: result.synergies[i] }))
    .sort(
      (a, b) =>
        TYPE_LIST.indexOf(a.type) - TYPE_LIST.indexOf(b.type) ||
        b.points + b.synergy - (a.points + a.synergy),
    );
  const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  for (const pick of picks) counts[pick.type]++;
  return {
    counts,
    picks,
    totals: result.totals,
    score: result.score,
    rental: picks.find((p) => p.rental) ?? null,
    spShortfall: spConditionShortfall(members, spMin),
  };
}
