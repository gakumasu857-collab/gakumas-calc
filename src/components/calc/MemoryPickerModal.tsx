import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Wand2 } from "lucide-react";
import Modal from "@/components/Modal";
import MemoryLibrary from "@/components/memory-manager/MemoryLibrary";
import MemorySlot from "@/components/memory-manager/MemorySlot";
import Hint from "@/components/Hint";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 目安のテンプレ（メインパラボ60点）を4枚 */
const TEMPLATE_FILL = ["tpl-role60", "tpl-role60", "tpl-role60", "tpl-role60"];

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。
 * 説明は1行にして、道を2つ（A: 自分のメモリーを登録して選ぶ／B: 未定なら目安のテンプレを1クリックで4枚）
 * 大きく見せる。長い説明は ⓘ に寄せる。作成・セット保存はメモリーページ。
 */
export default function MemoryPickerModal({
  r,
  onClose,
}: {
  r: CalcResult;
  onClose: () => void;
}) {
  const store = r.memoryStore;
  const slotMemories = store.selected.map((id) => store.findMemory(id));
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of store.selected) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [store.selected]);
  // 自分で登録したメモリーがまだ無い（テンプレだけ）
  const noOwn = store.allMemories.every((m) => m.isTemplate);

  return (
    <Modal title="メモリーを4枚選ぶ" onClose={onClose} widthClass="max-w-4xl">
      <p className="text-sm text-slate-700">
        育成の開始時に持ち込むメモリー4枚です。
        <b>固定ステータスとパラメータボーナス%</b>が評価値に大きく効きます。
      </p>

      {/* 2つの道 */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] text-white">A</span>
            持っているメモリーで計算する
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            メモリーページで登録すると、下の一覧に出て選べます。
            {noOwn && <b className="text-amber-700">（まだ登録がありません）</b>}
          </p>
          <Link to="/memory" className={`${BTN_SECONDARY} self-start`}>
            <Plus size={13} />
            自分のメモリーを登録する
          </Link>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] text-white">B</span>
            まだ決まっていない → 目安のテンプレ
          </p>
          <p className="flex flex-wrap items-center gap-1 text-xs leading-relaxed text-slate-600">
            「メインパラボ60点」＝ パラボ+2.8%が上位2タイプ、残りの1タイプは固定+20 の想定
            <Hint text={GLOSSARY.mainParabo} />
          </p>
          <button
            type="button"
            onClick={() => store.setSelection(TEMPLATE_FILL)}
            className={`${BTN_PRIMARY} self-start`}
          >
            <Wand2 size={14} />
            メインパラボ60点 ×4枚を入れる
          </button>
        </div>
      </div>

      <div className="mt-3">
        <MemorySlot memories={slotMemories} onRemove={store.deselectAt} />
      </div>
      <div className="mt-3">
        <MemoryLibrary
          memories={store.allMemories}
          selectedCounts={selectedCounts}
          slotFull={store.selected.length >= SLOT_SIZE}
          onSelect={store.selectMemory}
          onRemoveOne={store.deselectOne}
          onDelete={store.deleteMemory}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className={BTN_PRIMARY}>
          この{store.selected.length}枚で決定
        </button>
        <span className={NOTE}>一覧のカードをクリックで追加、−で外せます。</span>
      </div>
    </Modal>
  );
}
