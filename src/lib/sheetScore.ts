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
import { FIXED_ABILITY_COUNTS } from "@/data/fixedAbilityCounts";
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
/** アビリティ名を正規化（全角括弧→半角・空白除去）。perf生成側と揃える */
const normAbi = (s: string): string =>
  s.replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, "");
/**
 * アビリティ性能を「レアリティ×アビリティ名」で引く（括弧表記ゆれに非依存）。
 * 探索（焼きなまし）から毎評価呼ばれるため、正規化と連結の結果をメモ化する。
 */
const perfCache = new Map<string, PerfEntry | undefined>();
function perfOf(rarity: string, abiName: string): PerfEntry | undefined {
  const cacheKey = `${rarity}\u0000${abiName}`;
  if (perfCache.has(cacheKey)) return perfCache.get(cacheKey);
  const entry = PERF[`${PERF_RARITY[rarity] ?? rarity}${normAbi(abiName)}`];
  perfCache.set(cacheKey, entry);
  return entry;
}

/** 回数変更なしアビリティの固定回数（src/data/fixedAbilityCounts.ts が源） */
const FIXED_COUNTS = FIXED_ABILITY_COUNTS;

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

/** 属性（タイプ）→ シート内部ロールのラベル（Vo=メイン1 / Da=メイン2 / Vi=サブの固定対応） */
const TRIGGER_ATTR_LABEL: Record<string, string> = {
  Vocal: SHEET_ROLE_LABELS.main1,
  Dance: SHEET_ROLE_LABELS.main2,
  Visual: SHEET_ROLE_LABELS.sub,
};
const TRIGGER_LESSON_RE = /^(Vocal|Dance|Visual)(SPレッスン|通常レッスン|レッスン)$/;
const GENERIC_LESSON_KEYS = new Set(["レッスン", "SPレッスン", "通常レッスン"]);

/**
 * 前イベトリガーの参照回数を解決する。
 * - 「VocalSPレッスン」等の属性指定 → その属性（固定対応ロール）の踏み回数
 * - 「SPレッスン」等の属性なし → 全属性の合算（属性関係なしトリガー）
 * - それ以外（相談・スキル強化・初期値等）→ そのままのキーで参照
 */
export function resolveTriggerCount(
  refKey: string,
  ctx: SheetScoreContext,
): number {
  const m = refKey.match(TRIGGER_LESSON_RE);
  if (m) return ctx.counts(TRIGGER_ATTR_LABEL[m[1]] + m[2]);
  if (GENERIC_LESSON_KEYS.has(refKey)) {
    return Object.values(TRIGGER_ATTR_LABEL).reduce(
      (sum, label) => sum + ctx.counts(label + refKey),
      0,
    );
  }
  return ctx.counts(refKey);
}

/**
 * 前イベ（Pアイテム/スキル）の発動回数の自動計算。
 * min(最大発動回数, 参照回数キーの回数)（Pアイテム!E列 MIN(...) の移植）。
 * 参照回数キーの解決は resolveTriggerCount を参照。
 */
export function preEventAutoActivations(
  card: SupportCardData,
  _role: SheetRole,
  ctx: SheetScoreContext,
): number {
  const max = preEventMax(card);
  if (max <= 0) return 0;
  const refKey = card.extras["前イベ発動参照回数"] ?? "初期値";
  return Math.min(max, resolveTriggerCount(refKey, ctx));
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
  "ドリンク獲得",
  "体力回復",
];

/** 後イベの種類 → 発動する回数キー（ランダム強化はA/M不定のため汎用スキル強化扱い。トラブル削除はスキル削除の一種） */
const POST_EVENT_KEY: Record<string, string> = {
  強化: "スキル強化",
  チェンジ: "チェンジ（3回まで）",
  トラブル削除: "スキル削除",
  体力回復: "体力回復",
};

