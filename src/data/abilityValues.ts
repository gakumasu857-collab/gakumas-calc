/**
 * 凸数 → アビリティ枠のティア（Ⅰ=0〜Ⅴ=4）の対応表。
 * SLOT_TIER[レアリティ][枠番号0〜5][凸数0〜4] = ティアindex。
 * 現行スプシの abilityEvolutions から生成（gen:perf）。
 *
 * ※ 手書きの効果量テーブル（ABILITY_VALUES 等）は generated/abilityPerf.json に
 *    置き換えられたため削除済み（履歴参照）。
 */
import abilityPerf from "./generated/abilityPerf.json";
import type { Rarity } from "./constants";

export const SLOT_TIER: Partial<Record<Rarity, number[][]>> =
  abilityPerf.slotTier as Partial<Record<Rarity, number[][]>>;
