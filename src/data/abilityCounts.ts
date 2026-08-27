/**
 * アビリティ発動回数ツールのデータ定義。
 *
 * アビリティ本体は constants.ts の ABILITY_NAMES のキーを再利用する
 * （CSVサポカDBと同じキー体系なので、後で連携できる）。
 */
import generatedCounts from "./generated/abilityCounts.json";
import { ABILITY_NAMES, abilityKeyFromLabel, type AbilityName } from "./constants";
import { SCENARIO_KEYS, type ScenarioKey } from "./scenarios";
import { calendarEventCounts, type CalendarEvent } from "./scheduleCalendar";

/** 4つの分類とそこに属するアビリティ（表示順のまま） */
export const ABILITY_CATEGORIES = [
  {
    key: "acquire",
    label: "スキル獲得系",
    abilities: [
      "skill_ac",
      "A_skill_ac",
      "M_skill_ac",
      "positive_skill_ac",
      "focus_skill_ac",
      "charm_skill_ac",
      "vitality_skill_ac",
      "aggressive_skill_ac", // 強気
      "charge_skill_ac", // 温存
      "charge_8plus_ut4", // 温存8枚以上(4回まで)
      "burst_skill_ac",
      "barrier_skill_ac",
      "SSR_skill_ac",
    ],
  },
  {
    key: "modify",
    label: "強化・削除・チェンジ",
    abilities: [
      "skill_enhance",
      "A_skill_enhance",
      "M_skill_enhance",
      "skill_del",
      "skill_del_ut4",
      "A_skill_del_ut3",
      "M_skill_del_ut3",
      "change_ut3",
      "skill_exchange_ut5",
    ],
  },
  {
    key: "schedule",
    label: "スケジュール",
    abilities: [
      "study",
      "date",
      "rest",
      "meeting",
      "supply",
      "extra_lecture_ut3",
      "date_ut2",
      "meeting_ut2",
      "supply_ut2",
      "stage_finish_ut2",
    ],
  },
  {
    key: "other",
    label: "その他",
    abilities: [
      "drink_exchange",
      "drink_get",
      "drink_get_ut10", // ドリンク獲得(10回まで)
      "custom_ut6",
      "SP_lesson_20s_ut4",
      "charm_8plus_ut4",
      "focus_8plus_ut4", // 集中8枚以上スキル獲得(4回まで)
      "p_item_get_ut6",
    ],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  abilities: readonly AbilityName[];
}[];

export type CategoryKey = (typeof ABILITY_CATEGORIES)[number]["key"];

/** 「(N回まで)」の明記がないアビリティのデフォルト最大発動回数 */
export const DEFAULT_MAX = 99;

/**
 * スケジュール（scheduleCalendar）由来のシナリオ別上限を持つアビリティ。
 * 値 = そのシナリオでこの行動が起こる回数（例: HIFのお出かけは5回）。
 */
const SCHEDULE_CAP_EVENTS: Partial<Record<AbilityName, CalendarEvent[]>> = {
  date: ["date"],
  date_ut2: ["date"],
  meeting: ["meeting"],
  meeting_ut2: ["meeting"],
  supply: ["supply"],
  supply_ut2: ["supply"],
  extra_lecture_ut3: ["lecture"],
  study: ["class", "sale"],
};

/** シナリオ別のスケジュール上限表（アビリティ→回数）。モジュール読み込み時に1回だけ数える */
const SCHEDULE_CAPS: Record<ScenarioKey, Partial<Record<AbilityName, number>>> =
  Object.fromEntries(
    SCENARIO_KEYS.map((scenario) => {
      const counts = calendarEventCounts(scenario);
      const caps: Partial<Record<AbilityName, number>> = {};
      for (const [key, events] of Object.entries(SCHEDULE_CAP_EVENTS)) {
        caps[key as AbilityName] = events.reduce((sum, e) => sum + counts[e], 0);
      }
      return [scenario, caps];
    }),
  ) as Record<ScenarioKey, Partial<Record<AbilityName, number>>>;

/**
 * アビリティの最大発動回数。
 * ラベル中の「(N回まで)」のNと、シナリオのスケジュール上の回数
 * （お出かけ・相談・差し入れ・特別指導・授業/営業）の小さい方。
 * どちらも無ければ DEFAULT_MAX。scenario 省略時はラベルのみで判定。
 */
export function abilityMax(key: AbilityName, scenario?: ScenarioKey): number {
  const match = ABILITY_NAMES[key].match(/\((\d+)回まで\)/);
  const labelCap = match ? Number(match[1]) : DEFAULT_MAX;
  const scheduleCap =
    (scenario ? SCHEDULE_CAPS[scenario][key] : undefined) ?? DEFAULT_MAX;
  return Math.min(labelCap, scheduleCap);
}

/**
 * セット = アビリティごとの発動回数の組み合わせ。
 * defaults に無いアビリティは0回扱い。
 *
 * 既定値の元は現行スプシの発動回数タブ（gen:counts → generated/abilityCounts.json）。
 * ユーザーがUIで変更した値は localStorage に「差分」として保存されるため、
 * スプシを更新して再生成しても、未変更の項目には自動で反映される。
 */
export type AbilityCountSet = {
  id: string;
  name: string;
  /** 育成プラン/スタイル（試験補助強めのアイテム評価ゲートで参照。""=未設定） */
  plan: string;
  defaults: Partial<Record<AbilityName, number>>;
};

/** セットに設定できるプラン/スタイルの選択肢 */
export const SET_PLAN_OPTIONS = [
  "センス",
  "ロジック",
  "アノマリー",
  "好調",
  "集中",
  "好印象",
  "やる気",
  "強気",
  "全力",
] as const;

/** セット名の接頭辞からプランを推定する（テンプレ・旧ユーザーセットの初期値用） */
export function planFromSetName(name: string): string {
  for (const plan of SET_PLAN_OPTIONS) {
    if (name.startsWith(plan)) return plan;
  }
  return "";
}

/**
 * 発動回数の元データは現行スプシの発動回数タブ（generated/abilityCounts.json、gen:counts で生成）。
 * ラベル→アプリのキー変換は constants に集約（abilityKeyFromLabel）。
 * 「(N回まで)」スロットはタブに独立行が無いので、基準アビリティの回数を上限Nでクランプして派生させる
 *   （例: 活動支給・差し入れ(2回まで) = min(活動支給・差し入れ, 2)）。
 * スプシに行・列を足せばそのまま反映される。
 */
const DERIVED_CAPS = [
  { key: "date_ut2", base: "date", cap: 2 }, // お出かけ(2回まで)
  { key: "meeting_ut2", base: "meeting", cap: 2 }, // 相談(2回まで)
  { key: "supply_ut2", base: "supply", cap: 2 }, // 活動支給・差し入れ(2回まで)
  { key: "skill_del_ut4", base: "skill_del", cap: 4 }, // スキル削除(4回まで)
  { key: "drink_get_ut10", base: "drink_get", cap: 10 }, // ドリンク獲得(10回まで)
] as const satisfies readonly { key: AbilityName; base: AbilityName; cap: number }[];

type CountTable = {
  setNames: string[];
  /** セットごとのプラン（スプシのプラン行。旧データ・未記入は""） */
  plans?: string[];
  rows: Record<string, number[]>;
};

/** per-setではなくシナリオ固定回数(FIXED_COUNTS)で扱うため、この表からは除外するキー */
const FIXED_COUNT_KEYS = new Set<AbilityName>(["stage_finish"]);

/** 生成テーブル（日本語ラベル→回数配列）を AbilityName キーの表に変換し、(N回まで)派生を足す */
function toCountTable(table: CountTable): Partial<Record<AbilityName, number[]>> {
  const out: Partial<Record<AbilityName, number[]>> = {};
  const unknown: string[] = [];
  for (const [label, values] of Object.entries(table.rows)) {
    const key = abilityKeyFromLabel(label);
    if (key && FIXED_COUNT_KEYS.has(key)) continue;
    if (key) out[key] = values;
    else unknown.push(label);
  }
  for (const { key, base, cap } of DERIVED_CAPS) {
    const b = out[base];
    if (b) out[key] = b.map((n) => Math.min(n, cap));
  }
  if (unknown.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[abilityCounts] 発動回数タブの未知ラベル（constants未登録）:", unknown);
  }
  return out;
}

/** テンプレセット名（発動回数タブの列順） */
const SET_NAMES: readonly string[] = generatedCounts.hif.setNames;

/**
 * テンプレの初期回数（キー=アビリティ、配列=SET_NAMESの順）。現行スプシの HIF タブ由来。
 * defaults に無いアビリティは0回扱い。ユーザーがUIで変えた値は localStorage に「差分」で
 * 保存されるため、ここ（＝スプシ）を更新しても未変更の項目には自動で反映される。
 */
const DEFAULT_COUNTS = toCountTable(generatedCounts.hif);

/** テンプレのプラン: スプシのプラン行を優先し、無ければセット名から推定 */
const SET_PLANS: readonly string[] = generatedCounts.hif.plans ?? [];

// スプシのセット名はプラン列の分離で短くなった（例: センス花ロボ(黄) → 花ロボ(黄)）。
// 名前はプランをまたいで重複するため、IDは「プラン＋名前」で一意にする
// （旧ID「set:センス花ロボ(黄)」とも一致し、保存済みの回数・選択が引き継がれる）。
export const DEFAULT_SETS: AbilityCountSet[] = SET_NAMES.map((name, i) => {
  const plan = SET_PLANS[i] || planFromSetName(name);
  return {
    id: `set:${plan}${name}`,
    name,
    plan,
    defaults: Object.fromEntries(
      Object.entries(DEFAULT_COUNTS)
        .map(([key, values]) => [key, values[i]])
        .filter(([, value]) => value !== 0),
    ) as Partial<Record<AbilityName, number>>,
  };
});

// ============================================================
// N.I.A.用テンプレセット（現行スプシの abilityCountsNIA タブ由来）
// ============================================================

const NIA_SET_NAMES: readonly string[] = generatedCounts.nia.setNames;
const NIA_DEFAULT_COUNTS = toCountTable(generatedCounts.nia);

const NIA_SET_PLANS: readonly string[] = generatedCounts.nia.plans ?? [];

export const NIA_DEFAULT_SETS: AbilityCountSet[] = NIA_SET_NAMES.map(
  (name, i) => {
    const plan = NIA_SET_PLANS[i] || planFromSetName(name);
    return {
      id: `nia:${plan}${name}`,
      name,
      plan,
      defaults: Object.fromEntries(
        Object.entries(NIA_DEFAULT_COUNTS)
          .map(([key, values]) => [key, values[i]])
          .filter(([, value]) => value !== 0),
      ) as Partial<Record<AbilityName, number>>,
    };
  },
);

// ============================================================
// 定期公演『初』用テンプレセット（現行スプシの abilityCountsHajime タブ由来）
// ============================================================

const HATSU_SET_NAMES: readonly string[] = generatedCounts.hajime.setNames;
const HATSU_DEFAULT_COUNTS = toCountTable(generatedCounts.hajime);

const HATSU_SET_PLANS: readonly string[] = generatedCounts.hajime.plans ?? [];

export const HATSU_DEFAULT_SETS: AbilityCountSet[] = HATSU_SET_NAMES.map(
  (name, i) => {
    const plan = HATSU_SET_PLANS[i] || planFromSetName(name);
    return {
      id: `hajime:${plan}${name}`,
      name,
      plan,
      defaults: Object.fromEntries(
        Object.entries(HATSU_DEFAULT_COUNTS)
          .map(([key, values]) => [key, values[i]])
          .filter(([, value]) => value !== 0),
      ) as Partial<Record<AbilityName, number>>,
    };
  },
);

/**
 * セットが現在のシナリオで表示対象か。
 * HIFテンプレ（set:）はHIFのみ、NIAテンプレ（nia:）はNIAのみ、
 * 初テンプレ（hajime:）は初のみ、ユーザーセットは常に表示。
 */
export function setVisibleInScenario(setId: string, scenario: string): boolean {
  if (setId.startsWith("nia:")) return scenario === "niaMaster";
  if (setId.startsWith("hajime:")) return scenario === "hatsuLegend";
  if (setId.startsWith("set:")) {
    return scenario !== "niaMaster" && scenario !== "hatsuLegend";
  }
  return true;
}
