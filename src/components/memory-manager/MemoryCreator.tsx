import { Plus } from "lucide-react";
import type { Memory } from "@/lib/memoryTypes";
import MemoryForm from "./MemoryForm";

type Props = {
  onAdd: (memory: Omit<Memory, "id" | "isTemplate">) => void;
};

/** メモリー作成フォーム（中身は MemoryForm。スロットの編集モーダルと共用） */
export default function MemoryCreator({ onAdd }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold text-slate-900">メモリー追加</h2>
      <MemoryForm
        submitLabel="メモリー追加"
        submitIcon={<Plus size={16} />}
        onSubmit={onAdd}
        resetAfterSubmit
      />
    </section>
  );
}
