import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import Hint from "@/components/Hint";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 目安のテンプレ（メインパラボ60点）。ボタンで4枠すべてこれになる */
const TEMPLATE_ID = "tpl-role60";

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。中身は MemoryWorkbench
 * （枠をクリックして下で作る・保存は任意・保存したメモリー／セットから入れる）。
 * 実物が決まっていない人向けに「汎用のメモリーを入れる」（メインパラボ60点×4）を常に置く。
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
    <Modal title="メモリーを4枚選ぶ" onClose={onClose} widthClass="max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-slate-700">
          育成の開始時に持ち込むメモリー4枚の設定です。枠をクリックして、下で中身を作れます（保存は任意）。
        </p>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => store.fillSlots(TEMPLATE_ID)}
            title="メインパラボ60点のテンプレを4枠すべてに入れます（実物が決まっていないときの目安）"
            className={BTN_SECONDARY}
          >
            汎用のメモリーを入れる
          </button>
          <Hint text={GLOSSARY.mainParabo} />
        </span>
      </div>

      <div className="mt-3">
        <MemoryWorkbench store={store} paraboAssign={r.paraboAssign} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className={BTN_PRIMARY}>
          この{store.count}枚で決定
        </button>
        <span className={NOTE}>
          保存したメモリーは一覧から、4枚そろえばセットとしても保存できます。
        </span>
      </div>
    </Modal>
  );
}
