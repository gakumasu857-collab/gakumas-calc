/**
 * 全自動最適化（runFullOptimize）への入力を計算ページの状態から組み立てる。
 * 計算ページと /debug で同じ入力を使うため共通化している。
 */
import type { AutoOptimizeInput } from "./autoOptimize";
import { examStyleTags, type CardFlagSets } from "./formation";
import { IDOL_RANKS } from "./pIdol";
import { manualCountFromSet } from "./sheetContext";
import type { useCalcResult } from "./useCalcResult";
import type { CalcSettings, TypeKey } from "./useCalcSettings";
import { TYPE_KEYS } from "./useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * SP枚数条件（レッスンを多く踏む上位2タイプに設定）をタイプ別の最低枚数へ解決する。
 * 同数のときは審査基準ランクが高い（数字が小さい）タイプを上位とみなす。
 * ※ 解決はボタンを押した時点の踏み方基準（探索中の踏み方変化には追従しない近似）
 */
export function resolveSpMin(
  r: CalcResult,
  settings: CalcSettings,
): Record<TypeKey, number> {
  const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const picks =
    r.scenario === "niaMaster"
      ? r.niaSchedule.lessons
      : r.scenario === "hatsuLegend"
        ? r.hatsuSchedule.lessons
        : r.schedule.lessons;
  for (const p of picks) if (p.main) counts[p.main]++;
  const order = [...TYPE_KEYS].sort(
    (a, b) => counts[b] - counts[a] || r.typeRanks[a] - r.typeRanks[b],
  );
  const out: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  out[order[0]] = settings.spTop.first;
  out[order[1]] = settings.spTop.second;
  return out;
}

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
      examStats: r.schedule.examStats,
    },
    nia: r.niaSchedule,
    hatsu: r.hatsuSchedule,
    memories: r.memoryStore.slotMemories.map((m) => m ?? undefined),
    pStats: r.pStats,
    plan: r.plan,
    statCap: r.statCap,
    tag,
    ranks: r.typeRanks,
    manual,
    eventCounts: r.events.get,
    getLevel: r.getLevel,
    flags,
    spMin: resolveSpMin(r, settings),
    // 上位タイプのSP率持ち枚数条件は、候補の踏み方ごとに上位タイプを取り直して判定する
    spTop: { first: settings.spTop.first, second: settings.spTop.second },
    // 今の編成（探索の候補に含めて、押すたびに悪化しないようにする）
    currentSlots: r.selected.slots.filter(
      (s): s is NonNullable<typeof s> => s !== null,
    ),
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
    examStyleTags: examStyleTags(r.selectedSet?.plan ?? null),
    noStageItems: settings.noStageItems,
    minStats: settings.minStats,
    maxStats: settings.maxStats,
    round1: settings.round1,
    round2: settings.round2,
  };
}

