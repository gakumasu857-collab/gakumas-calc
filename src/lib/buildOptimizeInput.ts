/**
 * 全自動最適化（runFullOptimize）への入力を計算ページの状態から組み立てる。
 * 計算ページと /debug で同じ入力を使うため共通化している。
 */
import type { AutoOptimizeInput } from "./autoOptimize";
import type { CardFlagSets } from "./formation";
import { IDOL_RANKS } from "./pIdol";
import { manualCountFromSet } from "./sheetContext";
import type { useCalcResult } from "./useCalcResult";
import type { CalcSettings, TypeKey } from "./useCalcSettings";
import { TYPE_KEYS } from "./useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

export function buildAutoOptimizeInput(
  r: CalcResult,
  flags: CardFlagSets,
  settings: CalcSettings,
): AutoOptimizeInput {
  const manual = manualCountFromSet(
    r.selectedSet ? (key) => r.ability.getCount(r.selectedSet!, key) : null,
  );
  const tag = IDOL_RANKS[settings.idol]?.tag === "特化" ? "skew" : "flat";
  return {
    scenario: r.scenario,
    hif: {
      lessons: r.schedule.lessons,
      classTypes: r.schedule.classTypes,
      examScores: r.schedule.examScores,
    },
    nia: r.niaSchedule,
    hatsu: r.hatsuSchedule,
    memories: r.memoryStore.selected.map(
      (id) => r.memoryStore.findMemory(id) ?? undefined,
    ),
    pStats: r.pStats,
    plan: r.plan,
    statCap: r.statCap,
    tag,
    ranks: r.typeRanks,
    manual,
    eventCounts: r.events.get,
    getLevel: r.getLevel,
    flags,
    spMin: settings.spMin,
    eventBudget: settings.eventBudget.enabled
      ? { pre: settings.eventBudget.pre, post: settings.eventBudget.post }
      : undefined,
    typeRatio: settings.typeRatio.enabled
      ? {
          vocal: settings.typeRatio.vocal,
          dance: settings.typeRatio.dance,
          visual: settings.typeRatio.visual,
        }
      : undefined,
    examAssist: settings.examAssist,
    minStats: settings.minStats,
    wappenCount: settings.wappenCount,
    round1: settings.round1,
    round2: settings.round2,
  };
}

/** 最低ステ条件の優先順（審査基準ランク昇順＝高いタイプ優先）。UIサマリー用にも使う */
export function minStatPriority(ranks: Record<TypeKey, number>): TypeKey[] {
  return [...TYPE_KEYS].sort((a, b) => ranks[a] - ranks[b]);
}
