/**
 * 「最後の試験が始まる前」のステ（〇ラインの判定用。2026-11-18 オーナー指定）。
 *
 * 最後の試験（H.I.F＝本戦、N.I.A＝3次オーディション、初＝最終試験）の〇ラインは、その試験が始まる前の
 * 3タイプのステで判定される。なので判定には、育成後のステから次の分を除いた値を使う:
 * - 最後の試験で手に入る固定のステ（N.I.A＝3次オーディションの上昇、初＝最終試験の順位報酬。
 *   H.I.F の本戦はステが上がらないので除くものはない）と、それに掛かるパラボ
 * - 試験・オーディション終了で発動するアビリティの、最後の試験の分
 *   （発動回数を「最後の試験の前までの回数」で頭打ちにする: H.I.F は選抜3回、N.I.A は1次・2次の2回、初は中間の1回）
 * 評価値・合計ステは今までどおり育成後のステで出す（ここは〇ラインの判定だけ）。
 */
import type { ScenarioKey } from "@/data/scenarios";
import {
  evaluateTeam,
  eventBudgetScales,
  rescoreCards,
  summedParaboByType,
  type EventBudget,
  type ScoredCard,
} from "./formation";
import { TYPE_SHEET_ROLE } from "./sheetContext";
import type { SheetScoreContext } from "./sheetScore";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/** 最後の試験が始まる前までの「試験・オーディション終了」の回数 */
export const STAGE_FINISH_BEFORE_FINAL: Record<ScenarioKey, number> = {
  // 選抜1〜3（本戦の2ラウンドは最後の試験）
  hif: 3,
  // 1次・2次オーディション
  niaMaster: 2,
  // 中間試験
  hatsuLegend: 1,
};

const STAGE_FINISH_RE = /試験・オーディション終了/;

/** 最後の試験の前までで数える計算コンテキスト（試験終了の回数を頭打ち・N.I.A は3次オーディションをパラボの母数から外す） */
export function preFinalContext(ctx: SheetScoreContext, scenario: ScenarioKey): SheetScoreContext {
  const limit = STAGE_FINISH_BEFORE_FINAL[scenario];
  const counts = (label: string) => {
    const n = ctx.counts(label);
    return STAGE_FINISH_RE.test(label) ? Math.min(n, limit) : n;
  };
  if (scenario !== "niaMaster") return { ...ctx, counts };
  const gains = {} as SheetScoreContext["gains"];
  for (const [role, g] of Object.entries(ctx.gains) as [keyof SheetScoreContext["gains"], { lessons: number[]; exams: number[] }][]) {
    // N.I.A の exams は [1次, 2次, 3次]。最後（3次）を外す
    gains[role] = { lessons: g.lessons, exams: g.exams.slice(0, -1) };
  }
  return { ...ctx, counts, gains };
}

/** 最後の試験の前のステを出すための土台（サポカ抜き） */
export type PreFinalBase = {
  /** preFinalContext で作ったコンテキスト */
  ctx: SheetScoreContext;
  /** パラボ変換前のサポカ抜きのステ（最後の試験の固定のステを除いたもの） */
  baseNoConv: Record<TypeKey, number>;
  /** サポカ抜きのパラボ%（メモリー・Pアイドルなど。育成後と同じ） */
  basePct: Record<TypeKey, number>;
  caps: Record<TypeKey, number>;
  budget?: EventBudget;
};

/** 最後の試験の前のステ（タイプ別・上限で頭打ち）。members は育成後のコンテキストで点数化したものでよい（ここで点数化し直す） */
export function preFinalStats(members: ScoredCard[], base: PreFinalBase): Record<TypeKey, number> {
  const pre = rescoreCards(members, base.ctx, TYPE_SHEET_ROLE);
  const team = evaluateTeam(pre, { vocal: 0, dance: 0, visual: 0 }, base.caps, base.budget);
  const adj = summedParaboByType(pre, team.synergies, base.ctx, TYPE_SHEET_ROLE, base.basePct, team.synergiesByType);
  // 前イベが予算で目減りする分、アイテム補正も同率で引く（探索の preciseMembers と同じ）
  const scales = eventBudgetScales(pre, base.budget);
  const itemCut: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  if (scales.pre < 1) for (const m of pre) itemCut[m.type] += (1 - scales.pre) * m.itemBonus;
  const out = {} as Record<TypeKey, number>;
  for (const t of TYPE_KEYS) {
    out[t] = Math.min(base.caps[t], base.baseNoConv[t] + adj[t].support + adj[t].conv - itemCut[t]);
  }
  return out;
}
