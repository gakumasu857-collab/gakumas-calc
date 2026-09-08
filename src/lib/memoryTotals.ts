/**
 * メモリースロット（選択中4枚）のタイプ別合計。
 * メモリー設定ページの表示と計算シートの「メモリー」欄の両方で使う。
 */
import type { Ability, Memory } from "./memoryTypes";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

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
  return {
    ...memory,
    abilities: [
      { attr: ATTR_OF_TYPE[assign.mains[0]], value: `+${mainPct}%` },
      { attr: ATTR_OF_TYPE[assign.mains[1]], value: `+${mainPct}%` },
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

// ---------------------------------------------------------------------------
// メモリー軸（VoDa改造 / DaVi改造 / VoVi改造）
// %のパラボが乗る「メイン2タイプ」と固定値の「サブ1タイプ」の組み合わせを軸と呼ぶ。
// ロール追従メモリー（roleSpec）は踏み方から自動で付け替わるが、固定タイプの
// メモリーは軸が固定される。理想編成の探索では固定タイプのメモリーを他の軸へ
// 付け替えた（＝別軸に改造した）前提でも試し、いちばん高い軸を採用する。
// ---------------------------------------------------------------------------

/** メモリー軸: %が乗るメイン2タイプ（mains[0]が%大）と固定値のサブ1タイプ */
export type MemoryAxis = { mains: [TypeKey, TypeKey]; sub: TypeKey };

const TYPE_OF_ATTR: Partial<Record<string, TypeKey>> = {
  Vo: "vocal",
  Da: "dance",
  Vi: "visual",
};
const SHORT_OF_TYPE: Record<TypeKey, string> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};

/** 軸の表示名（例: VoDa） */
export function memoryAxisLabel(axis: MemoryAxis): string {
  return [...axis.mains]
    .sort((a, b) => TYPE_KEYS.indexOf(a) - TYPE_KEYS.indexOf(b))
    .map((t) => SHORT_OF_TYPE[t])
    .join("");
}

/** 試す3軸（メインは審査基準の高い順に並べる＝%の大きい方を審査基準上位へ） */
export function memoryAxisCandidates(
  ranks: Record<TypeKey, number>,
): MemoryAxis[] {
  return TYPE_KEYS.map((sub) => {
    const mains = TYPE_KEYS.filter((t) => t !== sub).sort(
      (a, b) => ranks[a] - ranks[b],
    ) as [TypeKey, TypeKey];
    return { mains, sub };
  });
}

export function sameMemoryAxis(a: MemoryAxis, b: MemoryAxis): boolean {
  return a.sub === b.sub && a.mains[0] === b.mains[0];
}

/**
 * 選択中メモリーの固定タイプ（roleSpec無しの Vo/Da/Vi）から今の軸を推定する。
 * サブ = %合計が最小のタイプ（同率なら固定値が大きい方、さらに同率なら審査基準が低い方）。
 * 固定タイプのメモリーが無い（全部ロール追従・P・回復）ときは null（軸は踏み方に追従する）。
 */
export function detectMemoryAxis(
  memories: (Memory | undefined)[],
  ranks: Record<TypeKey, number>,
): MemoryAxis | null {
  const pct: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const flat: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  let typed = false;
  for (const m of memories) {
    if (!m || m.roleSpec) continue;
    for (const a of m.abilities) {
      const t = TYPE_OF_ATTR[a.attr];
      if (!t) continue;
      typed = true;
      if (a.value.endsWith("%")) pct[t] += parseFloat(a.value) || 0;
      else flat[t] += parseFloat(a.value) || 0;
    }
  }
  if (!typed) return null;
  const order = [...TYPE_KEYS].sort(
    (a, b) => pct[a] - pct[b] || flat[b] - flat[a] || ranks[b] - ranks[a],
  );
  const sub = order[0];
  const mains = order
    .slice(1)
    .sort((a, b) => pct[b] - pct[a] || ranks[a] - ranks[b]) as [
    TypeKey,
    TypeKey,
  ];
  return { mains, sub };
}

/**
 * 固定タイプのメモリーを別の軸へ付け替える（「VoDa改造」相当）。
 * from.mains[0]→to.mains[0]、from.mains[1]→to.mains[1]、from.sub→to.sub と写す。
 * ロール追従メモリーは踏み方に追従するのでそのまま。回復の対象タイプも同じ写像で付け替える。
 */
export function remapMemoriesToAxis(
  memories: (Memory | undefined)[],
  from: MemoryAxis,
  to: MemoryAxis,
): (Memory | undefined)[] {
  const map: Record<TypeKey, TypeKey> = {
    vocal: "vocal",
    dance: "dance",
    visual: "visual",
  };
  map[from.mains[0]] = to.mains[0];
  map[from.mains[1]] = to.mains[1];
  map[from.sub] = to.sub;
  const remapAttr = (attr: string): string => {
    const t = TYPE_OF_ATTR[attr];
    return t ? SHORT_OF_TYPE[map[t]] : attr;
  };
  return memories.map((m) => {
    if (!m || m.roleSpec) return m;
    return {
      ...m,
      abilities: m.abilities.map((a) =>
        a.attr === "回復"
          ? { ...a, value: remapAttr(a.value) }
          : { ...a, attr: remapAttr(a.attr) as Ability["attr"] },
      ),
    };
  });
}

/** メモリー4枚の中身の署名（同じ中身のメモリーセットを探すため。順不同） */
export function memorySetSignature(memories: (Memory | undefined)[]): string {
  return memories
    .map((m) =>
      !m
        ? ""
        : m.roleSpec
          ? `role:${m.roleSpec.mainPct}/${m.roleSpec.subFlat}`
          : m.abilities
              .map((a) => `${a.attr}${a.value}`)
              .sort()
              .join(","),
    )
    .sort()
    .join("|");
}
