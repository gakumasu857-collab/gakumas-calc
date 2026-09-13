import Modal from "@/components/Modal";
import type { Memory } from "@/lib/memoryTypes";
import MemoryForm, { type MemoryDraft } from "./MemoryForm";

/**
 * スロットに入っているメモリーを、その場で編集するモーダル（アビリティ単位の変更用）。
 * - 「この内容で更新」: ライブラリのメモリー自体を書き換える。同じメモリーを使っている
 *   他のスロット・メモリーセットにもそのまま反映される（実物のメモリーが変わったとき向け）
 * - 「別のメモリーとして保存して差し替え」: 元は残し、新しいメモリーを作ってこの枠だけ差し替える
 *   （「ここだけ変えたらどうなる？」を試すとき向け）
 */
export default function MemoryEditModal({
  memory,
  onUpdate,
  onSaveAsNew,
  onClose,
}: {
  memory: Memory;
  onUpdate: (draft: MemoryDraft) => void;
  onSaveAsNew: (draft: MemoryDraft) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`メモリーを編集: ${memory.skillName ?? memory.plan}`}
      onClose={onClose}
      widthClass="max-w-md"
    >
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        値のボタンを押すと、その属性だけ置き換わります（同じ値をもう一度押すと外れます）。
        <b className="text-slate-700">「この内容で更新」</b>
        はこのメモリー自体を書き換えるので、同じメモリーを使っている他の枠やメモリーセットにも反映されます。
        元を残したいときは<b className="text-slate-700">「別のメモリーとして保存して差し替え」</b>。
      </p>
      <MemoryForm
        initial={{
          plan: memory.plan,
          skillName: memory.skillName,
          abilities: memory.abilities,
        }}
        submitLabel="この内容で更新"
        onSubmit={(draft) => {
          onUpdate(draft);
          onClose();
        }}
        secondaryLabel="別のメモリーとして保存して差し替え"
        onSecondary={(draft) => {
          onSaveAsNew(draft);
          onClose();
        }}
      />
    </Modal>
  );
}
