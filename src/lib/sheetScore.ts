/**
 * スプシ（HIF計算機）準拠のサポカ点数エンジン。
 *
 * ロジックはメイン1DB!F2のLET式の忠実移植で、
 * sheet-source/verify.js により全2,670点（178カード×0〜4凸×3ロール）が
 * シートの計算済み値と一致することを検証済み（npm run verify:sheet）。
 *
 * 点数(凸, ロール) = Σ アビリティ1,2,4,5,6:            ※アビリティ3は計算対象外
 *   ティア = 強化段階[レアリティ×枠][凸]（Ⅰ〜Ⅴ）
 *   効果量 = アビリティ性能[レアリティ×アビ名]のティア列
 *   パラメータボーナス → paraboConvert(ロール, %値) で固定値化
 *   それ以外          → 効果量 × 発動回数[ロール別回数キー]
 */
import perfData from "@/data/generated/abilityPerf.json";
import { SLOT_TIER } from "@/data/abilityValues";
import { ABILITY_NAMES, type Rarity } from "@/data/constants";
import type { SupportCardData } from "@/data/supportCardsDb";

export type SheetRole = "main1" | "main2" | "sub";
export const SHEET_ROLE_LABELS: Record<SheetRole, string> = {
  main1: "メイン1",
  main2: "メイン2",
  sub: "サブ",
};

type PerfEntry = {
  tiers: (number | null)[];
  main1: string | null;
  main2: string | null;
  sub: string | null;
};
const PERF = (perfData as { perf: Record<string, PerfEntry> }).perf;

// アビリティ性能のキーはシート表記のレアリティ（EventSSRではなく配布SSR）
const PERF_RARITY: Record<string, string> = { EventSSR: "配布SSR" };
/** アビリティ性能を「レアリティ×アビリティ名」で引く */
function perfOf(rarity: string, abiName: string): PerfEntry | undefined {
  return PERF[`${PERF_RARITY[rarity] ?? rarity}${abiName}`];
}

/** 回数変更なしアビリティの固定回数（"auto"はスケジュール自動集計） */
const FIXED_COUNTS = (
  perfData as {
    fixedCounts: Record<string, "auto" | { normal: number; hatsu: number; hif: number }>;
  }
).fixedCounts;

/** 回数変更なしアビリティの固定回数を引くシナリオ（試験・オーディションの回数が変わる） */
export type CountScenario = "normal" | "hatsu" | "hif";

/**
 * 発動回数リゾルバ。
 * @param manualCount 手動アビリティ（スキル獲得等）の回数（発動回数セットから）
 * @param lessonCount ロール別レッスン回数（メイン1レッスン等、スケジュールから）
 * @param scenario 固定回数をどのシナリオの列で引くか（NIA=normal / 初=hatsu / HIF=hif）
 */
export function buildCountResolver(
  manualCount: (label: string) => number | undefined,
  lessonCount: (label: string) => number | undefined,
  scenario: CountScenario,
): (label: string) => number {
  return (label) => {
    const fixed = FIXED_COUNTS[label];
    if (fixed !== undefined && fixed !== "auto") return fixed[scenario];
    return lessonCount(label) ?? manualCount(label) ?? 0;
  };
}

/**
 * パラボ%→固定値変換（パラボ参照用!E:I の式の移植）。
 * 各レッスン・各試験の獲得値に%を掛けて「イベントごとにfloor」して合算する。
 * @param lessonGains そのロールのレッスン8回分の獲得値
 * @param examGains そのロールの選抜試験3回分の獲得値
 */
export function paraboConvert(
  pct: number,
  lessonGains: number[],
  examGains: number[],
): number {
  let total = 0;
  for (const g of lessonGains) total += Math.floor(g * pct);
  for (const g of examGains) total += Math.floor(g * pct);
  return total;
}

/** ティア表示用（tier index 0..4 → Ⅰ..Ⅴ） */
export const TIER_LABELS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];

/**
 * 回数キーの上限（「チェンジ（3回まで）」等のラベルから抽出）。上限なしは null。
 * イベント相互作用やアイテムで回数を上乗せしても、この上限は超えられない。
 */
const CAP_RE = /[（(](\d+)回まで[)）]/;
const capCache = new Map<string, number | null>();
export function countKeyCap(label: string): number | null {
  let cap = capCache.get(label);
  if (cap === undefined) {
    const m = label.match(CAP_RE);
    cap = m ? Number(m[1]) : null;
    capCache.set(label, cap);
  }
  return cap;
}

