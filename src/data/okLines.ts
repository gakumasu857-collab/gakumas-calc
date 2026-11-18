import type { ScenarioKey } from "./scenarios";
import type { TypeKey } from "@/lib/useCalcSettings";

/**
 * 最後の試験の「〇」ライン（試験前に3タイプのステが評価され、×・△が出ると点数の倍率が下がる。〇以上が目標）。
 * 値はオーナー提供の画像（2026-11-17）。[審査基準1位のタイプ, 2位, 3位]。型はアイドルのバランス型／特化型。
 * 見るのは最後の試験だけ（オーナー指定）: H.I.F＝本戦、N.I.A＝3次（最終）オーディション、初＝最終試験。
 * 途中の試験（選抜1〜3・1次2次・中間）の値も画像にはあるが、その時点のステを計算していないので持たない。
 *
 * 探索での使い方（オーナー指定「ステ合計が命」）:
 * 1. 合計ステがいちばん優先。合計が同じになる中で、3タイプとも〇ラインを超えるほうを選ぶ
 *    （レッスン・選抜の配分・授業・営業のどれで合わせてもよい）。余ったぶんは審査基準の高いタイプへ
 * 2. 設定「3タイプとも〇ラインを必ず超える」（okLineRequired）をオンにすると、最低ステの条件として扱う
 *    （合計ステが下がっても守る）
 * 判定に使うのは最後の試験が始まる前のステ（lib/preFinal.ts。試験で上がる分・試験終了のアビリティの最後の試験の分を除く。2026-11-18）
 */
export const OK_LINES: Record<
  ScenarioKey,
  { exam: string; flat: readonly [number, number, number]; skew: readonly [number, number, number] }
> = {
  hif: { exam: "本戦", flat: [1872, 1393, 1089], skew: [1961, 1308, 1090] },
  niaMaster: { exam: "3次オーディション", flat: [1428, 1136, 682], skew: [1628, 1010, 619] },
  hatsuLegend: { exam: "最終試験", flat: [1834, 1361, 1065], skew: [1924, 1281, 1065] },
};

/**
 * タイプごとの〇ライン。ranks は審査基準の順位（1が最上位）、tag はバランス型＝flat／特化型＝skew。
 */
export function okLineTargets(
  scenario: ScenarioKey,
  tag: "flat" | "skew",
  ranks: Record<TypeKey, number>,
): Record<TypeKey, number> {
  const line = OK_LINES[scenario]?.[tag] ?? OK_LINES.hif.flat;
  const at = (rank: number) => line[Math.min(3, Math.max(1, rank)) - 1];
  return { vocal: at(ranks.vocal), dance: at(ranks.dance), visual: at(ranks.visual) };
}
