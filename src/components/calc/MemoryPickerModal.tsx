import { Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import { BTN_PRIMARY, NOTE } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 汎用メモリー（メインパラボ60点）。ボタンで4枠すべてこれになる */
const TEMPLATE_ID = "tpl-role60";

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。中身は MemoryWorkbench
 * （枠をクリックして下で作る・保存は任意・保存したメモリー／セットから入れる）。
 * 実物が決まっていない人向けに「汎用メモリーを入れる」（メインパラボ60点×4）を目立つ枠で上に置き、
 * メインパラボが何かをその場で説明する。
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
      <p className="text-sm text-slate-700">
        育成の開始時に持ち込むメモリー4枚の設定です。枠をクリックして、下で中身を作れます（保存は任意）。
      </p>

      {/* 実物が決まっていない人の近道。何が入るかをここで分からせる */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <button
          type="button"
          onClick={() => store.fillSlots(TEMPLATE_ID)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-base font-bold text-white transition hover:bg-indigo-500"
        >
          <Sparkles size={16} />
          汎用メモリーを入れる
        </button>
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">
          <b className="text-slate-900">「メインパラボ60点」のメモリーが4枠すべてに入ります。</b>
          <br />
          メインパラボ＝パラボ+2.8%を、踏み方でパラボの母数（%が掛かるレッスン・選抜の獲得）が大きい上位2タイプに、
          残り1タイプに固定+20を付けるテンプレです。踏み方を変えると付け先も自動で変わります。実物のメモリーが決まっていないときの目安に。
        </div>
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