/** 上乗せ回数を「基本回数＋上乗せが上限を超えない」ようにクランプする */
export function clampExtraCount(
  countKey: string,
  baseCount: number,
  extra: number,
): number {
  const cap = countKeyCap(countKey);
  if (cap === null) return extra;
  return Math.max(0, Math.min(cap, baseCount + extra) - baseCount);
}

/** 前イベの最大発動回数（サポカDBの列） */
export function preEventMax(card: SupportCardData): number {
  return Number(card.extras["最大発動回数"] ?? 0) || 0;
}

/** 最大発動回数の表示（9999以上は実質無制限なので「∞」） */
export function preEventMaxLabel(card: SupportCardData): string {
  const max = preEventMax(card);
  return max >= 9999 ? "∞" : String(max);
}

/**
 * 前イベ（Pアイテム/スキル）の発動回数の自動計算。
 * min(最大発動回数, 参照回数キーの回数)（Pアイテム!E列 MIN(...) の移植）。
 * 参照回数キーが「レッスン」「SPレッスン」等の場合はそのカードのロールの回数を参照する。
 */
export function preEventAutoActivations(
  card: SupportCardData,
  role: SheetRole,
  ctx: SheetScoreContext,
): number {
  const max = preEventMax(card);
  if (max <= 0) return 0;
  const refKey = card.extras["前イベ発動参照回数"] ?? "初期値";
  const key =
    refKey === "レッスン" || refKey === "SPレッスン" || refKey === "通常レッスン"
      ? SHEET_ROLE_LABELS[role] + refKey
      : refKey;
  return Math.min(max, ctx.counts(key));
}

/**
 * 前イベの発動回数。取得しない指定なら0、手動指定があればそれを優先（0〜最大でクランプ）、
 * 無ければ自動計算。
 */
export function eventActivations(
  card: SupportCardData,
  role: SheetRole,
  ctx: SheetScoreContext,
): number {
  const ov = ctx.eventCounts?.(card.id);
  if (ov?.acquire === false) return 0; // 取得しなかった＝前イベは発動しない
  if (ov?.pre !== undefined) {
    return Math.max(0, Math.min(preEventMax(card), ov.pre));
  }
  return preEventAutoActivations(card, role, ctx);
}

/** 後イベの発動回数（手動指定が無ければ1回） */
export function postEventActivations(
  card: SupportCardData,
  ctx: SheetScoreContext,
): number {
  return Math.max(0, ctx.eventCounts?.(card.id)?.post ?? 1);
}

export type ItemBonus = {
  /** 発動回数（自動計算） */
  activations: number;
  /** 参照回数キー（表示用） */
  refKey: string;
  /** 1回あたりのパラメータ上昇値 */
  perActivation: number;
  /** floor(上昇値 × 回数) */
  points: number;
};

/**
 * アイテム補正の自動計算（Pアイテム!H列の移植＋発動回数の自動化）。
 * シートでは発動回数が手入力（上限=min(参照回数, 最大発動回数)）だが、
 * ここでは上限いっぱい発動する想定で自動計算する。
 * パラメ系Pアイテムを持たないカードは null。
 */
export function itemCorrectionAuto(
  card: SupportCardData,
  role: SheetRole,
  ctx: SheetScoreContext,
): ItemBonus | null {
  if (card.extras["パラメPアイテム"] !== "TRUE") return null;
  const perActivation = Number(card.extras["パラメータ上昇値"] ?? 0) || 0;
  if (perActivation <= 0) return null;
  const activations = eventActivations(card, role, ctx);
  return {
    activations,
    refKey: card.extras["前イベ発動参照回数"] ?? "初期値",
    perActivation,
    points: Math.floor(perActivation * activations),
  };
}

/** 前イベ=スキルで獲得するスキルの分類フラグ列（TRUEなら該当回数キーも発動） */
const SKILL_FLAG_KEYS = [
  "Aスキル獲得",
  "Mスキル獲得",
  "好調スキル獲得",
  "集中スキル獲得",
  "好印象スキル獲得",
  "やる気スキル獲得",
  "強気スキル獲得",
  "温存スキル獲得",
  "全力スキル獲得",
  "元気スキル獲得",
  "SSRスキル獲得",
];

