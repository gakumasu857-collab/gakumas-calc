import { Check } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import { BTN_PRIMARY } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。中身は MemoryWorkbench
 * （4枠の一覧と、行をクリックして開く編集欄・メモリーセット）。
 * 「この4枚で決定」は見出しの下の固定バー（Modal の toolbar。中身をスクロールしても動かない。
 * 中身はその場で反映されるので、決定＝閉じる）。
 * 初めての人向けの「汎用メモリーを入れる」の枠と汎用メモリーの説明は 2026-10-08 にやめた（オーナー「いらない」。
 * 汎用メモリーは枠を開いて「汎用メモリーにする」で入れる）。
 */
export default function MemoryPickerModal({
  r,
  onClose,
}: {
  r: CalcResult;
  onClose: () => void;
}) {
  const store = r.memoryStore;
  return (
    <Modal
      title="メモリーを4枚選ぶ"
      onClose={onClose}
      widthClass="max-w-5xl"
      toolbar={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            育成の開始時に持ち込むメモリー4枚。行をクリックすると、その場で中身を変えられます（保存は任意）。
          </p>
          <button type="button" onClick={onClose} className={BTN_PRIMARY}>
            <Check size={15} />
            この{store.count}枚で決定
          </button>
        </div>
      }
    >
      <MemoryWorkbench store={store} paraboAssign={r.paraboAssign} />
    </Modal>
  );
}