/** ステータスに影響する後イベか（強化・チェンジ・削除系。体力回復等は対象アビリティなし） */
export function postEventStatRelevant(card: SupportCardData): boolean {
  return (
    card.postEventType === "強化" ||
    card.postEventType === "チェンジ" ||
    card.postEventType === "トラブル削除" ||
    card.postEventType === "スキル削除"
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
    } else if (card.postEventType === "スキル削除") {
      // 選択削除（スキルを選んで1枚削除）: 属性を選べる（デフォルトA）
      const target = ov?.enhance ?? POST_DELETE_DEFAULT_TARGET;
      add("スキル削除", postN);
      add(`${target}スキル削除（3回まで）`, postN);
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

/**
 * カードのアビリティを「回数キー → 効果量の合計」に展開する（イベント相互作用の計算用）。
 * パラボ・回数キーなしのアビリティは含まない。
 * 入力（カード・凸・ロール）だけで決まる純関数なのでメモ化する（探索の高速化）。
 * 返り値のオブジェクトは共有されるため、呼び出し側は書き換えないこと。
 */
const abilityValuesCache = new Map<string, Record<string, number>>();
export function abilityValuesByCountKey(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
): Record<string, number> {
  const cacheKey = `${card.id}\u0000${tsuki}\u0000${role}`;
  const cached = abilityValuesCache.get(cacheKey);
  if (cached) return cached;
  const out = computeAbilityValuesByCountKey(card, tsuki, role);
  abilityValuesCache.set(cacheKey, out);
  return out;
}

function computeAbilityValuesByCountKey(
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

/**
 * アビリティ1枠ぶんの効果量と回数キーを引く（アシストの枠別タイプ計算用）。
 * パラメータボーナス・perf未登録・ティアなしは null。
 */
export function slotAbilityEntry(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
  slotIndex: number,
): { abiName: string; value: number; countKey: string } | null {
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return null;
  const slot = card.abilities[slotIndex];
  if (!slot) return null;
  const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
  if (!abiName || abiName === "パラメータボーナス") return null;
  const tier = tiers[slotIndex]?.[tsuki];
  if (tier === undefined) return null;
  const perf = perfOf(card.rarity, abiName);
  if (!perf) return null;
  const value = perf.tiers[tier];
  const countKey = perf[role];
  if (typeof value !== "number" || countKey === null) return null;
  return { abiName, value, countKey };
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
  /**
   * ステイベ（パラメータイベント）の発動有無（0=発動しない / 1=発動）。
   * 前イベ・後イベ同様ランダム発動で、1育成に1回しか起こらない。
   * 未指定は発動（1回）扱い。
   */
  statEvent?: number;
};

/** ステイベ（パラメータイベント）の回数キー */
export const STAT_EVENT_KEY = "パラメータイベント";

/** ステイベの発動回数（カード別の手動指定があればそれ、無ければ固定回数） */
function statEventCount(
  cardId: string,
  countKey: string,
  ctx: SheetScoreContext,
): number | null {
  if (countKey !== STAT_EVENT_KEY) return null;
  const ov = ctx.eventCounts?.(cardId)?.statEvent;
  // ステイベは1育成に1回しか起こらない（0か1）
  return ov !== undefined ? Math.max(0, Math.min(1, ov)) : null;
}

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

/**
 * 後イベが選択スキル削除か（スキルを選んで1枚削除。A/M/発動しないの3択対象）。
 * トラブル削除（デッキのトラブルカードを消す・属性なし）とは別物。
 */
export function hasPostDelete(card: SupportCardData): boolean {
  return card.postEventType === "スキル削除";
}

/** 後イベ=選択スキル削除の属性デフォルト（UIと計算の両方がこれを参照する） */
export const POST_DELETE_DEFAULT_TARGET: "A" | "M" = "A";

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
    // perf 未登録のアビリティ（新規の非スコア系など）はその枠を0として飛ばす
    // （カード全体を無得点にしない）。
    if (!perf) continue;
    const value = perf.tiers[tier];

    if (abiName === "パラメータボーナス") {
      if (typeof value !== "number") continue;
      const g = ctx.gains[role];
      total += paraboConvert(value, g.lessons, g.exams);
    } else {
      const countKey = perf[role];
      if (countKey === null) continue;
      const count =
        statEventCount(card.id, countKey, ctx) ?? ctx.counts(countKey);
      total += (value ?? 0) * count;
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

    // アビリティ3はシートの点数式の対象外（レッスンサポート率など）。
    // 点数には入れないが、効果量は内訳モーダルで見られるように値だけ拾う
    if (slotIndex === 2) {
      const tier3 = tiers[slotIndex]?.[tsuki];
      const value3 =
        tier3 !== undefined ? (perfOf(card.rarity, abiName)?.tiers[tier3] ?? null) : null;
      items.push({
        ...base,
        tier: tier3 ?? null,
        kind: "excluded",
        value: value3,
        points: 0,
      });
      continue;
    }
    if (abiName === "何もなし") {
      items.push({ ...base, tier: null, kind: "none", value: null, points: 0 });
      continue;
    }

    const tier = tiers[slotIndex]?.[tsuki];
    if (tier === undefined) return null;
    const perf = perfOf(card.rarity, abiName);
    // perf 未登録は非スコア扱い（0）でその枠を飛ばす（sheetScore と同じ扱い）
    if (!perf) {
      items.push({ ...base, tier: null, kind: "none", value: null, points: 0 });
      continue;
    }
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
      const count =
        statEventCount(card.id, countKey, ctx) ?? ctx.counts(countKey);
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

// ===== 資源系（Pポイント・体力）の集計 =====
// 点数（ステ換算）とは別に、その育成で得られる合計Pポイント・体力回復を見積もる。

/** 固定値でPポイントを与えるアビリティ */
const P_FLAT_LABELS = new Set(["Pポイント", "Pポイントイベント"]);
/** 体力を回復するアビリティ */
const RECOVER_LABELS = new Set([
  "SPレッスン時回復",
  "タイプSPレッスン時回復",
  "SPレッスン回復",
  "タイプSPレッスン回復",
  "差し入れ時回復",
  "試験終了時回復",
  "回復イベント",
  "休む",
]);
/** 最大体力を上げるアビリティ（回復とは別枠で集計） */
const MAX_HP_LABELS = new Set(["最大体力上昇", "最大体力上昇（1アビ）"]);

export type CardResources = {
  /** アビリティ由来のPポイント（固定値×回数） */
  p: number;
  /** レッスンPポイント率（率の合算） */
  pRateLesson: number;
  /** タイプSPレッスンPポイント率（率の合算。自タイプのSPレッスンPが母数） */
  pRateTypeSp: number;
  /** 体力回復の合計 */
  recover: number;
  /** 最大体力上昇の合計 */
  maxHp: number;
};

/**
 * カード1枚の資源（Pポイント・体力回復・最大体力）を集計する。
 * アビリティ全6枠（点数計算対象外のアビリティ3も含む）＋前イベのアクション
 * （Pポイント・体力回復）を数える。ランダムイベント系（〜イベント）は
 * 回数セットに無ければ1回として扱う。
 */
export function cardResources(
  card: SupportCardData,
  tsuki: number,
  role: SheetRole,
  ctx: SheetScoreContext,
): CardResources {
  const out: CardResources = {
    p: 0,
    pRateLesson: 0,
    pRateTypeSp: 0,
    recover: 0,
    maxHp: 0,
  };
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (tiers) {
    card.abilities.forEach((slot, slotIndex) => {
      if (!slot) return;
      const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
      if (!abiName) return;
      const tier = tiers[slotIndex]?.[tsuki];
      if (tier === undefined) return;
      const perf = perfOf(card.rarity, abiName);
      if (!perf) return;
      // 高ティアの値が未入力のアビリティ（最大体力上昇など）は、
      // 定義済みの最も近い下位ティアの値で代用する（資源集計のみの救済措置）
      let value = perf.tiers[tier];
      if (typeof value !== "number") {
        for (let k = Math.min(tier, perf.tiers.length - 1); k >= 0; k--) {
          const v = perf.tiers[k];
          if (typeof v === "number") {
            value = v;
            break;
          }
        }
      }
      if (typeof value !== "number") return;
      const countKey = perf[role];
      const countOf = (key: string | null) => {
        if (!key) return 0;
        const n = ctx.counts(key);
        // ランダムイベント系は回数セットに無ければ1回扱い
        return n === 0 && key.endsWith("イベント") ? 1 : n;
      };
      // Pポイント（固定値）は初期値と同じく1回発動、Pポイントイベントも1育成1回
      if (P_FLAT_LABELS.has(abiName)) out.p += value;
      else if (abiName === "レッスンPポイント率") out.pRateLesson += value;
      else if (abiName === "タイプSPレッスンPポイント率")
        out.pRateTypeSp += value;
      else if (RECOVER_LABELS.has(abiName))
        out.recover += value * countOf(countKey);
      else if (MAX_HP_LABELS.has(abiName)) out.maxHp += value;
    });
  }
  // 前イベのアクション（Pポイント・体力回復）× 発動回数
  const acts = eventActivations(card, role, ctx);
  if (acts > 0) {
    for (const action of card.preEvent.actions) {
      if (action.label === "Pポイント") out.p += action.value * acts;
      if (action.label === "体力回復") out.recover += action.value * acts;
    }
  }
  return out;
}

export type CardSpRate = {
  /** 属性別のSPレッスン率上昇（割合。0.21 = +21%）。全SPレッスン率は3属性に加算済み */
  vocal: number;
  dance: number;
  visual: number;
};

/** abi_type列 → タイプキー（SPレッスン率の効き先判定用） */
const SP_ABI_TYPE: Record<string, keyof CardSpRate> = {
  Vocal: "vocal",
  Dance: "dance",
  Visual: "visual",
};

/**
 * カード1枚のSPレッスン率上昇を属性別に集計する（凸→ティア反映後・割合で返す）。
 * 「SPレッスン率」は枠の abi_type の属性へ、「全SPレッスン率(◯%)」は3属性すべてに効く。
 */
export function cardSpRate(card: SupportCardData, tsuki: number): CardSpRate {
  const out: CardSpRate = { vocal: 0, dance: 0, visual: 0 };
  const tiers = SLOT_TIER[card.rarity as Rarity];
  if (!tiers) return out;
  card.abilities.forEach((slot, slotIndex) => {
    if (!slot) return;
    const abiName = "key" in slot ? SHEET_LABEL_BY_KEY[slot.key] : slot.raw;
    if (!abiName) return;
    const isAll = abiName.startsWith("全SPレッスン率");
    const ownType = abiName === "SPレッスン率"
      ? SP_ABI_TYPE[card.abilityTypes[slotIndex]]
      : undefined;
    if (!isAll && !ownType) return;
    const tier = tiers[slotIndex]?.[tsuki];
    if (tier === undefined) return;
    const perf = perfOf(card.rarity, abiName);
    // 高ティアが未入力なら定義済みの最も近い下位ティアで代用（cardResourcesと同じ救済）
    let value = perf?.tiers[tier];
    if (typeof value !== "number" && perf) {
      for (let k = Math.min(tier, perf.tiers.length - 1); k >= 0; k--) {
        const v = perf.tiers[k];
        if (typeof v === "number") {
          value = v;
          break;
        }
      }
    }
    // abilityValues 未登録の「全SPレッスン率(◯%)」はアビリティ名の%で代用
    // （例: SR「はじめてのお友達」。ティア推移が不明なので上限値を使う）
    if (typeof value !== "number" && isAll) {
      const m = abiName.match(/(\d+(?:\.\d+)?)\s*%/);
      if (m) value = Number(m[1]) / 100;
    }
    if (typeof value !== "number") return;
    if (isAll) {
      out.vocal += value;
      out.dance += value;
      out.visual += value;
    } else if (ownType) {
      out[ownType] += value;
    }
  });
  return out;
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
