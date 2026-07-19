/**
 * プロデュース評価値 → ランク（学マスwiki「最終プロデュース評価」準拠）。
 * 評価値だけで決まる（シナリオに依存しない。到達できる上限がシナリオで変わるだけ）。
 * 参照: https://seesaawiki.jp/gakumasu/d/最終プロデュース評価
 */
const RANK_THRESHOLDS: { min: number; rank: string }[] = [
  { min: 35000, rank: "S5" },
  { min: 30000, rank: "S4+" },
  { min: 26000, rank: "S4" },
  { min: 23000, rank: "SSS+" },
  { min: 20000, rank: "SSS" },
  { min: 18000, rank: "SS+" },
  { min: 16000, rank: "SS" },
  { min: 14500, rank: "S+" },
  { min: 13000, rank: "S" },
  { min: 11500, rank: "A+" },
  { min: 10000, rank: "A" },
  { min: 8000, rank: "B+" },
  { min: 6000, rank: "B" },
  { min: 4500, rank: "C+" },
  { min: 3000, rank: "C" },
  { min: 2000, rank: "D" },
  { min: 1000, rank: "E" },
  { min: 0, rank: "F" },
];

/** 評価値からランク名（S5 / S4+ / SSS+ / … / F）を返す */
export function produceRank(value: number): string {
  for (const t of RANK_THRESHOLDS) {
    if (value >= t.min) return t.rank;
  }
  return "F";
}
