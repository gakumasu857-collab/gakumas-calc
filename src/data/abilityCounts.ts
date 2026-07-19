/**
 * アビリティ発動回数ツールのデータ定義。
 *
 * アビリティ本体は constants.ts の ABILITY_NAMES のキーを再利用する
 * （CSVサポカDBと同じキー体系なので、後で連携できる）。
 */
import { ABILITY_NAMES, type AbilityName } from "./constants";

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
      "custom_ut6",
      "SP_lesson_20s_ut4",
      "charm_8plus_ut4",
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
 * アビリティの最大発動回数。
 * ラベル中の「(N回まで)」からNを取り、なければ DEFAULT_MAX。
 */
export function abilityMax(key: AbilityName): number {
  const match = ABILITY_NAMES[key].match(/\((\d+)回まで\)/);
  return match ? Number(match[1]) : DEFAULT_MAX;
}

/**
 * セット = アビリティごとの発動回数の組み合わせ。
 * defaults に無いアビリティは0回扱い。
 *
 * ここの数値を書き換えれば「コード側のデフォルト」が変わる。
 * ユーザーがUIで変更した値は localStorage に「差分」として保存されるため、
 * ここを更新したり新アビリティを追加しても、未変更の項目には自動で反映される。
 *
 * TODO: 各セットの実際の回数はユーザーから提供され次第入力する（今は全部0）。
 */
export type AbilityCountSet = {
  id: string;
  name: string;
  defaults: Partial<Record<AbilityName, number>>;
};

/** テンプレセット名（提供されたスプレッドシートの列順） */
const SET_NAMES = [
  "センス花ロボ(黄)",
  "センス花もじゃ(黄)",
  "好印象花ロボ(黄)",
  "好印象メダルもじゃ(黄)",
  "好印象リボンもじゃ(黄)",
  "やる気花ロボ(黄)",
  "やる気メダルもじゃ(黄)",
  "やる気リボンもじゃ(黄)",
  "強気花ロボ(黄)",
  "強気花もじゃ(黄)",
  "全力花ロボ(黄)",
  "全力花もじゃ(黄)",
] as const;

/** 全セット同じ値のときの省略記法 */
const all = (n: number) => Array<number>(SET_NAMES.length).fill(n);

/**
 * テンプレの初期回数（行=アビリティ、列=SET_NAMESの順）。
 * スプレッドシートの表をそのまま転記した形なので、更新時は行ごと差し替える。
 */
const DEFAULT_COUNTS: Partial<Record<AbilityName, number[]>> = {
  skill_ac: all(25),
  A_skill_ac: [5, 5, 5, 5, 5, 5, 5, 5, 10, 10, 10, 10],
  M_skill_ac: [10, 10, 15, 15, 15, 15, 15, 15, 10, 10, 10, 10],
  positive_skill_ac: [10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  focus_skill_ac: [6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  charm_skill_ac: [0, 0, 10, 10, 10, 3, 3, 3, 0, 0, 0, 0],
  vitality_skill_ac: [0, 0, 3, 3, 3, 10, 10, 10, 0, 0, 0, 0],
  aggressive_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 3, 3],
  charge_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8],
  burst_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 8, 8],
  barrier_skill_ac: [0, 0, 0, 0, 0, 15, 15, 15, 0, 0, 0, 0],
  SSR_skill_ac: all(12),
  skill_enhance: [4, 4, 4, 4, 12, 4, 4, 12, 4, 4, 4, 4],
  A_skill_enhance: [4, 4, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4],
  M_skill_enhance: [4, 4, 4, 4, 12, 4, 4, 12, 4, 4, 4, 4],
  skill_del: [6, 6, 6, 7, 6, 6, 7, 6, 6, 6, 6, 6],
  A_skill_del_ut3: all(3),
  M_skill_del_ut3: all(3),
  change_ut3: all(3),
  custom_ut6: all(6),
  study: all(6),
  date: all(1),
  rest: all(0),
  meeting: all(2),
  supply: all(5),
  extra_lecture_ut3: all(0),
  drink_exchange: [12, 16, 10, 10, 8, 10, 10, 8, 12, 16, 12, 16],
  drink_get: [28, 28, 26, 22, 20, 22, 22, 20, 28, 28, 28, 28],
  SP_lesson_20s_ut4: all(4),
  p_item_get_ut6: all(6),
  date_ut2: all(1),
  meeting_ut2: all(2),
  supply_ut2: all(2),
  skill_del_ut4: all(4),
  charm_8plus_ut4: all(4),
};

