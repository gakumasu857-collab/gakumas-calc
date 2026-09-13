import { useMemo } from "react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import MemoryLibrary from "@/components/memory-manager/MemoryLibrary";
import MemorySlot from "@/components/memory-manager/MemorySlot";
import Hint from "@/components/Hint";
import { BTN_PRIMARY, NOTE } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 目安のテンプレ（メインパラボ60点）を4枚 */
const TEMPLATE_FILL = ["tpl-role60", "tpl-role60", "tpl-role60", "tpl-role60"];

const TILE =
  "block cursor-pointer rounded-xl border border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-400 hover:bg-blue-100";
const BADGE = "mb-1 inline-block rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white";

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。
 * まだ何も選んでおらず自分のメモリーも無いときだけ、道を2つ（A: メモリーページで登録する／
 * B: 目安のテンプレを4枚入れる）押せる枠で見せる。どちらかを押したら枠は消える。
 * 長い説明は ⓘ に寄せる。作成・セット保存はメモリーページ。
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
  const showPaths = store.selected.length === 0 && noOwn;
  const fillTemplate = () => store.setSelection(TEMPLATE_FILL);

  return (
    <Modal title="メモリーを4枚選ぶ" onClose={onClose} widthClass="max-w-4xl">
      <p className="text-sm text-slate-700">
        育成の開始時に持ち込むメモリー4枚の設定です。
      </p>

      {showPaths && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link to="/memory" className={TILE}>
            <span className={BADGE}>A</span>
            <span className="block text-sm font-bold text-slate-800">
              持っているメモリーを登録して使う
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              自分のメモリーを入力できます（メモリーページで登録）
            </span>
          </Link>
          <div
            role="button"
            tabIndex={0}
            onClick={fillTemplate}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fillTemplate();
              }
            }}
            className={TILE}
          >
            <span className={BADGE}>B</span>
            <span className="block text-sm font-bold text-slate-800">
              汎用のメモリーを入れる
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              メインのタイプがパラボの60点のテンプレメモリー
              <Hint text={GLOSSARY.mainParabo} />
            </span>
          </div>
        </div>
      )}

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
        <span className={NOTE}>
          一覧のカードをクリックで追加、−で外せます。登録・セット保存は{" "}
          <Link to="/memory" className="text-blue-600 underline">
            メモリーページ
          </Link>
          。
        </span>
      </div>
    </Modal>
  );
}
