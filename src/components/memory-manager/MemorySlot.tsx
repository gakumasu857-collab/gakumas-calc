import { ATTR_STYLES, SLOT_SIZE, type Memory } from "@/lib/memoryTypes";
import { calcMemoryTotals, resolveParaboMemory } from "@/lib/memoryTotals";
import { useCalcResult } from "@/lib/useCalcResult";
import MemoryCard from "./MemoryCard";

type Props = {
  /** 4枠の中身（空枠は null） */
  memories: (Memory | null)[];
  /** いま編集中の枠 */
  activeIndex: number | null;
  /** 枠をクリック（編集する枠を選ぶ） */
  onSelect: (index: number) => void;
  /** ×で枠を空にする */
  onRemove: (index: number) => void;
};

/**
 * メモリースロット（4枠）。枠をクリックすると編集対象になり（青い枠線）、×で空にする。
 * 空の枠は「＋ クリックして設定」のボタン。
 */
export default function MemorySlot({ memories, activeIndex, onSelect, onRemove }: Props) {
  // パラボ追従メモリーは現在の踏み方から決まる割当（パラボ母数上位2タイプ）で展開して合計する
  const r = useCalcResult();
  const totals = calcMemoryTotals(
    memories.map((m) => (m ? resolveParaboMemory(m, r.paraboAssign) : undefined)),
  );
  const recoveryText = (["Vo", "Da", "Vi"] as const)
    .filter((t) => totals.回復[t] > 0)
    .map((t) => `${t}×${totals.回復[t]}`)
    .join(" ");
  const filled = memories.filter(Boolean).length;

  return (
    <section className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-bold text-slate-900">
        メモリースロット
        <span className="ml-2 text-xs font-normal text-slate-500">
          {filled}/{SLOT_SIZE}枚（枠をクリックすると中身を作れます・×で外す）
        </span>
      </h2>
      {/* 固定幅グリッドにして4枚とも同じ大きさに（幅が中身で変わらないように） */}
      <div className="grid w-104 max-w-full grid-cols-4 gap-2">
        {Array.from({ length: SLOT_SIZE }).map((_, i) => {
          const memory = memories[i];
          const active = i === activeIndex;
          return (
            <div
              key={i}
              className={`rounded-lg ${active ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
            >
              {memory ? (
                <MemoryCard
                  memory={memory}
                  onClick={() => onSelect(i)}
                  onRemoveSlot={() => onRemove(i)}
                  title={active ? "この枠を編集中" : "クリックで中身を編集"}
                />
              ) : (
                // MemoryCardと同じ行構成（ヘッダー行＋アビリティ3行）で高さを合わせる
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  title="クリックしてこの枠のメモリーを作る"
                  className={`flex w-full flex-col gap-1.5 rounded-lg border border-dashed p-1.5 text-left transition ${
                    active
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm font-bold ${
                        active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[10px] text-slate-400">未設定</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                    <span className="text-xl font-bold leading-none text-blue-500">＋</span>
                    <span className="text-[10px] font-semibold text-blue-600">
                      クリックして設定
                    </span>
                    <span className="h-3" />
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* タイプごとの合計（%と固定値は別表示） */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500">合計:</span>
        {(["Vo", "Da", "Vi"] as const).map((attr) => (
          <span
            key={attr}
            className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES[attr].chip}`}
          >
            {attr} +{totals[attr].percent}% / +{totals[attr].flat}
          </span>
        ))}
        <span
          className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES.P.chip}`}
        >
          P +{totals.P}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${ATTR_STYLES.回復.chip}`}
        >
          回復 {recoveryText || "なし"}
        </span>
      </div>
    </section>
  );
}
