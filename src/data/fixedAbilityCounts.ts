/**
 * 回数固定アビリティの発動回数（アプリ固有の設定。スプシでは管理しない）。
 *
 * 前イベ起動タグ・abilityValues の trigger_tag のうち、回数が可変でないものはここが唯一の源。
 * - "auto" はスケジュール（踏み方）からの自動集計
 * - 試験・オーディション終了の回数はシナリオで変わる: NIA=normal / 初=hatsu / HIF=hif
 * 新しい固定回数アビリティを足すときはここに1行追加する（キーは constants.ts の ABILITY_NAMES）。
 * 日本語名との照合は sheetScore の回数リゾルバが abilityKeyFromLabel で行うので、
 * スプシで名前が変わっても ABILITY_NAMES を直すだけで追従する。
 *
 * ※「試験・オーディション終了（2回まで）」はここでは扱わない。
 *   発動回数タブ（スプシ→発動回数セット）の回数で解決される（ユーザー編集可）。
 */
import type { AbilityName } from "./constants";

export type FixedCount = "auto" | { normal: number; hatsu: number; hif: number };

export const FIXED_ABILITY_COUNTS: Partial<Record<AbilityName, FixedCount>> = {
  lesson: "auto",
  sp_lesson: "auto",
  normal_lesson: "auto",
  initial: { normal: 1, hatsu: 1, hif: 1 },
  bonus: { normal: 1, hatsu: 1, hif: 1 },
  param_event: { normal: 1, hatsu: 1, hif: 1 },
  up_SP_lesson_rate: { normal: 1, hatsu: 1, hif: 1 },
  nothing: { normal: 0, hatsu: 0, hif: 0 },
  stage_finish: { normal: 3, hatsu: 2, hif: 5 },
};
