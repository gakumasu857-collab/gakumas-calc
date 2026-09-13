import { useMemo, useState } from "react";
import { FolderInput, FolderPlus } from "lucide-react";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useMemoryStore } from "@/lib/useMemoryStore";
import MemoryLibrary from "./MemoryLibrary";
import MemorySetModal from "./MemorySetModal";
import MemorySlot from "./MemorySlot";
import SlotEditor from "./SlotEditor";

type Store = ReturnType<typeof useMemoryStore>;

const SET_BTN =
  "flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 sm:justify-start sm:px-5 sm:py-2.5";

/**
 * メモリーの作業台。メモリーページと計算ページのメモリー選択の両方で使う。
 * 上: スロット4枠（クリックで編集する枠を選ぶ）＋ セットの保存／呼び出し
 * 下: 左＝選んだ枠の編集枠（値を押すとそのまま入る。保存は任意）／右＝保存したメモリーの一覧（クリックで枠に入れる）
 * 操作の単位: アビリティ（編集枠）・メモリー（保存／一覧）・メモリーセット（4枚まとめて）。
 */
export default function MemoryWorkbench({ store }: { store: Store }) {
  const firstEmpty = store.slots.findIndex((s) => !s);
  const [active, setActive] = useState<number>(firstEmpty === -1 ? 0 : firstEmpty);
  const [setModal, setSetModal] = useState<"save" | "load" | null>(null);

  // 一覧のバッジ用: 保存元ID -> 枠に入っている枚数
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of store.slots) {
      if (s?.sourceId) counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    return counts;
  }, [store.slots]);

  /** 枠に入れたあと、次の空枠へ編集対象を進める（4枚続けて入れられるように） */
  const advance = (from: number) => {
    const after = store.slots.findIndex((s, i) => i > from && !s);
    if (after !== -1) return setActive(after);
    const any = store.slots.findIndex((s, i) => i !== from && !s);
    if (any !== -1) setActive(any);
  };
  const pick = (id: string) => {
    store.pickIntoSlot(active, id);
    advance(active);
  };
  /** 一覧の−: そのメモリーが入っている最後の枠を空にする */
  const removeOne = (id: string) => {
    const last = store.slots.map((s) => s?.sourceId).lastIndexOf(id);
    if (last !== -1) store.clearSlot(last);
  };

  const value = store.slots[active] ?? null;
  const status = store.slotStatus(active);
  const sourceName = value?.sourceId ? store.findMemory(value.sourceId)?.skillName : undefined;
  const full = store.count === SLOT_SIZE;
  const ownSets = store.sets.filter((s) => !s.saveId).length;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. スロット4枠＋メモリーセット */}
      <div className="flex flex-wrap items-stretch gap-3">
        <MemorySlot
          memories={store.slotMemories}
          activeIndex={active}
          onSelect={setActive}
          onRemove={store.clearSlot}
        />
        {/* セット操作: スマホでは横並び、sm以上は右寄せ縦積み */}
        <div className="flex w-full flex-row gap-2 sm:ml-auto sm:w-auto sm:flex-col sm:justify-center">
          <button
            type="button"
            disabled={!full}
            onClick={() => setSetModal("save")}
            title={full ? "今の4枚をメモリーセットとして保存します" : "4枚そろうと保存できます"}
            className={SET_BTN}
          >
            <FolderPlus size={18} />
            この4枚をセットとして保存
          </button>
          <button
            type="button"
            onClick={() => setSetModal("load")}
            className={SET_BTN}
          >
            <FolderInput size={18} />
            保存したセットから入れる
            {ownSets > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {ownSets}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. 選んだ枠の編集枠 ／ 3. 保存したメモリーの一覧 */}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <SlotEditor
          index={active}
          value={value}
          status={status}
          sourceName={sourceName}
          onChange={(next) => store.setSlot(active, next)}
          onClear={() => store.clearSlot(active)}
          onSaveNew={() => store.saveSlot(active, "new")}
          onOverwrite={() => store.saveSlot(active, "overwrite")}
        />
        <MemoryLibrary
          memories={store.allMemories}
          selectedCounts={selectedCounts}
          activeIndex={active}
          onSelect={pick}
          onRemoveOne={removeOne}
          onDelete={store.deleteMemory}
        />
      </div>

      {setModal && (
        <MemorySetModal
          mode={setModal}
          slots={store.slotMemories}
          sets={store.sets}
          onSave={store.saveSet}
          onApply={store.applySet}
          onDeleteSet={store.deleteSet}
          onClose={() => setSetModal(null)}
        />
      )}
    </div>
  );
}
