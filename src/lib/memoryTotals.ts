/**
 * メモリースロット（選択中4枚）のタイプ別合計。
 * メモリー設定ページの表示と計算シートの「メモリー」欄の両方で使う。
 */
import type { Memory } from "./memoryTypes";
import type { TypeKey } from "./useCalcSettings";

const ATTR_OF_TYPE: Record<TypeKey, "Vo" | "Da" | "Vi"> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};

/**
 * パラボ追従メモリーの割当先。
 * mains = パラボ母数（%が掛かるレッスン・試験獲得）が大きい上位2タイプ、sub = 残り。
 * paraboAssignFromGains（sheetContext）で踏み方から自動で決まる。
 */
export type ParaboAssign = { mains: [TypeKey, TypeKey]; sub: TypeKey };

/**
 * パラボ追従メモリー（roleSpec持ち）を、現在の踏み方から決まる割当で
 * 具体的なアビリティ（上位2タイプ+%、残り1タイプ+固定値）に展開する。
 */
export function resolveParaboMemory(
  memory: Memory,
  assign: ParaboAssign,
): Memory {
  if (!memory.roleSpec) return memory;
  const { mainPct, subFlat } = memory.roleSpec;
  const main2Pct = memory.roleSpec.main2Pct ?? mainPct; // 2位の%（65点は 3.5%／2.8% のように1位と違う）
  return {
    ...memory,
    abilities: [
      { attr: ATTR_OF_TYPE[assign.mains[0]], value: `+${mainPct}%` },
      { attr: ATTR_OF_TYPE[assign.mains[1]], value: `+${main2Pct}%` },
      { attr: ATTR_OF_TYPE[assign.sub], value: `+${subFlat}` },
    ],
  };
}

export type MemoryTotals = {
  Vo: { percent: number; flat: number };
  Da: { percent: number; flat: number };
  Vi: { percent: number; flat: number };
  P: number;
  回復: { Vo: number; Da: number; Vi: number };
};

export function calcMemoryTotals(
  memories: (Memory | undefined)[],
): MemoryTotals {
  const totals: MemoryTotals = {
    Vo: { percent: 0, flat: 0 },
    Da: { percent: 0, flat: 0 },
    Vi: { percent: 0, flat: 0 },
    P: 0,
    回復: { Vo: 0, Da: 0, Vi: 0 },
  };
  for (const memory of memories) {
    if (!memory) continue;
    for (const ability of memory.abilities) {
      if (ability.attr === "P") {
        totals.P += parseFloat(ability.value) || 0;
      } else if (ability.attr === "回復") {
        const target = ability.value as "Vo" | "Da" | "Vi";
        if (target in totals.回復) totals.回復[target] += 1;
      } else {
        const bucket = totals[ability.attr];
        if (ability.value.endsWith("%")) {
          bucket.percent += parseFloat(ability.value) || 0;
        } else {
          bucket.flat += parseFloat(ability.value) || 0;
        }
      }
    }
  }
  // 浮動小数の誤差を丸める（1.4+2.8=4.199…対策）
  for (const key of ["Vo", "Da", "Vi"] as const) {
    totals[key].percent = Math.round(totals[key].percent * 10) / 10;
  }
  return totals;
}
