import {
  ATTR_STYLES,
  SLOT_SIZE,
  type Memory,
} from "@/lib/memoryTypes";
import { calcMemoryTotals, resolveParaboMemory } from "@/lib/memoryTotals";
import { useCalcResult } from "@/lib/useCalcResult";
import MemoryCard from "./MemoryCard";

type Props = {
  /** スロット内のメモリー（selected のIDを解決済み） */
  memories: (Memory | undefined)[];
  onRemove: (index: number) => void;
};

/** 画面左上のスロット。4枠に選択中メモリーを表示し、クリックで解除。 */
export default function MemorySlot({ memories, onRemove }: Props) {
  // パラボ追従メモリーは現在の踏み方から決まる割当（パラボ母数上位2タイプ）で展開して合計する
  const r = useCalcResult();
  const totals = calcMemoryTotals(
    memories.map((m) => m && resolveParaboMemory(m, r.paraboAssign)),
  );
  const recoveryText = (["Vo", "Da", "Vi"] as const)
    .filter((t) => totals.回復[t] > 0)
    .map((t) => `${t}×${totals.回復[t]}`)
    .join(" ");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-bold text-slate-900">
        メモリースロット
        <span className="ml-2 text-xs font-normal text-slate-500">
          {memories.filter(Boolean).length}/{SLOT_SIZE}枚（クリックで解除）
        </span>
      </h2>
      {/* 固定幅グリッドにして4枚とも同じ大きさに（幅が中身で変わらないように） */}
      <div className="grid w-104 max-w-full grid-cols-4 gap-2">
        {Array.from({ length: SLOT_SIZE }).map((_, i) => {
          const memory = memories[i];
          return (
            <div key={i}>
              {memory ? (
                <MemoryCard memory={memory} onClick={() => onRemove(i)} />
              ) : (
                // MemoryCardと同じ行構成（ヘッダー行＋アビリティ3行）で高さを合わせる
                <div className="flex w-full flex-col gap-1.5 rounded-lg border border-dashed border-slate-300 p-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-sm font-bold text-slate-300">
                      {i + 1}
                    </span>
                    <span className="text-[10px] text-slate-300">未選択</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="h-4.5" />
                    <span className="h-4.5" />
                    <span className="h-4.5" />
                  </div>
                </div>
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
