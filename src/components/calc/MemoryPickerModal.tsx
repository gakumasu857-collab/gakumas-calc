import { Check, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import { BTN_PRIMARY } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 汎用メモリー（メインパラボ60点）。ボタンで4枠すべてこれになる */
const TEMPLATE_ID = "tpl-role60";

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。中身は MemoryWorkbench
 * （枠をクリックして下で作る・保存は任意・保存したメモリー／セットから入れる）。
 * 「この4枚で決定」は見出しの下の固定バー（Modal の toolbar。中身をスクロールしても動かない。
 * 中身はその場で反映されるので、決定＝閉じる）。
 * 実物が決まっていない人向けの「汎用メモリーを入れる」（メインパラボ60点×4）は、
 * 一度でも探索したあとは出さない（showTemplate）。
 */
export default function MemoryPickerModal({
  r,
  onClose,
  showTemplate,
}: {
  r: CalcResult;
  onClose: () => void;
  /** 「汎用メモリーを入れる」を出すか（初めて探索するまで） */
  showTemplate: boolean;
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
            育成の開始時に持ち込むメモリー4枚。枠をクリックして、下で中身を作れます（保存は任意）。
          </p>
          <button type="button" onClick={onClose} className={BTN_PRIMARY}>
            <Check size={15} />
            この{store.count}枚で決定
          </button>
        </div>
      }
    >
      {showTemplate && (
        /* 実物が決まっていない人の近道。何が入るかをここで分からせる */
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
          <button
            type="button"
            onClick={() => store.fillSlots(TEMPLATE_ID)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <Sparkles size={14} />
            汎用メモリーを入れる
          </button>
          <div className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
            <b className="text-slate-900">「メインパラボ60点」のメモリーが4枠すべてに入ります。</b>
            メインパラボ＝パラボを踏み方でパラボの効果が大きい上位2タイプに、
            残り1タイプに固定値を付けるテンプレです。踏み方を変えると付け先も自動で変わるのが便利です。
          </div>
        </div>
      )}

      <MemoryWorkbench store={store} paraboAssign={r.paraboAssign} />
    </Modal>
  );
}
