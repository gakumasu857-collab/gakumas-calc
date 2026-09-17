import { useState } from "react";
import { optimizeSteppingForSlots, type ExamPolicy } from "./autoOptimize";
import { buildAutoOptimizeInput } from "./buildOptimizeInput";
import type { SelectedSlot } from "./formation";
import type { useCalcResult } from "./useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * 「今のサポカ編成のまま、踏み方（授業・営業込み）だけを最適化して適用」。
 * 計算ページの分割メニューと踏み方エディタの両方から使う。
 */
export function useOptimizePlan(r: CalcResult) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /**
   * @param examPolicy 選抜の点数配分の扱い（確認モーダルで選んだもの。省略時は設定から）。
   *   fixed なら点数配分は書き換えない（手で変えた印も残す）
   */
  const run = (onDone?: (message: string) => void, examPolicy?: ExamPolicy) => {
    setBusy(true);
    setMsg(null);
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const slots = r.selected.slots.filter(
          (s): s is SelectedSlot => s !== null,
        );
        // 編成は固定するので BAN/固定フラグは無関係（空で渡す）
        const input = buildAutoOptimizeInput(
          r,
          { banned: new Set(), pinned: new Set() },
          r.calc.settings,
          examPolicy,
        );
        const result = optimizeSteppingForSlots(input, slots);
        if (!result) return;
        // ステ入力にしていた選抜を探索がスコア入力へ切り替えたか（メッセージで知らせる）
        const hif = result.hif;
        // 点数配分を固定して探索したときは、選抜は書き換えない
        const keepExams = examPolicy === "fixed";
        const statToScore =
          !!hif &&
          !keepExams &&
          r.schedule.examStats.some((x, i) => x != null && hif.examStats[i] == null);
        if (hif) {
          if (keepExams) r.schedule.setPlan(hif.lessons, hif.classTypes);
          else
            r.schedule.setPlan(
              hif.lessons,
              hif.classTypes,
              hif.examScores,
              hif.examStats,
            );
        }
        if (result.nia)
          r.niaSchedule.setPlan(result.nia.lessons, result.nia.sales);
        if (result.hatsu)
          r.hatsuSchedule.setPlan(result.hatsu.lessons, result.hatsu.classTypes);
        // 前イベ・後イベの取得状況も探索が決める（制限が無ければ全部発動）
        r.events.applyEventOps(
          slots.map((s) => s.id),
          result.eventOps ?? [],
        );
        const budget = r.calc.settings.eventBudget;
        const message =
          `今のサポカ編成での最適な踏み方に更新しました（合計ステ ${Math.round(result.cappedSum).toLocaleString()}）` +
          (budget.enabled
            ? `。取得回数の制限（前イベ${budget.pre}枚・後イベ${budget.post}回）に合わせて前イベ・後イベの取得状況も反映しました`
            : "") +
          (statToScore
            ? "。ステ入力にしていた選抜を、探索したスコアの入力に切り替えました"
            : "") +
          (hif && keepExams ? "。選抜の点数配分はそのままにして、レッスン・授業だけ探索しました" : "");
        setMsg(message);
        onDone?.(message);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return { run, busy, msg, clear: () => setMsg(null) };
}
