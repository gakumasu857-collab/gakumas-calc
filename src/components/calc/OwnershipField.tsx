import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { writeOwnershipAck } from "@/lib/ownershipAck";
import type { useCalcResult } from "@/lib/useCalcResult";
import { BUILTIN_ALL4, BUILTIN_ID, useOwnedSaves } from "@/lib/useOwnedSaves";

/** 一覧の表示位置（画面直付け。下に収まらなければ上向きに開く） */
type Pos = { left: number; top: number; width: number; maxHeight: number; up: boolean };

/**
 * 設定欄の「所持状況」の欄。使う所持状況（既定＝全サポカ完凸／保存してある所持状況）を切り替える。
 * 見た目はほかの欄と同じ（プロデュースの欄と同じ作り。一覧はポータルで画面直付け）。
 * 切り替えは所持状況ページの「使う所持状況」と同じ動き（使用中を替えてから、その内容を所持ストアへ読み込む）。
 * 一覧の一番下から所持状況ページ（入力・編集）へ行ける。
 * 何かを選んだ時点で「決めた」扱い（ownershipAck）になり、黄色が消える。
 */
export default function OwnershipField({
  r,
  decided,
  onDecided,
}: {
  r: ReturnType<typeof useCalcResult>;
  /** 一度でも決めたか（既定のままでよいと選んだ／自分の所持状況を使っている／所持状況ページを開いた） */
  decided: boolean;
  onDecided: () => void;
}) {
  const owned = useOwnedSaves();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const builtin = owned.activeId === BUILTIN_ID;
  const current = owned.saves.find((s) => s.id === owned.activeId);
  const label = builtin ? "全サポカ完凸（既定）" : (current?.name ?? "自分の所持状況");

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

  /** 使う所持状況を切り替える（所持状況ページの switchTo と同じ手順） */
  const pick = (id: string) => {
    close();
    writeOwnershipAck();
    onDecided();
    if (id !== owned.activeId) {
      const target = id === BUILTIN_ID ? BUILTIN_ALL4 : owned.saves.find((s) => s.id === id);
      if (!target) return;
      // 先に使用中を切り替えてから読み込む（読み込み直後の自動保存が新しい先へ向くように）
      owned.setActiveSlot(id);
      r.ownedLevels.replaceAll(target.levels, target.cardCount);
      if (target.pIdols) r.pIdols.replaceAll(target.pIdols, target.pIdolCount);
    }
  };

  const items = [
    { id: BUILTIN_ID, name: "全サポカ完凸（既定）", note: "持っていないサポカも完凸で入れる想定" },
    ...owned.saves.map((s) => ({
      id: s.id,
      name: s.name,
      note: s.saveId ? "セーブデータ用" : undefined,
    })),
  ];

  return (
    <span className="relative block">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (pos ? close() : open())}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm text-slate-900 transition ${
          decided
            ? "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
            : "border-amber-400 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${decided ? "" : "font-bold text-amber-700"}`}>
          {label}
        </span>
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
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold text-slate-400">使う所持状況</p>
              {items.map((item) => {
                const on = item.id === owned.activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      on ? "bg-blue-50 text-blue-800" : "text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                      {item.note && (
                        <span className="ml-1.5 text-[11px] text-slate-400">{item.note}</span>
                      )}
                    </span>
                    {on && <Check size={14} className="shrink-0 text-blue-600" />}
                  </button>
                );
              })}
              <Link
                to="/support"
                onClick={close}
                className="mt-1 flex items-center gap-1.5 rounded-md border-t border-slate-100 px-2 pb-1.5 pt-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Pencil size={13} />
                自分の所持状況を入力・編集（所持状況ページ）
              </Link>
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}