/** 前イベのアクション列（値 × 発動回数 がそのキーの発動回数に上乗せされる） */
const NUMERIC_ACTION_KEYS = [
  "スキル強化",
  "Aスキル強化",
  "Mスキル強化",
  "スキル削除",
  "Aスキル削除（3回まで）",
  "Mスキル削除（3回まで）",
  "チェンジ（3回まで）",
  "Pドリンク獲得",
  "体力回復",
];

/** 後イベの種類 → 発動する回数キー（ランダム強化はA/M不定のため汎用スキル強化扱い。トラブル削除はスキル削除の一種） */
const POST_EVENT_KEY: Record<string, string> = {
  強化: "スキル強化",
  チェンジ: "チェンジ（3回まで）",
  トラブル削除: "スキル削除",
  体力回復: "体力回復",
};

/** ステータスに影響する後イベか（強化・チェンジ・トラブル削除。体力回復等は対象アビリティなし） */
export function postEventStatRelevant(card: SupportCardData): boolean {
  return (
    card.postEventType === "強化" ||
    card.postEventType === "チェンジ" ||
    card.postEventType === "トラブル削除"
  );
}

/** ステータスに影響する前イベか（パラメPアイテム or アビリティを発動させるアクションあり） */
export function preEventStatRelevant(card: SupportCardData): boolean {
  if (preEventMax(card) <= 0) return false;
  const num = (col: string) => Number(card.extras[col] ?? 0) || 0;
  if (card.extras["パラメPアイテム"] === "TRUE" && num("パラメータ上昇値") > 0)
    return true;
  if (num("スキル獲得") > 0) return true;
  return NUMERIC_ACTION_KEYS.some((key) => num(key) > 0);
}

/**
 * このカードの前イベ・後イベが編成全体に与える「発動回数の上乗せ」
 * （回数キー → 追加回数）を前イベ分と後イベ分に分けて返す。
 * 編成内の全カード（自分含む）の該当アビリティがこの回数ぶん余計に発動する。
 * 分割して返すのは、理論評価値の「編成全体の合計発動回数」予算で
 * 前イベ・後イベを別々にスケールできるようにするため。
 */
export function eventCountContributionSplit(
  card: SupportCardData,
  role: SheetRole,
  ctx: SheetScoreContext,
): { pre: Record<string, number>; post: Record<string, number> } {
  const preOut: Record<string, number> = {};
  const postOut: Record<string, number> = {};
  let out = preOut;
  const add = (key: string, v: number) => {
    if (v > 0) out[key] = (out[key] ?? 0) + v;
  };
  const num = (col: string) => Number(card.extras[col] ?? 0) || 0;

  const ov = ctx.eventCounts?.(card.id);

  /** 汎用スキル強化/削除を、M側の枚数指定でMとAに分けて上乗せする */
  const addSplit = (
    genericKey: string,
    mKey: string,
    aKey: string,
    total: number,
    mCount: number | undefined,
    defaultTarget: "A" | "M",
  ) => {
    add(genericKey, total);
    const m = Math.max(
      0,
      Math.min(total, mCount ?? (defaultTarget === "M" ? total : 0)),
    );
    add(mKey, m);
    add(aKey, total - m);
  };

  const n = eventActivations(card, role, ctx);
  if (n > 0) {
    // 前イベ=スキル: スキル獲得＋分類フラグの立っているキー
    const skillGain = num("スキル獲得") * n;
    add("スキル獲得", skillGain);
    if (skillGain > 0) {
      for (const key of SKILL_FLAG_KEYS) {
        if (card.extras[key] === "TRUE") add(key, skillGain);
      }
    }
    // 前イベのアクション列（強化・削除はM枚数→残りA の割り振り込み）
    for (const key of NUMERIC_ACTION_KEYS) {
      const v = num(key) * n;
      if (v <= 0) continue;
      if (key === "スキル強化") {
        addSplit(
          "スキル強化",
          "Mスキル強化",
          "Aスキル強化",
          v,
          ov?.preEnhanceM,
          defaultEnhanceTarget(card),
        );
      } else if (key === "スキル削除") {
        addSplit(
          "スキル削除",
          "Mスキル削除（3回まで）",
          "Aスキル削除（3回まで）",
          v,
          ov?.preDelM,
          defaultDelTarget(card),
        );
      } else {
        add(key, v);
      }
    }
  }

  // 前イベ=アイテム: 取得自体が「Pアイテム獲得」アビリティの発動になる（デフォルト取得）
  if (card.preEventType === "アイテム" && (ov?.acquire ?? true)) {
    add("Pアイテム獲得（6回まで）", 1);
  }

  // 後イベ（手動指定が無ければ1回）はpost側へ
  out = postOut;
  const postN = postEventActivations(card, ctx);
  if (postN > 0) {
    if (card.postEventType === "強化") {
      const target = ov?.enhance ?? defaultEnhanceTarget(card);
      add("スキル強化", postN);
      add(`${target}スキル強化`, postN);
    } else if (card.postEventType === "トラブル削除") {
      // トラブル削除はA/M割り振りの例外: 汎用スキル削除だけが増える
      add("スキル削除", postN);
    } else {
      const post = POST_EVENT_KEY[card.postEventType];
      if (post) add(post, postN);
    }
  }
  return { pre: preOut, post: postOut };
}

