/**
 * パラメータボーナス（%）→ 固定値の変換表。
 *
 * パラボは「レッスン・試験の獲得量 × %」を1イベントずつ切り捨てて合算する
 * （sheetScore.paraboConvert）。そのため同じ%でも、既に乗っている他のパラボ%との
 * 兼ね合いで切り捨てられる端数が変わり、実際に増える固定値は幅を持つ:
 *
 *   1回の獲得 g に対する増分 = floor(g×(B+p)) − floor(g×B) ＝ floor(g×p) か floor(g×p)+1
 *
 * なので「最小＝全部切り捨て／最大＝端数がすべて繰り上がった場合」の範囲で示す。
 */
import perfData from "@/data/generated/abilityPerf.json";
import { ATTR_VALUES } from "./memoryTypes";
import type { SheetScoreContext } from "./sheetScore";
import { TYPE_SHEET_ROLE } from "./sheetContext";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

const PERF = (perfData as { perf: Record<string, { tiers: (number | null)[] }> })
  .perf;

export type ParaboRange = { min: number; max: number };

/**
 * パラボ pct%（例: 2.8）を固定値へ変換したときの範囲。
 * min は「他にパラボが無いときの実値」で、計算エンジン（sheetScore.paraboConvert）と
 * 同じ式・同じ丸めで求める（g × (pct/100) を floor。誤差の補正もしない＝実装と一致させる）。
 * max は他のパラボに乗ったときに端数が全部繰り上がった場合。
 * @param gains %が掛かる獲得量の一覧（そのタイプのレッスン＋試験）
 */
export function paraboRange(pct: number, gains: number[]): ParaboRange {
  let min = 0;
  let max = 0;
  for (const g of gains) {
    // エンジン（sheetScore.paraboConvert）と同じ丸め（獲得1回ごとに切り捨て）
    const x = g * (pct / 100) + 1e-9;
    const floored = Math.floor(x);
    min += floored;
    max += x === floored ? floored : floored + 1;
  }
  return { min, max };
}

/** 範囲の表示（同値なら1つの数字） */
export function formatRange({ min, max }: ParaboRange): string {
  return min === max ? String(min) : `${min}〜${max}`;
}

/** タイプごとの「%が掛かる獲得量」（レッスン＋試験）を取り出す */
export function paraboGainsByType(
  ctx: SheetScoreContext,
): Record<TypeKey, number[]> {
  const out = {} as Record<TypeKey, number[]>;
  for (const type of TYPE_KEYS) {
    const g = ctx.gains[TYPE_SHEET_ROLE[type]];
    out[type] = [...g.lessons, ...g.exams];
  }
  return out;
}

/** メモリー1枠のパラボ%の選択肢（+1.4% 〜 +3.5% の4段階） */
export const MEMORY_PARABO_PCTS: number[] = ATTR_VALUES.Vo.filter((v) =>
  v.endsWith("%"),
).map((v) => parseFloat(v));

/** サポカのパラボ%（レアリティ×強化段階Ⅰ〜Ⅴ）。SSRと配布SSRは同値なのでまとめる */
export const CARD_PARABO_ROWS: { rarity: string; pcts: number[] }[] = [
  { rarity: "SSR（配布SSR）", pcts: tiersOf("SSR") },
  { rarity: "SR", pcts: tiersOf("SR") },
  { rarity: "R", pcts: tiersOf("R") },
];

function tiersOf(rarity: string): number[] {
  const tiers = PERF[`${rarity}パラメータボーナス`]?.tiers ?? [];
  return tiers
    .filter((v): v is number => typeof v === "number")
    .map((v) => Math.round(v * 1000) / 10);
}
