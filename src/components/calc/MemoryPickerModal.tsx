import { useMemo } from "react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import MemoryLibrary from "@/components/memory-manager/MemoryLibrary";
import MemorySlot from "@/components/memory-manager/MemorySlot";
import { BTN_PRIMARY, NOTE } from "@/components/ui";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル（メモリーページへ移動しなくてよい）。
 * 作成・メモリーセットの保存はメモリーページで行う。
 */
export default function MemoryPickerModal({
  r,
  onClose,
}: {
  r: CalcResult;
  onClose: () => void;
}) {
  const store = r.memoryStore;
  const slotMemories = store.selected.map((id) => store.findMemory(id));
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of store.selected) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [store.selected]);

  return (
    <Modal title="メモリーを選ぶ（4枚まで）" onClose={onClose} widthClass="max-w-4xl">
      <MemorySlot memories={slotMemories} onRemove={store.deselectAt} />
      <div className="mt-3">
        <MemoryLibrary
          memories={store.allMemories}
          selectedCounts={selectedCounts}
          slotFull={store.selected.length >= SLOT_SIZE}
          onSelect={store.selectMemory}
          onRemoveOne={store.deselectOne}
          onDelete={store.deleteMemory}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className={BTN_PRIMARY}>
          この{store.selected.length}枚で決定
        </button>
        <span className={NOTE}>
          新しいメモリーの作成・メモリーセットの保存は{" "}
          <Link to="/memory" className="text-blue-600 underline">
            メモリーページ
          </Link>{" "}
          でできます。
        </span>
      </div>
    </Modal>
  );
}