/** 前イベ・後イベの上乗せの合算版（従来互換） */
export function eventCountContribution(
  card: SupportCardData,
  role: SheetRole,
  ctx: SheetScoreContext,
): Record<string, number> {
  const { pre, post } = eventCountContributionSplit(card, role, ctx);
  const out: Record<string, number> = { ...pre };
  for (const key in post) out[key] = (out[key] ?? 0) + post[key];
  return out;
}

/**
 * カードのアビリティを「回数キー → 効果量の合計」に展開する（イベント相互作用の計算用）。
 * パラボ・回数キーなしのアビリティは含まない。
 */
export function abilityValuesByCountKey(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
): Record<string, number> {
  const out: Record<string, number> = {};
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return out;
  for (const slotIndex of [0, 1, 3, 4, 5]) {
    const slot = card.abilities[slotIndex];
    if (!slot) continue;
    const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
    if (!abiName || abiName === "パラメータボーナス") continue;
    const tier = tiers[slotIndex]?.[tsuki];
    if (tier === undefined) continue;
    const perf = perfOf(card.rarity, abiName);
    if (!perf) continue;
    const value = perf.tiers[tier];
    const countKey = perf[role];
    if (typeof value !== "number" || countKey === null) continue;
    out[countKey] = (out[countKey] ?? 0) + value;
  }
  return out;
}

/** カードの初期値アビリティによる固定ステ（凸→ティア反映後）。開始時ステの内訳用 */
export function cardInitialFixed(card: SupportCardData, level: number): number {
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return 0;
  let fixed = 0;
  card.abilities.forEach((slot, slotIndex) => {
    if (!slot) return;
    const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
    if (abiName !== "初期値") return;
    const tier = tiers[slotIndex]?.[level];
    if (tier === undefined) return;
    const value = perfOf(card.rarity, "初期値")?.tiers[tier];
    if (typeof value === "number") fixed += value;
  });
  return fixed;
}

/** カードのパラメータボーナス%（凸→ティア反映後、%表記で返す。例: 6.5） */
export function cardBonusPercent(card: SupportCardData, level: number): number {
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return 0;
  let pct = 0;
  card.abilities.forEach((slot, slotIndex) => {
    if (!slot) return;
    const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
    if (abiName !== "パラメータボーナス") return;
    const tier = tiers[slotIndex]?.[level];
    if (tier === undefined) return;
    const value = perfOf(card.rarity, "パラメータボーナス")?.tiers[tier];
    if (typeof value === "number") pct += value * 100;
  });
  return Math.round(pct * 10) / 10;
}

/**
 * カードごとの前イベ・後イベの手動指定（未指定は自動）。
 * - pre/post: 発動回数（前イベはUI上は取得/未取得の2択で、取得時は自動計算）
 * - acquire: 前イベのスキル/Pアイテムを取得したか。false なら前イベは丸ごと発動0扱い
 *   （アイテムはPアイテム獲得アビも発動しない）
 * - enhance: 後イベ（ランダム強化）がA/Mどちらのスキルを強化したか
 * - preEnhanceM: 前イベの強化のうちM側に割り振った回数（残りはA。未指定はデフォルト規則で全振り）
 * - preDelM: 前イベの削除のうちM側に割り振った回数（残りはA。トラブル削除は例外で汎用のみ+1）
 */
