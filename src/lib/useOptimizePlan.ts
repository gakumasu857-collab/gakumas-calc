import { useState } from "react";
import { optimizeSteppingForSlots } from "./autoOptimize";
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

  const run = (onDone?: (message: string) => void) => {
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
        );
        const result = optimizeSteppingForSlots(input, slots);
        if (!result) return;
        if (result.hif)
          r.schedule.setPlan(
            result.hif.lessons,
            result.hif.classTypes,
            result.hif.examScores,
          );
        if (result.nia)
          r.niaSchedule.setPlan(result.nia.lessons, result.nia.sales);
        if (result.hatsu)
          r.hatsuSchedule.setPlan(result.hatsu.lessons, result.hatsu.classTypes);
        const message = `今のサポカ編成での最適な踏み方に更新しました（合計ステ ${Math.round(result.cappedSum).toLocaleString()}）`;
        setMsg(message);
        onDone?.(message);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return { run, busy, msg, clear: () => setMsg(null) };
}
