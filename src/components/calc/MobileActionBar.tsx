import { ChevronDown, Settings } from "lucide-react";
import { RunButtons, type RunHandlers } from "@/components/calc/ActionPanel";
import { BTN_SECONDARY } from "@/components/ui";

/**
 * スマホの画面下バー（PCでは出さない）。スクロールしなくても探索を押せるようにする。
 * 上段: 今の評価値（押すと結果まで移動）／前提が足りないときはその案内。
 * 下段: 「条件」と主役ボタン＋▾（一覧は上へ開く）。
 * ※ 中の ▾ 一覧が使う fixed の覆いを画面全体に効かせるため、このバーに backdrop-blur 等は付けない。
 */
export default function MobileActionBar({
  busy,
  ready,
  missingInputs,
  notReadyTitle,
  rating,
  rank,
  preview,
  onRun,
  onFormationOnly,
  onPlanOnly,
  onConditions,
}: RunHandlers & {
  missingInputs: string[];
  /** 今の評価値（表示できないときは null） */
  rating: number | null;
  rank: string | null;
  /** 取得制限の提案中（評価値を黄色で出す） */
  preview: boolean;
  onConditions: () => void;
}) {
  // 結果（評価値・ステータス）まで移動。smooth だと描画が止まっている環境で動かないことがあるので即時
  const jumpToResults = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById("calc-results")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] lg:hidden">
      {ready ? (
        <a
          href="#calc-results"
          onClick={jumpToResults}
          className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"
          title="結果（評価値・育成後のステータス）まで移動"
        >
          評価値
          <b
            className={`text-base tabular-nums ${preview ? "text-amber-600" : "text-blue-600"}`}
          >
            {rating !== null ? rating.toLocaleString() : "—"}
          </b>
          {rank && (
            <span
              className={`rounded px-1 text-[10px] font-black text-white ${
                preview ? "bg-amber-500" : "bg-blue-600"
              }`}
            >
              {rank}
            </span>
          )}
          <span className="ml-auto flex items-center gap-0.5 font-normal text-slate-400">
            結果を見る
            <ChevronDown size={12} />
          </span>
        </a>
      ) : (
        <p className="mb-1.5 text-[11px] font-semibold text-amber-600">
          「育成の前提」で {missingInputs.join("・")} を選ぶと押せます
        </p>
      )}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={onConditions}
          className={`${BTN_SECONDARY} shrink-0`}
          title="探索の条件（タイプ割合・最低/最高ステ・SP率持ち・取得回数・試験補助など）"
        >
          <Settings size={14} />
          条件
        </button>
        <RunButtons
          className="min-w-0 flex-1"
          menuUp
          busy={busy}
          ready={ready}
          notReadyTitle={notReadyTitle}
          onRun={onRun}
          onFormationOnly={onFormationOnly}
          onPlanOnly={onPlanOnly}
        />
      </div>
    </div>
  );
}
