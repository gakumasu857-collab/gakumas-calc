import { CalendarCheck, ListOrdered } from "lucide-react";
import { Card } from "@/components/calc/CalcCard";
import { PlanChips, type PlanSummary } from "@/components/calc/OptimizeResultCard";
import Hint from "@/components/Hint";
import { BTN_SECONDARY, NOTE, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { TYPE_KEYS } from "@/lib/useCalcSettings";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

const TYPE_TEXT = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
} as const;

/** 今の踏み方（シナリオ別のストア）を要約に変換する（サブ・授業／営業の並び込み） */
export function currentPlanSummary(r: CalcResult): PlanSummary {
  if (r.scenario === "niaMaster") {
    return {
      lessons: r.niaSchedule.lessons.map((l) => ({ type: l.main, sp: l.sp })),
      sales: r.niaSchedule.sales.map((s) => s.type),
    };
  }
  if (r.scenario === "hatsuLegend") {
    return {
      lessons: r.hatsuSchedule.lessons.map((l) => ({ type: l.main, sp: l.sp })),
      classes: r.hatsuSchedule.classTypes,
    };
  }
  return {
    lessons: r.schedule.lessons.map((l) => ({
      type: l.main,
      sub: l.sub,
      sp: l.sp,
    })),
    classes: r.schedule.classTypes,
  };
}

/** 踏み方の実現確率の表示（小さい値でも桁が読めるように段階的に精度を上げる） */
export function formatProb(p: number): string {
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  if (pct <= 0) return "0%";
  return `${pct.toPrecision(2)}%`;
}

/**
 * 「レッスンの踏み方」ブロック。今の踏み方（レッスンのメイン・サブ・SP、授業／営業の並び）を
 * チップで常に見せる。編集と発動回数の調整は左の操作パネル（スマホは下バー）からも開ける。
 */
export default function PlanSummaryCard({
  r,
  onEditPlan,
  onEditCounts,
}: {
  r: CalcResult;
  onEditPlan: () => void;
  onEditCounts: () => void;
}) {
  const { calc } = r;
  const { settings } = calc;
  const plan = currentPlanSummary(r);

  return (
    <Card
      title="レッスンの踏み方"
      hint={<Hint text={GLOSSARY.stepping} />}
      action={
        <>
          <button type="button" onClick={onEditPlan} className={BTN_SECONDARY}>
            <CalendarCheck size={13} />
            踏み方を編集
          </button>
          <button
            type="button"
            onClick={onEditCounts}
            className={BTN_SECONDARY}
            title={
              r.selectedSet
                ? `育成パターン「${r.selectedSet.name}」の発動回数を調整`
                : "育成パターンを選ぶと調整できます"
            }
          >
            <ListOrdered size={13} />
            発動回数を調整
          </button>
        </>
      }
    >
      <button
        type="button"
        onClick={onEditPlan}
        title="クリックで踏み方を編集"
        className="block w-full rounded-lg px-1 py-1 text-left transition hover:bg-slate-50"
      >
        <PlanChips plan={plan} />
      </button>

      {/* SPレッスン率とこの踏み方の実現確率 */}
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 font-bold text-slate-700">
            SPレッスン率上昇
            <Hint text={GLOSSARY.spRate} />
          </span>
          {TYPE_KEYS.map((type) => (
            <span key={type} className="tabular-nums">
              <span className={`font-bold ${TYPE_TEXT[type]}`}>
                {TYPE_SHORT[type]}
              </span>{" "}
              +{((r.spLesson.bonus[type] + 0.05) * 100).toFixed(1)}%
            </span>
          ))}
          <label className="flex items-center gap-1 text-xs text-slate-400">
            表記外推定SP率
            <input
              type="number"
              min={0}
              max={100}
              value={settings.baseSpRate}
              onChange={(e) =>
                calc.update({
                  baseSpRate: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-sm text-slate-700"
            />
            %
          </label>
        </div>
        <p className={`mt-1 ${NOTE}`}>
          この踏み方の実現確率:{" "}
          {r.scenario === "hif" ? (
            // HIFは選抜・本戦が別の期間なので、それぞれのSP踏みの確率だけを出す
            <span className="tabular-nums">
              選抜 <b className="text-blue-700">{formatProb(r.spLesson.probSen)}</b>
              {" ／ "}本戦{" "}
              <b className="text-blue-700">{formatProb(r.spLesson.probHon)}</b>
            </span>
          ) : (
            <b className="tabular-nums text-blue-700">{formatProb(r.spLesson.prob)}</b>
          )}
        </p>
      </div>
    </Card>
  );
}
