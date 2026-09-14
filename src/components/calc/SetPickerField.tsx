import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { setPlanMatches, setVisibleInScenario } from "@/data/abilityCounts";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 一覧の表示位置（画面直付け。下に収まらなければ上向きに開く） */
type Pos = { left: number; top: number; width: number; maxHeight: number; up: boolean };

/**
 * プロデュース（アビリティ発動回数のセット）の選択欄。
 * ネイティブの select は他の欄と見た目がそろわないので、ボタン＋自前の一覧にしている。
 * 一覧はポータルで画面直付けにする（前提カードは overflow-hidden なので、中に置くと途中で切れて
 * 見えない・スクロールできない）。
 * Pアイドルを選んでいれば、そのプランで使えるもの（センス→センス・好調・集中、
 * ロジック→ロジック・好印象・やる気、アノマリー→アノマリー・全力・強気）だけ出す。
 */
export default function SetPickerField({ r }: { r: CalcResult }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const current = r.selectedSet;
  const plan = r.pMaster?.plan ?? null;
  const visible = r.ability.sets.filter(
    (set) => setVisibleInScenario(set.id, r.scenario) && setPlanMatches(set.plan, plan),
  );
  const normal = visible.filter((s) => !r.ability.saveIdOf(s.id));
  const saveSets = visible.filter((s) => r.ability.saveIdOf(s.id));

  /** 欄の位置から、画面内に収まる一覧の位置と高さを決める */
  const open = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const up = below < 240 && above > below;
    const maxHeight = Math.max(160, Math.min(360, up ? above : below));
    const width = Math.max(rect.width, 256);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    setPos({ left, top: up ? rect.top - 4 : rect.bottom + 4, width, maxHeight, up });
  };
  const close = () => setPos(null);

  // 開いている間にページがスクロール／リサイズされたら閉じる（位置がずれるため）
  useEffect(() => {
    if (!pos) return;
    const onMove = () => setPos(null);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [pos]);

  const pick = (id: string) => {
    if (id !== r.ability.selectedSetId) r.ability.selectSet(id);
    close();
  };
  const group = (label: string, list: typeof visible) =>
    list.length > 0 && (
      <div>
        <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold text-slate-400">{label}</p>
        {list.map((set) => {
          const on = set.id === r.ability.selectedSetId;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => pick(set.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                on ? "bg-blue-50 text-blue-800" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {set.plan && (
                <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-600">
                  {set.plan}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{set.name}</span>
              {on && <Check size={14} className="shrink-0 text-blue-600" />}
            </button>
          );
        })}
      </div>
    );

  return (
    <span className="relative block">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (pos ? close() : open())}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm text-slate-900 transition ${
          current
            ? "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
            : "border-amber-400 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        {current ? (
          <>
            {current.plan && (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600">
                {current.plan}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{current.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-bold text-amber-700">
            選んでください
          </span>
        )}
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>
      {pos &&
        createPortal(
          <>
            {/* 外側クリックで閉じる */}
            <span className="fixed inset-0 z-40" onClick={close} />
            <div
              className="fixed z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                maxHeight: pos.maxHeight,
                transform: pos.up ? "translateY(-100%)" : undefined,
              }}
            >
              {visible.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500">
                  このシナリオ{plan ? `・${plan}` : ""}で使えるプロデュースがありません（プロデュース設定ページで作れます）
                </p>
              ) : (
                <>
                  {group("プロデュース（テンプレ）", normal)}
                  {group("セーブデータ用", saveSets)}
                </>
              )}
              <p className="border-t border-slate-100 px-2 pb-1 pt-1.5 text-[10px] text-slate-400">
                {plan
                  ? `Pアイドルのプラン「${plan}」で使えるものだけ表示しています`
                  : "アイドルを選ぶと、そのプランで使えるものだけになります"}
              </p>
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}