export type EventCountOverride = {
  pre?: number;
  post?: number;
  acquire?: boolean;
  enhance?: "A" | "M";
  preEnhanceM?: number;
  preDelM?: number;
};

/** カードが指定ラベルのアビリティを持つか */
function cardHasAbility(card: SupportCardData, label: string): boolean {
  return card.abilities.some((slot) => {
    if (!slot) return false;
    const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
    return abiName === label;
  });
}

/**
 * 強化のデフォルト割り振り。
 * カード自身が〇スキル強化アビを持つならそちら、
 * 無ければプランで判定（共通・ロジック=М強化が強い→M、センス・アノマリー=A）。
 */
export function defaultEnhanceTarget(card: SupportCardData): "A" | "M" {
  if (cardHasAbility(card, "Mスキル強化")) return "M";
  if (cardHasAbility(card, "Aスキル強化")) return "A";
  return card.plan === "センス" || card.plan === "アノマリー" ? "A" : "M";
}

/** 削除のデフォルト割り振り（強化と同じ規則） */
export function defaultDelTarget(card: SupportCardData): "A" | "M" {
  if (cardHasAbility(card, "Mスキル削除（3回まで）")) return "M";
  if (cardHasAbility(card, "Aスキル削除（3回まで）")) return "A";
  return card.plan === "センス" || card.plan === "アノマリー" ? "A" : "M";
}

/** 後イベがランダム強化か（M/A/発動しないの3択対象） */
export function hasPostEnhance(card: SupportCardData): boolean {
  return card.postEventType === "強化";
}

/** 前イベにスキル強化アクションがあるか（A/M/半々の割り振り対象） */
export function hasPreEnhance(card: SupportCardData): boolean {
  return (Number(card.extras["スキル強化"] ?? 0) || 0) > 0;
}

/** 前イベにスキル削除アクションがあるか（A/Mの割り振り対象） */
export function hasPreDelete(card: SupportCardData): boolean {
  return (Number(card.extras["スキル削除"] ?? 0) || 0) > 0;
}

export type SheetScoreContext = {
  counts: (label: string) => number;
  /** ロールごとのレッスン獲得（8回分）と試験獲得（3回分）: パラボ変換の母数 */
  gains: Record<SheetRole, { lessons: number[]; exams: number[] }>;
  /** カードIDごとのイベント発動回数の手動指定（イベント回数ストアから） */
  eventCounts?: (cardId: string) => EventCountOverride | undefined;
};

/**
 * カード1枚の点数（スプシ準拠・検証済み）。
 * @returns 計算不能（ティア表なし等）は null
 */
export function sheetScore(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
  ctx: SheetScoreContext,
): number | null {
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return null; // R等はティア表なし

  let total = 0;
  // アビリティ3(index2)は対象外
  for (const slotIndex of [0, 1, 3, 4, 5]) {
    const slot = card.abilities[slotIndex];
    const abiName =
      slot === null
        ? "何もなし"
        : "key" in slot
          ? SHEET_LABEL_BY_KEY[slot.key]
          : slot.raw;
    if (!abiName) return null;

    const tier = tiers[slotIndex]?.[tsuki]; // 0..4 (Ⅰ..Ⅴ)
    if (tier === undefined) return null;
    const perf = perfOf(card.rarity, abiName);
    if (!perf) return null;
    const value = perf.tiers[tier];

    if (abiName === "パラメータボーナス") {
      if (typeof value !== "number") continue;
      const g = ctx.gains[role];
      total += paraboConvert(value, g.lessons, g.exams);
    } else {
      const countKey = perf[role];
      if (countKey === null) continue;
      total += (value ?? 0) * ctx.counts(countKey);
    }
  }
  return total;
}

export type ScoreBreakdownItem = {
  /** アビリティ枠（1〜6） */
  slot: number;
  ability: string;
  /** 0..4（Ⅰ..Ⅴ）。ティア表なしは null */
  tier: number | null;
  /**
   * count: 効果量 × 回数 / parabo: % → 固定値変換 /
   * excluded: 計算対象外（アビリティ3） / none: 回数キーなし等で0点
   */
  kind: "count" | "parabo" | "excluded" | "none";
  /** 効果量（paraboは%の小数。例 0.065） */
  value: number | null;
  countKey?: string;
  count?: number;
  /** 編成の前イベ・後イベによる回数の上乗せ分（extraCounts指定時） */
  extraCount?: number;
  points: number;
};

