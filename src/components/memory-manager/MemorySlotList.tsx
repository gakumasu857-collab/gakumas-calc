import { ChevronDown, X } from "lucide-react";
import { ATTR_STYLES, SLOT_SIZE, type Memory } from "@/lib/memoryTypes";
import { calcMemoryTotals, resolveParaboMemory, type ParaboAssign } from "@/lib/memoryTotals";
import MemoryLine from "./MemoryLine";

/**
 * メモリーの4枠を上から並べた一覧（2026-10-08 に、縦長のカード4枚から「1枠1行」に作り直し。
 * オーナー「カード型でなくていい。もっと見やすい見方があればそれがいい」）。
 * 行をクリックすると、その行のすぐ下に編集欄（children）が開く。×で空にする。下に4枚の合計。
 */
export default function MemorySlotList({
  memories,
  activeIndex,
  paraboAssign,
  onSelect,
  onRemove,
  children,
}: {
  /** 4枠の中身（空枠は null） */
  memories: (Memory | null)[];
  /** いま開いている枠 */
  activeIndex: number;
  /** テンプレ（パラボ追従）を今の踏み方で展開するための割当 */
  paraboAssign: ParaboAssign;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  /** 開いている枠の編集欄 */
  children: React.ReactNode;
}) {
  // パラボ追従メモリーは現在の踏み方から決まる割当（パラボ母数上位2タイプ）で展開して合計する
  const totals = calcMemoryTotals(
    memories.map((m) => (m ? resolveParaboMemory(m, paraboAssign) : undefined)),
  );
  const recoveryText = (["Vo", "Da", "Vi"] as const)
    .filter((t) => totals.回復[t] > 0)
    .map((t) => `${t}×${totals.回復[t]}`)
    .join(" ");
  const filled = memories.filter(Boolean).length;

  return (
    <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h2 className="mb-2 text-sm font-bold text-slate-900">
        メモリー
        <span className="ml-2 text-xs font-normal text-slate-500">
          {filled}/{SLOT_SIZE}枚。行をクリックすると、その下で中身を変えられます
        </span>
      </h2>
      <ol className="flex flex-col gap-1.5">
        {Array.from({ length: SLOT_SIZE }).map((_, i) => {
          const memory = memories[i];
          const active = i === activeIndex;
          return (
            <li
              key={i}
              className={`rounded-lg border ${
                active ? "border-blue-400 bg-blue-50/40" : "border-slate-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center gap-1 pr-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  title={active ? "この枠を編集中" : "クリックで中身を変える"}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      active
                        ? "bg-blue-600 text-white"
                        : memory
                          ? "bg-slate-200 text-slate-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {memory ? (
                    <MemoryLine memory={memory} paraboAssign={paraboAssign} />
                  ) : (
                    <span className="text-xs text-slate-400">空き（クリックして入れる）</span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`ml-auto shrink-0 text-slate-400 transition ${active ? "rotate-180" : ""}`}
                  />
                </button>
                {memory && (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    aria-label="この枠を空にする"
                    title="この枠を空にする"
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {active && <div className="border-t border-blue-200 px-3 py-3">{children}</div>}
            </li>
          );
        })}
      </ol>

      {/* タイプごとの合計（%と固定値は別表示） */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500">4枚の合計:</span>
        {(["Vo", "Da", "Vi"] as const).map((attr) => (
          <span
            key={attr}
            className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES[attr].chip}`}
          >
            {attr} +{totals[attr].percent}% / +{totals[attr].flat}
          </span>
        ))}
        <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES.P.chip}`}>
          P +{totals.P}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES.回復.chip}`}>
          回復 {recoveryText || "なし"}
        </span>
      </div>
    </section>
  );
}
