import { useState } from "react";
import { Save } from "lucide-react";
import Modal from "@/components/Modal";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import { sameMemoryContent, type Memory } from "@/lib/memoryTypes";
import MemoryEditor, { type MemoryEditorValue } from "./MemoryEditor";

/**
 * 保存したメモリーを一覧から直接編集するモーダル（枠に入れなくても変えられる）。
 * - 上書き保存: このメモリー自体を書き換える。枠に入れてある「変えていないコピー」も一緒に変わる
 * - 別のメモリーとして保存: 元は残して新しく保存する
 */
export default function LibraryEditModal({
  memory,
  onOverwrite,
  onSaveAsNew,
  onClose,
}: {
  memory: Memory;
  onOverwrite: (draft: MemoryEditorValue) => void;
  onSaveAsNew: (draft: MemoryEditorValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MemoryEditorValue>({
    plan: memory.plan,
    skillName: memory.skillName,
    abilities: memory.abilities,
  });
  const changed = !sameMemoryContent(draft, memory);
  const canSave = draft.abilities.length > 0;

  return (
    <Modal
      title={`保存したメモリーを編集: ${memory.skillName ?? memory.plan}`}
      onClose={onClose}
      widthClass="max-w-md"
    >
      <p className={`mb-3 ${NOTE}`}>
        「上書き保存」はこのメモリー自体を書き換えます（枠に入れてある同じ中身のものも一緒に変わります）。
        元を残したいときは「別のメモリーとして保存」。
      </p>
      <MemoryEditor value={draft} onChange={setDraft} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSave || !changed}
          title={!changed ? "まだ変えていません" : undefined}
          onClick={() => {
            onOverwrite(draft);
            onClose();
          }}
          className={BTN_PRIMARY}
        >
          <Save size={14} />
          上書き保存
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            onSaveAsNew(draft);
            onClose();
          }}
          className={BTN_SECONDARY}
        >
          別のメモリーとして保存
        </button>
      </div>
    </Modal>
  );
}
