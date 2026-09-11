import { CalendarCheck, ListOrdered, Sparkles } from "lucide-react";
import { BTN_PRIMARY } from "@/components/ui";
import { produceRank } from "@/lib/produceRank";

/**
 * スマホ用の画面下固定バー。評価値・踏み方の編集・発動回数・主役ボタンを
 * どこまでスクロールしても押せるようにする。数字をタップすると結果ブロックへスクロール。
 */
export default function MobileActionBar({
  rating,
  canShow,
  busy,
  ready,
  notReadyTitle,
  onRun,
  onShowResults,
  onEditPlan,
  onEditCounts,
}: {
  rating: number;
  canShow: boolean;
  busy: boolean;
  ready: boolean;
  notReadyTitle?: string;
  onRun: () => void;
  onShowResults: () => void;
  onEditPlan: () => void;
  onEditCounts: () => void;
}) {
  const iconBtn =
    "flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-1.5">
        <button
          type="button"
          onClick={onShowResults}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
          title="結果（評価値・育成後のステ）へ移動"
        >
          <span className="text-[10px] font-semibold text-slate-500">評価値</span>
          {canShow ? (
            <span className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-blue-600">
                {rating.toLocaleString()}
              </span>
              <span className="rounded bg-blue-600 px-1 text-xs font-black text-white">
                {produceRank(rating)}
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">サポカ6枚で表示</span>
          )}
        </button>
        <button type="button" onClick={onEditPlan} className={iconBtn} title="踏み方を編集">
          <CalendarCheck size={16} />
          踏み方
        </button>
        <button type="button" onClick={onEditCounts} className={iconBtn} title="発動回数を調整">
          <ListOrdered size={16} />
          回数
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !ready}
          title={notReadyTitle}
          className={`${BTN_PRIMARY} px-3`}
        >
          <Sparkles size={15} />
          {busy ? "計算中…" : "求める"}
        </button>
      </div>
    </div>
  );
}
