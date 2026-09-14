import { CalendarCheck, ListOrdered } from "lucide-react";

/**
 * 画面の左端に生えるタブ（上半分＝発動回数、下半分＝レッスン等の踏み方）。
 * 押すとそれぞれのモーダルが開く。位置が目に入りにくいので、初めて探索を押したあとは
 * 吹き出しで案内し、タブを押すか「わかった」を押すまで光らせる（見たことは記憶する）。
 */
export default function SideTabs({
  onOpenCounts,
  onOpenPlan,
  countsTitle,
  highlight,
  onDismissHighlight,
}: {
  onOpenCounts: () => void;
  onOpenPlan: () => void;
  countsTitle?: string;
  /** 初めて探索したあとの案内（吹き出し＋タブを光らせる） */
  highlight: boolean;
  onDismissHighlight: () => void;
}) {
  const base =
    "fixed left-0 z-30 flex w-8 items-center justify-center gap-1.5 rounded-r-xl text-xs font-bold text-white shadow-lg transition";
  const glow = highlight ? " ring-4 ring-amber-300 animate-pulse" : "";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onDismissHighlight();
          onOpenCounts();
        }}
        title={countsTitle}
        style={{ writingMode: "vertical-rl" }}
        className={`${base} bottom-[calc(50%+4px)] top-16 bg-blue-600 hover:bg-blue-500${glow}`}
      >
        <ListOrdered size={14} />
        発動回数
      </button>
      <button
        type="button"
        onClick={() => {
          onDismissHighlight();
          onOpenPlan();
        }}
        title="レッスン・授業（営業）・選抜（オーディション／試験）の踏み方を編集"
        style={{ writingMode: "vertical-rl" }}
        className={`${base} bottom-4 top-[calc(50%+4px)] bg-sky-600 hover:bg-sky-500${glow}`}
      >
        <CalendarCheck size={14} />
        レッスン等の踏み方
      </button>
      {highlight && (
        <div className="fixed left-11 top-1/2 z-30 w-64 -translate-y-1/2 rounded-xl border-2 border-amber-300 bg-white p-3 shadow-xl">
          {/* 左のタブを指す矢印 */}
          <span className="absolute -left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-amber-300 bg-white" />
          <p className="text-sm font-bold text-slate-900">踏み方と発動回数はここから</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            左端のタブで、レッスンの踏み方とアビリティの発動回数を実際の育成に合わせて変えられます。
            変えると評価値がその場で動きます。
          </p>
          <button
            type="button"
            onClick={onDismissHighlight}
            className="mt-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
          >
            わかった
          </button>
        </div>
      )}
    </>
  );
}
