import { NOTE } from "@/components/ui";
import { useMemoryStore } from "@/lib/useMemoryStore";
import MemoryWorkbench from "./MemoryWorkbench";

/** メモリー設定ページ。中身は MemoryWorkbench（計算ページのメモリー選択と同じ作業台） */
export default function MemoryManager() {
  const store = useMemoryStore();
  return (
    <div className="flex flex-col gap-3">
      <p className={NOTE}>
        枠をクリック → 値のボタンで中身を作る（保存は任意）→ 4枚そろったらセットとして保存（任意）。
        保存したメモリーは一覧から、保存したセットは「保存したセットから入れる」で何度でも使えます。
      </p>
      <MemoryWorkbench store={store} />
    </div>
  );
}
