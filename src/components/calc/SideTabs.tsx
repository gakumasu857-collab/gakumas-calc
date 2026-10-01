import { CalendarCheck, ListOrdered } from "lucide-react";

/**
 * 画面の左端に生えるタブ（上半分＝プロデュース（アビリティ発動回数）、下半分＝レッスン等の踏み方）。色は以前の水色（sky-600）を一段薄くした sky-500（濃い青は騒がしい・黒と緑・白・薄すぎる水色は違和感との指摘）。上下とも同じ色。
 * 押すとそれぞれのモーダルが開く。位置が目に入りにくいので、初めて探索を押したあとは
 * 吹き出しで案内し、タブを押すか「わかった」を押すまで光らせる（見たことは記憶する）。
 * 吹き出しは「プロデュース」「踏み方」という言葉を知らない人向けに、
 * 「ステータスなどはここから変えられます」と言い、それぞれで何のステータスが変わるかを書く
 * （プロデュース設定を開くと差し入れ・ドリンク交換などの回数が並ぶので、
 *   「サポカのステータスはアビリティの発動回数で決まる」ことを先に伝える。オーナー指定 2026-10-01）。
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
    "fixed left-0 z-30 flex w-8 items-center justify-center gap-1.5 rounded-r-xl bg-sky-500 text-xs font-bold text-white shadow-lg transition hover:bg-sky-400";
  // Tailwind はクラス名を文字どおりに拾うので、${...} と隣接させない（top-16 が抜けてタブが縮む事故があった）
  const glow = highlight ? "ring-4 ring-amber-300 animate-pulse" : "";
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
        className={`${base} top-16 bottom-[calc(50%+4px)] ${glow}`}
      >
        <ListOrdered size={14} />
        プロデュース設定
      </button>
      <button
        type="button"
        onClick={() => {
          onDismissHighlight();
          onOpenPlan();
        }}
        title="レッスン・授業（営業）・選抜（オーディション／試験）の踏み方を編集"
        style={{ writingMode: "vertical-rl" }}
        className={`${base} top-[calc(50%+4px)] bottom-4 ${glow}`}
      >
        <CalendarCheck size={14} />
        レッスン等の踏み方
      </button>
      {highlight && (
        <div className="fixed left-11 top-1/2 z-30 w-72 max-w-[calc(100vw-3.5rem)] -translate-y-1/2 rounded-xl border-2 border-amber-300 bg-white p-3 shadow-xl">
          {/* 左のタブを指す矢印 */}
          <span className="absolute -left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-amber-300 bg-white" />
          <p className="text-sm font-bold text-slate-900">ステータスなどは、ここから変えられます</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            左端の2つのタブで、実際の育成に合わせて変えられます。
          </p>
          <dl className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-slate-600">
            <div>
              <dt className="font-bold text-slate-800">プロデュース設定（上）</dt>
              <dd>
                サポカで上がるステータス。サポカのステータスは
                <b className="text-slate-800">アビリティが何回発動するか</b>
                （差し入れ・ドリンク交換などの回数）で決まるので、その回数を変えます。
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-800">レッスン等の踏み方（下）</dt>
              <dd>レッスン・授業・試験で上がるステータス。</dd>
            </div>
          </dl>
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
