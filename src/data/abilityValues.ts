/**
 * アビリティの効果量テーブル（ユーザー提供のスプレッドシートから転記）。
 *
 * 値は凸ティアⅠ〜Ⅴに対応する配列（index 0 = Ⅰ）。
 * - 空欄は null（そのティアが存在しない/未調査）
 * - 行ごと存在しないアビリティは省略（Partial）
 * - パラメータボーナスは % 値（6.5 = +6.5%）
 * - SPレッスン率は割合（0.105 = 10.5%）
 *
 * 「凸数(0〜4) → どのティアが適用されるか」はカード側の仕様
 * （凸で何段階目が解放されるか）に依存するため、ここでは持たない。
 */

import abilityPerf from "./generated/abilityPerf.json";
import type { AbilityName, Rarity } from "./constants";

/** Ⅰ〜Ⅴの値。null = そのティアなし */
export type TierValues = (number | null)[];

export type AbilityValueTable = Partial<Record<AbilityName, TierValues>>;

/** %として表示するアビリティ */
export const PERCENT_ABILITIES: ReadonlySet<AbilityName> = new Set([
  "bonus",
  "up_SP_lesson_rate",
] satisfies AbilityName[]);

export const ABILITY_VALUES: Partial<Record<Rarity, AbilityValueTable>> = {
  SSR: {
    lesson: [3, 4, 6],
    sp_lesson: [9, 13, 17],
    A_skill_ac: [1, 2, 3],
    M_skill_ac: [1, 2, 3],
    positive_skill_ac: [2, 3, 4],
    focus_skill_ac: [2, 3, 4],
    charm_skill_ac: [2, 3, 4],
    vitality_skill_ac: [2, 3, 4],
    aggressive_skill_ac: [2, 3, 4],
    charge_skill_ac: [2, 3, 4],
    burst_skill_ac: [2, 3, 4],
    barrier_skill_ac: [2, 3, 4],
    SSR_skill_ac: [3, 5, 6],
    skill_enhance: [2, 3, 4],
    A_skill_enhance: [5, 7, 9],
    M_skill_enhance: [5, 7, 9],
    skill_del: [6, 8, 11],
    A_skill_del_ut3: [11, 17, 22],
    M_skill_del_ut3: [11, 17, 22],
    change_ut3: [11, 16, 21],
    custom_ut6: [6, 8, 11],
    study: [4, 5, 7],
    date: [8, 11, 15],
    rest: [11, 17, 22],
    meeting: [null, 14, 18],
    supply: [9, 12, 17],
    drink_exchange: [6, 8, 11],
    drink_get: [3, 4, 5],
    SP_lesson_20s_ut4: [null, 15, 21],
    p_item_get_ut6: [8, 11, 15],
    initial: [52, 55, 59, 62, 65],
    bonus: [6.5, 7.0, 7.5, 8.0, 8.5],
    param_event: [30, 35, 40],
    up_SP_lesson_rate: [0.105, 0.21, 0.28],
    nothing: [0, 0, 0, 0, 0],
    stage_finish_ut2: [11, 17, 22],
    date_ut2: [19, 28, 38],
    meeting_ut2: [19, 28, 38],
    supply_ut2: [19, 28, 38],
    skill_del_ut4: [10, null, 20],
    charm_8plus_ut4: [11, null, 22],
  },
  SR: {
    lesson: [2, 4],
    sp_lesson: [7, 13],
    normal_lesson: [7, 13],
    skill_ac: [1, 2],
    A_skill_ac: [1, 2],
    M_skill_ac: [1, 2],
    positive_skill_ac: [2, 3],
    focus_skill_ac: [2, 3],
    charm_skill_ac: [2, 3],
    vitality_skill_ac: [2, 3],
    aggressive_skill_ac: [2, 3],
    charge_skill_ac: [2, 3],
    burst_skill_ac: [2, 3],
    barrier_skill_ac: [2, 3],
    SSR_skill_ac: [3, 5],
    skill_enhance: [2, 3],
    A_skill_enhance: [4, 6],
    M_skill_enhance: [4, 6],
    skill_del: [4, 8],
    A_skill_del_ut3: [8, 16],
    M_skill_del_ut3: [8, 16],
    change_ut3: [8, 16],
    custom_ut6: [6, 8, 11],
    study: [3, 5],
    date: [5, 10],
    rest: [9, 17],
    meeting: [7, 14],
    supply: [6, 11],
    extra_lecture_ut3: [9, 18],
    drink_exchange: [4, 8],
    SP_lesson_20s_ut4: [8, 15],
    p_item_get_ut6: [6, 11],
    initial: [37, 40, 43, 46, 49],
    bonus: [4.4, 4.9, 5.4, 5.9, 6.4],
    param_event: [22, 26, 30],
    up_SP_lesson_rate: [0.105, 0.21],
    nothing: [0, 0, 0, 0, 0],
    stage_finish_ut2: [9, 17],
    supply_ut2: [13, 26],
  },
  // 配布SSR（イベント配布）
  EventSSR: {
    lesson: [3, 4],
    sp_lesson: [9, 13],
    skill_ac: [1, 2],
    A_skill_ac: [1, 2],
    M_skill_ac: [1, 2],
    SSR_skill_ac: [3, 5],
    A_skill_enhance: [5, 7],
    M_skill_enhance: [5, 7],
    skill_del: [6, 8],
    study: [4, 5],
    meeting: [6, 8],
    p_item_get_ut6: [8, 11],
    initial: [52, 55, 59, 62, 65],
    bonus: [6.5, 7.0, 7.5, 8.0, 8.5],
    param_event: [30, 35, 40],
    up_SP_lesson_rate: [0.14, 0.21],
    nothing: [0, 0, 0, 0, 0],
    stage_finish_ut2: [11, 17],
  },
};

/**
 * アビリティの効果量を取得する。
 * @param tier 0始まりのティア（Ⅰ=0 〜 Ⅴ=4）
 * @returns 値が存在しなければ null
 */
export function abilityValue(
  rarity: Rarity,
  ability: AbilityName,
  tier: number,
): number | null {
  return ABILITY_VALUES[rarity]?.[ability]?.[tier] ?? null;
}

/**
 * 凸数 → アビリティ枠のティア（Ⅰ=0〜Ⅴ=4）の対応表。
 * SLOT_TIER[レアリティ][枠番号0〜5][凸数0〜4] = ティアindex。
 * （ユーザー提供の表より。Rは未提供のため未定義＝スコア計算対象外）
 */
// 現行スプシの abilityEvolutions から生成（gen:perf）。凸→ティアindex。Rは無し＝非スコア。
export const SLOT_TIER: Partial<Record<Rarity, number[][]>> =
  abilityPerf.slotTier as Partial<Record<Rarity, number[][]>>;