export type ScoreBreakdown = {
  items: ScoreBreakdownItem[];
  itemBonus: ItemBonus | null;
  /** アビリティ点数の合計（sheetScoreと同値） */
  abilityTotal: number;
  /** アビリティ＋アイテム補正 */
  total: number;
};

/**
 * sheetScore の計算内訳（点数表の「点数の中身」表示用）。
 * ロジックは sheetScore と同一。計算不能カード（R等）は null。
 * @param extraCounts 編成の前イベ・後イベによる回数の上乗せ（回数キー→追加回数）。
 *                    指定すると各アビリティの回数に加算される（＝イベント相互作用込みの内訳）。
 */
export function sheetScoreBreakdown(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
  ctx: SheetScoreContext,
  extraCounts?: Record<string, number>,
): ScoreBreakdown | null {
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return null;

  const items: ScoreBreakdownItem[] = [];
  let abilityTotal = 0;
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const slot = card.abilities[slotIndex];
    const abiName =
      slot === null
        ? "何もなし"
        : "key" in slot
          ? SHEET_LABEL_BY_KEY[slot.key]
          : slot.raw;
    if (!abiName) return null;
    const base = { slot: slotIndex + 1, ability: abiName };

    // アビリティ3はシートの点数式の対象外
    if (slotIndex === 2) {
      items.push({ ...base, tier: null, kind: "excluded", value: null, points: 0 });
      continue;
    }
    if (abiName === "何もなし") {
      items.push({ ...base, tier: null, kind: "none", value: null, points: 0 });
      continue;
    }

    const tier = tiers[slotIndex]?.[tsuki];
    if (tier === undefined) return null;
    const perf = perfOf(card.rarity, abiName);
    if (!perf) return null;
    const value = perf.tiers[tier];

    if (abiName === "パラメータボーナス") {
      if (typeof value !== "number") {
        items.push({ ...base, tier, kind: "none", value: null, points: 0 });
        continue;
      }
      const g = ctx.gains[role];
      const points = paraboConvert(value, g.lessons, g.exams);
      abilityTotal += points;
      items.push({ ...base, tier, kind: "parabo", value, points });
    } else {
      const countKey = perf[role];
      if (countKey === null) {
        items.push({ ...base, tier, kind: "none", value: value ?? null, points: 0 });
        continue;
      }
      const count = ctx.counts(countKey);
      // 「〜回まで」の上限を超える上乗せは切り捨て
      const extraCount = clampExtraCount(
        countKey,
        count,
        extraCounts?.[countKey] ?? 0,
      );
      const points = (value ?? 0) * (count + extraCount);
      abilityTotal += points;
      items.push({
        ...base,
        tier,
        kind: "count",
        value: value ?? 0,
        countKey,
        count,
        extraCount,
        points,
      });
    }
  }

  const itemBonus = itemCorrectionAuto(card, role, ctx);
  return {
    items,
    itemBonus,
    abilityTotal,
    total: abilityTotal + (itemBonus?.points ?? 0),
  };
}

/** constants.ts のラベル（半角括弧）→ シートの表記（全角括弧など） */
const SHEET_LABEL_OVERRIDES: Record<string, string> = {
  "Aスキル削除(3回まで)": "Aスキル削除（3回まで）",
  "Mスキル削除(3回まで)": "Mスキル削除（3回まで）",
  "チェンジ(3回まで)": "チェンジ（3回まで）",
  "カスタマイズ(6回まで)": "カスタマイズ（6回まで）",
  "特別指導(3回まで)": "特別指導（3回まで）",
  "20枚以上SPレッスン(4回まで)": "20枚以上SPレッスン（4回まで）",
  "Pアイテム獲得(6回まで)": "Pアイテム獲得（6回まで）",
  "試験終了時(2回まで)": "試験終了時（2回まで）",
  なし: "何もなし",
  SPレッスン率アップ: "SPレッスン率",
};

// AbilityName(英語キー) → シートの日本語ラベル。
// supportCardsDb の AbilitySlot が key を持つ場合に逆引きする。
const SHEET_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(ABILITY_NAMES).map(([k, label]) => [
    k,
    SHEET_LABEL_OVERRIDES[label] ?? label,
  ]),
);
