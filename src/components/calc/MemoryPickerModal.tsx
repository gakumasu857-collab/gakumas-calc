import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryLibrary from "@/components/memory-manager/MemoryLibrary";
import MemorySlot from "@/components/memory-manager/MemorySlot";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル（メモリーページへ移動しなくてよい）。
 * 作成・メモリーセットの保存はメモリーページで行うので、そこへの動線を
 * 初回（自分のメモリーが1枚も無いとき）は上に大きく、いつでも下のボタンに出す。
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
  // 自分で登録したメモリーがまだ無い（テンプレだけ）
  const noOwn = store.allMemories.every((m) => m.isTemplate);

  return (
    <Modal title="メモリーを選ぶ（4枚まで）" onClose={onClose} widthClass="max-w-4xl">
      {noOwn && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700">
          <span className="min-w-0 flex-1 leading-relaxed">
            <b className="text-blue-800">実際に持っているメモリーを登録すると、その値で計算できます。</b>
            まだ登録がないので、いまはテンプレ（メインパラボ◯点）で目安を出せます。
          </span>
          <Link to="/memory" className={BTN_SECONDARY}>
            <Plus size={13} />
            自分のメモリーを作る
          </Link>
        </div>
      )}
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
        <b className="text-slate-700">「メインパラボ◯点」（テンプレ）とは:</b> {GLOSSARY.mainParabo}
      </div>
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClose} className={BTN_PRIMARY}>
          この{store.selected.length}枚で決定
        </button>
        <Link
          to="/memory"
          className={BTN_SECONDARY}
          title="新しいメモリーの作成とメモリーセットの保存はメモリーページで行います"
        >
          <Plus size={13} />
          メモリーを作る・セットを保存（メモリーページ）
        </Link>
        <span className={NOTE}>作ったメモリーはこの一覧に出ます。</span>
      </div>
    </Modal>
  );
}
