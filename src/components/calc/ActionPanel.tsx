import { useState } from "react";
import { CalendarCheck, ChevronDown, ListOrdered, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui";

/**
 * 操作パネル（デスクトップでは左列に固定表示＝スクロールしなくても押せる）。
 * 主役ボタン「理想の編成と踏み方を求める」＋ ▾（編成だけ／踏み方だけ）と、
 * よく使う「探索の条件」「踏み方を編集」「発動回数」。
 */
export default function ActionPanel({
  busy,
  ready,
  missingInputs,
  notReadyTitle,
  ownershipUnset,
  onRun,
  onFormationOnly,
  onPlanOnly,
  onConditions,
  onEditPlan,
  onEditCounts,
}: {
  busy: boolean;
  ready: boolean;
  missingInputs: string[];
  notReadyTitle?: string;
  /** 所持状況が未入力（全サポカ完凸で計算中） */
  ownershipUnset: boolean;
  onRun: () => void;
  onFormationOnly: () => void;
  onPlanOnly: () => void;
  onConditions: () => void;
  onEditPlan: () => void;
  onEditCounts: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !ready}
          title={notReadyTitle}
          className={`${BTN_PRIMARY} min-w-0 flex-1 justify-center rounded-r-none`}
        >
          <Sparkles size={15} />
          {busy ? "計算中…" : "理想の編成と踏み方を求める"}
        </button>
        <div className="relative flex">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy || !ready}
            title="編成だけ／踏み方だけを最適化"
            aria-label="そのほかの探索"
            className={`${BTN_PRIMARY} rounded-l-none border-l border-blue-400 px-2`}
          >
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg">
                <MenuItem
                  title="今の踏み方のまま、サポカ編成だけ"
                  desc="レッスンの踏み方は変えずに6枚を選び直す"
                  onClick={() => {
                    setMenuOpen(false);
                    onFormationOnly();
                  }}
                />
                <MenuItem
                  title="今のサポカ編成のまま、踏み方だけ"
                  desc="6枚は変えずにレッスン・授業（営業）・選抜の配分を最適化"
                  onClick={() => {
                    setMenuOpen(false);
                    onPlanOnly();
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {!ready && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
          「育成の前提」で {missingInputs.join("・")} を選ぶと押せます
        </p>
      )}
      {ownershipUnset && (
        <p className="mt-1.5 text-[11px] text-amber-700">
          所持状況が未入力です（全サポカ完凸で計算）
          <Link to="/support" className="ml-1 font-bold underline">
            入力する
          </Link>
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onConditions}
          className={`${BTN_SECONDARY} justify-center px-1`}
          title="タイプ割合・最低/最高ステ・SP率持ち・取得回数・試験補助など"
        >
          <Settings size={13} />
          探索の条件
        </button>
        <button
          type="button"
          onClick={onEditPlan}
          className={`${BTN_SECONDARY} justify-center px-1`}
          title="レッスン・授業（営業）・選抜の踏み方を編集"
        >
          <CalendarCheck size={13} />
          踏み方を編集
        </button>
        <button
          type="button"
          onClick={onEditCounts}
          className={`${BTN_SECONDARY} justify-center px-1`}
          title="育成パターンのアビリティ発動回数を調整"
        >
          <ListOrdered size={13} />
          発動回数
        </button>
      </div>
    </section>
  );
}

/** 分割メニュー（▾）の1項目 */
function MenuItem({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-slate-100"
    >
      <span className="block text-xs font-bold text-slate-800">{title}</span>
      <span className="block text-[11px] text-slate-500">{desc}</span>
    </button>
  );
}
