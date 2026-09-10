/**
 * 回数固定アビリティの発動回数（アプリ固有の設定。スプシでは管理しない）。
 *
 * trigger_tag（発動参照）のうち回数が可変でないものはここが唯一の源。
 * - "auto" はスケジュール（踏み方）からの自動集計
 * - 試験・オーディションの回数はシナリオで変わる: NIA=normal / 初=hatsu / HIF=hif
 * 新しい固定回数アビリティを足すときはここに1行追加する。
 * ラベルはスプシの trigger_tag 表記と一致させること。
 *
 * ※「試験・オーディション（2回まで）」はここでは扱わない。
 *   発動回数タブ（スプシ→発動回数セット）の回数で解決される（ユーザー編集可）。
 */
export type FixedCount = "auto" | { normal: number; hatsu: number; hif: number };

export const FIXED_ABILITY_COUNTS: Record<string, FixedCount> = {
  レッスン: "auto",
  SPレッスン: "auto",
  通常レッスン: "auto",
  初期値: { normal: 1, hatsu: 1, hif: 1 },
  パラメータボーナス: { normal: 1, hatsu: 1, hif: 1 },
  パラメータイベント: { normal: 1, hatsu: 1, hif: 1 },
  SPレッスン率: { normal: 1, hatsu: 1, hif: 1 },
  何もなし: { normal: 0, hatsu: 0, hif: 0 },
  試験・オーディション: { normal: 3, hatsu: 2, hif: 5 },
};
