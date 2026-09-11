import { Sparkles } from "lucide-react";
import { BTN_PRIMARY } from "@/components/ui";
import { produceRank } from "@/lib/produceRank";

/**
 * スマホ用の画面下固定バー。評価値と主役ボタンをどこまでスクロールしても見せる。
 * 数字をタップすると結果ブロックへスクロールする。
 */
export default function MobileActionBar({
  rating,
  canShow,
  busy,
  ready,
  notReadyTitle,
  onRun,
  onShowResults,
}: {
  rating: number;
  canShow: boolean;
  busy: boolean;
  ready: boolean;
  notReadyTitle?: string;
  onRun: () => void;
  onShowResults: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <button
          type="button"
          onClick={onShowResults}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
          title="結果（評価値・育成後のステ）へ移動"
        >
          <span className="text-[10px] font-semibold text-slate-500">評価値</span>
          {canShow ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums text-blue-600">
                {rating.toLocaleString()}
              </span>
              <span className="rounded bg-blue-600 px-1.5 text-sm font-black text-white">
                {produceRank(rating)}
              </span>
              <span className="text-[10px] text-slate-400">結果を見る ▴</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              サポカ6枚と育成パターンで表示
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !ready}
          title={notReadyTitle}
          className={BTN_PRIMARY}
        >
          <Sparkles size={15} />
          {busy ? "計算中…" : "求める"}
        </button>
      </div>
    </div>
  );
}
