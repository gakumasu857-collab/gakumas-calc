/**
 * 探索の診断ログ（/debug の「診断ログをコピー」）と、その材料になる条件判定の入力。
 * 計算ページとデバッグページで同じものを作るためにここに集約している。
 */
import type { AutoOptimizeResult } from "./autoOptimize";
import { resolveSpMin } from "./buildOptimizeInput";
import { buildSnapshot } from "./calcSaveIO";
import type { CardFlagSets } from "./formation";
import { formationIssues, type ConditionInput } from "./formationConditions";
import { examsAllSingle } from "./optimize/stepping";
import type { SelectedMember, useCalcResult } from "./useCalcResult";
import type { CalcSettings } from "./useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 条件判定の入力（今の編成・設定・今の踏み方で決まるSP率持ち枚数・今のステ） */
export function buildConditionInput(
  r: CalcResult,
  flags: CardFlagSets,
  settings: CalcSettings,
): ConditionInput {
  return {
    members: r.members.filter((m): m is SelectedMember => m !== null),
    flags,
    settings,
    plan: r.plan,
    spMin: resolveSpMin(r, settings),
    capped: {
      vocal: r.perType.vocal.capped,
      dance: r.perType.dance.capped,
      visual: r.perType.visual.capped,
    },
    statCap: r.statCap,
    getLevel: r.getLevel,
    // 「選抜は極振りで探索する」が ON の H.I.F だけ見る
    examSingle:
      r.scenario === "hif" && settings.examAllIn
        ? examsAllSingle(r.schedule.examScores, r.schedule.examStats)
        : null,
  };
}

/**
 * 探索の診断ログ。セーブデータ形式の状態（設定・踏み方・メモリー・プロデュース・編成・所持）と
 * 今の評価値・条件の判定、探索結果（編成・踏み方・軸比較・フェーズ別スコア）をまとめる。
 * @param res 探索結果（まだ回していなければ null）
 */
export function buildDiagLog(
  r: CalcResult,
  flags: CardFlagSets,
  settings: CalcSettings,
  res: AutoOptimizeResult | null,
): string {
  const input = buildConditionInput(r, flags, settings);
  const issues = formationIssues(input);
  return JSON.stringify({
    version: 2,
    at: new Date().toISOString(),
    scenario: r.scenario,
    settings,
    flags: {
      pinned: [...flags.pinned],
      banned: [...flags.banned],
      rentalNg: [...(flags.rentalNg ?? [])],
    },
    snapshot: buildSnapshot(r),
    current: {
      rating: r.rating,
      meetsConditions: issues.length === 0,
      issues,
      slots: r.selected.slots,
    },
    result: res
      ? {
          rating: res.rating,
          slots: res.slots,
          hif: res.hif ?? null,
          nia: res.nia ?? null,
          hatsu: res.hatsu ?? null,
          axisReport: res.axisReport ?? null,
          spShortfall: res.spShortfall,
          evaluated: res.evaluated,
          elapsedMs: Math.round(res.elapsedMs),
          phaseScores: res.debug?.phaseScores ?? null,
          eventOps: res.eventOps ?? null,
        }
      : null,
  });
}
