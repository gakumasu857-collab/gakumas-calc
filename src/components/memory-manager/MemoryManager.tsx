import { useMemo, useState } from "react";
import { FolderInput, FolderPlus } from "lucide-react";
import { useMemoryStore } from "@/lib/useMemoryStore";
import MemoryCreator from "./MemoryCreator";
import MemoryEditModal from "./MemoryEditModal";
import MemoryLibrary from "./MemoryLibrary";
import MemorySetModal from "./MemorySetModal";
import MemorySlot from "./MemorySlot";
import { SLOT_SIZE } from "@/lib/memoryTypes";

/** メモリー設定画面全体。レイアウト・状態・モーダルを管理する。 */
export default function MemoryManager() {
  const store = useMemoryStore();
  const [setModal, setSetModal] = useState<"create" | "load" | null>(null);
  /** スロットのどの枠を編集中か */
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // スロット表示用にIDをメモリー本体へ解決
  const slotMemories = store.selected.map((id) => store.findMemory(id));

  // ライブラリのバッジ用: id -> 選択枚数
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of store.selected) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [store.selected]);

  return (
    // モバイルは スロット → 作成フォーム → ライブラリ の順（orderで制御）。
    // lg以上は 左カラム(作成フォーム) / 右カラム(スロット+ライブラリ) の2カラム
    // （作成フォームを左に置いて「まず追加する」動線を先に見せる）。
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_1fr] lg:items-start">
      {/* 左カラム: 作成フォーム（モバイルではスロットの直後） */}
      <div className="order-2 lg:order-0">
        <MemoryCreator onAdd={store.addMemory} />
      </div>

      {/* 右カラム（スロット＋ライブラリ）: モバイルでは contents で解体して order を効かせる */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        {/* items-stretch でボタン列をスロット枠と同じ高さに伸ばし、flex-1で半分ずつ分ける */}
        <div className="order-1 flex flex-wrap items-stretch gap-3 lg:order-0">
          <MemorySlot memories={slotMemories} onRemove={store.deselectAt} onEdit={setEditIndex} />
          {/* メモリーセット操作: スマホでは横並び、sm以上は右寄せ縦積み（2つでスロットと同じ高さ） */}
          <div className="flex w-full flex-row gap-2 sm:ml-auto sm:min-h-40 sm:w-auto sm:flex-col">
            <button
              type="button"
              onClick={() => setSetModal("create")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 sm:justify-start sm:px-5 sm:py-0"
            >
              <FolderPlus size={18} />
              メモリーセットを作成
            </button>
            <button
              type="button"
              onClick={() => setSetModal("load")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 sm:justify-start sm:px-5 sm:py-0"
            >
              <FolderInput size={18} />
              メモリーセットから選択
            </button>
          </div>
        </div>

        {/* モバイルでは作成フォーム(order-2)の後ろに回す */}
        <div className="order-3 lg:order-0">
          <MemoryLibrary
            memories={store.allMemories}
            selectedCounts={selectedCounts}
            slotFull={store.selected.length >= SLOT_SIZE}
            onSelect={store.selectMemory}
            onRemoveOne={store.deselectOne}
            onDelete={store.deleteMemory}
          />
        </div>
      </div>

      {/* スロットのメモリーをその場で編集（アビリティ単位）。更新か、別メモリーとして保存して差し替え */}
      {editIndex !== null && slotMemories[editIndex] && (
        <MemoryEditModal
          memory={slotMemories[editIndex]!}
          onUpdate={(draft) => store.updateMemory(slotMemories[editIndex]!.id, draft)}
          onSaveAsNew={(draft) => store.replaceSelectionAt(editIndex, store.addMemory(draft))}
          onClose={() => setEditIndex(null)}
        />
      )}

      {setModal && (
        <MemorySetModal
          mode={setModal}
          memories={store.allMemories}
          sets={store.sets}
          findMemory={store.findMemory}
          onSave={store.addSet}
          onApply={store.applySet}
          onDeleteSet={store.deleteSet}
          onClose={() => setSetModal(null)}
        />
      )}
    </div>
  );
}
