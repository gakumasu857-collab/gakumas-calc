import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { NOTE } from "@/components/ui";
import type { useMemoryStore } from "@/lib/useMemoryStore";
import LibraryEditModal from "./LibraryEditModal";
import MemoryLibrary from "./MemoryLibrary";

type Store = ReturnType<typeof useMemoryStore>;

/**
 * 保存したメモリー（1枚ずつ）の一覧をモーダルで出す（枠の「一覧から選ぶ」から。2026-10-07）。
 * 使う機会が少ないので作業台には出さず、使うときは今まで通り選ぶ・✎で編集・削除モードで消せる。
 */
export default function MemoryLibraryModal({
  store,
  activeIndex,
  onPick,
  onClose,
}: {
  store: Store;
  /** 入れる先の枠 */
  activeIndex: number;
  /** 一覧のカードをクリック（枠に入れて閉じる） */
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  /** 一覧の✎で直接編集している保存済みメモリー */
  const [editId, setEditId] = useState<string | null>(null);

  // 一覧のバッジ用: 保存元ID -> 枠に入っている枚数
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of store.slots) {
      if (s?.sourceId) counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    return counts;
  }, [store.slots]);

  return (
    <Modal
      title={`保存したメモリー（枠${activeIndex + 1} に入れる）`}
      onClose={onClose}
      widthClass="max-w-4xl"
    >
      <p className={`mb-3 ${NOTE}`}>
        「枠{activeIndex + 1}に入れる」でその枠に入ります。✎で中身を編集、ゴミ箱で消せます。保存するのは、枠の中身を作って「この中身を保存」。
      </p>
      <MemoryLibrary
        memories={store.library}
        selectedCounts={selectedCounts}
        activeIndex={activeIndex}
        onSelect={onPick}
        onDelete={store.deleteMemory}
        onEdit={setEditId}
      />

      {/* 保存したメモリーを一覧から直接編集（枠に入れなくてよい） */}
      {editId && store.findMemory(editId) && (
        <LibraryEditModal
          memory={store.findMemory(editId)!}
          onOverwrite={(draft) => store.updateMemory(editId, draft)}
          onSaveAsNew={(draft) => store.addMemory(draft)}
          onClose={() => setEditId(null)}
        />
      )}
    </Modal>
  );
}