export const DEFAULT_SETS: AbilityCountSet[] = SET_NAMES.map((name, i) => ({
  id: `set:${name}`,
  name,
  defaults: Object.fromEntries(
    Object.entries(DEFAULT_COUNTS)
      .map(([key, values]) => [key, values[i]])
      .filter(([, value]) => value !== 0),
  ) as Partial<Record<AbilityName, number>>,
}));

// ============================================================
// N.I.A.用テンプレセット（HIF表と同じ行順でユーザー提供の表を転記）
// ============================================================

const NIA_SET_NAMES = [
  "センス膨張",
  "センスドリンク",
  "好印象お出かけ",
  "好印象M強化",
  "好印象削除",
  "やる気お出かけ",
  "やる気M強化",
  "やる気削除",
  "強気膨張",
  "強気ドリンク",
  "全力膨張",
  "全力ドリンク",
] as const;

const niaAll = (n: number) => Array<number>(NIA_SET_NAMES.length).fill(n);

const NIA_DEFAULT_COUNTS: Partial<Record<AbilityName, number[]>> = {
  skill_ac: [32, 28, 20, 30, 36, 20, 30, 36, 32, 28, 32, 28],
  A_skill_ac: [16, 11, 4, 5, 8, 3, 6, 8, 16, 12, 16, 13],
  M_skill_ac: [16, 17, 16, 25, 28, 17, 24, 28, 16, 16, 16, 15],
  positive_skill_ac: [15, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  focus_skill_ac: [12, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  charm_skill_ac: [0, 0, 16, 23, 20, 5, 10, 10, 0, 0, 0, 0],
  vitality_skill_ac: [0, 0, 5, 8, 18, 15, 13, 18, 0, 0, 0, 0],
  aggressive_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 18, 10, 18, 10],
  charge_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 16, 14, 16, 12],
  burst_skill_ac: [0, 0, 0, 0, 0, 0, 0, 0, 12, 10, 12, 18],
  barrier_skill_ac: [5, 5, 5, 6, 12, 12, 21, 24, 13, 6, 13, 6],
  SSR_skill_ac: [13, 13, 7, 8, 14, 4, 11, 12, 13, 12, 13, 13],
  skill_enhance: [5, 5, 19, 15, 6, 19, 16, 6, 4, 2, 4, 2],
  A_skill_enhance: [5, 5, 0, 0, 0, 0, 0, 0, 4, 2, 4, 2],
  M_skill_enhance: [0, 0, 19, 15, 6, 19, 16, 6, 0, 0, 0, 0],
  skill_del: [8, 8, 6, 6, 8, 6, 6, 8, 10, 10, 10, 10],
  A_skill_del_ut3: niaAll(3),
  M_skill_del_ut3: niaAll(3),
  change_ut3: [3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 1, 3],
  custom_ut6: niaAll(6),
  study: niaAll(7),
  date: [1, 1, 5, 1, 0, 5, 1, 0, 0, 0, 0, 0],
  rest: [0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2],
  meeting: [1, 1, 1, 1, 2, 1, 1, 2, 2, 2, 2, 2],
  supply: [5, 5, 0, 5, 5, 0, 5, 5, 5, 5, 5, 5],
  extra_lecture_ut3: [0, 0, 0, 2, 2, 0, 2, 2, 0, 0, 0, 0],
  drink_exchange: [4, 11, 1, 0, 1, 1, 0, 1, 9, 11, 9, 11],
  drink_get: [12, 24, 8, 6, 15, 8, 6, 15, 14, 28, 14, 28],
  SP_lesson_20s_ut4: niaAll(4),
  p_item_get_ut6: niaAll(6),
  date_ut2: niaAll(2),
  meeting_ut2: niaAll(2),
  supply_ut2: niaAll(2),
  skill_del_ut4: niaAll(4),
  charm_8plus_ut4: niaAll(4),
};

export const NIA_DEFAULT_SETS: AbilityCountSet[] = NIA_SET_NAMES.map(
  (name, i) => ({
    id: `nia:${name}`,
    name,
    defaults: Object.fromEntries(
      Object.entries(NIA_DEFAULT_COUNTS)
        .map(([key, values]) => [key, values[i]])
        .filter(([, value]) => value !== 0),
    ) as Partial<Record<AbilityName, number>>,
  }),
);

/**
 * セットが現在のシナリオで表示対象か。
 * HIFテンプレ（set:）はNIA以外、NIAテンプレ（nia:）はNIAのみ、ユーザーセットは常に表示。
 */
export function setVisibleInScenario(setId: string, scenario: string): boolean {
  if (setId.startsWith("nia:")) return scenario === "niaMaster";
  if (setId.startsWith("set:")) return scenario !== "niaMaster";
  return true;
}
