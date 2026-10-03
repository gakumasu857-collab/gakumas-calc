import { Check, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import { BTN_PRIMARY } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";
import { GENERIC_MEMORY_ID } from "@/lib/useMemoryStore";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 汎用メモリー（メインパラボ60点）。ボタンで4枠すべてこれになる（初めての人の4枠にも最初から入っている） */
const TEMPLATE_ID = GENERIC_MEMORY_ID;

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。中身は MemoryWorkbench
 * （枠をクリックして下で作る・保存は任意・保存したメモリー／セットから入れる）。
 * 「この4枚で決定」は見出しの下の固定バー（Modal の toolbar。中身をスクロールしても動かない。
 * 中身はその場で反映されるので、決定＝閉じる）。
 * 実物が決まっていない人向けの「汎用メモリーを入れる」（メインパラボ60点×4）は、
 * 一度でも探索したあとは出さない（showTemplate）。
 * 初めての人は最初から汎用メモリーが入っている（useMemoryStore）ので、入っている間は
 * ボタンの代わりに「今は汎用メモリーが入っています。変えたいときは枠をクリック」と書く
 * （これも一度探索したあとは出さない。オーナー指定 2026-10-03）。
 */
export default function MemoryPickerModal({
  r,
  onClose,
  showTemplate,
}: {
  r: CalcResult;
  onClose: () => void;
  /** 「汎用メモリーを入れる」と「今は汎用メモリーが入っています」の説明を出すか（初めて探索するまで） */
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
      {showTemplate && store.isGeneric ? (
        /* 最初から入っている汎用メモリーのままのとき（初めて探索するまで）: 何が入っているかと、変え方 */
        <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
          <b className="text-slate-900">
            今は汎用のメモリー（メインパラボ60点）が4枠すべてに入っています。
          </b>
          自分のメモリーに変えたいときは、変えたい枠をクリックして、下で中身を作ってください（このままでも探索できます）。
          メインパラボ＝パラボを効果が大きい上位2タイプに、残り1タイプに固定値を付けるテンプレで、踏み方を変えると付け先も自動で変わります。
        </div>
      ) : showTemplate && (
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
