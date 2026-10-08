import { useEffect, useState } from "react";
import { FolderInput, FolderPlus, Save } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY_LG, CHIP_OK, CHIP_WARN, NOTE } from "@/components/ui";
import type { ParaboAssign } from "@/lib/memoryTotals";
import { SLOT_SIZE } from "@/lib/memoryTypes";
import type { useMemoryStore } from "@/lib/useMemoryStore";
import MemoryLibraryModal from "./MemoryLibraryModal";
import MemorySetModal from "./MemorySetModal";
import MemorySlotList from "./MemorySlotList";
import SlotEditor from "./SlotEditor";

type Store = ReturnType<typeof useMemoryStore>;

/**
 * メモリーの作業台（計算ページの「メモリーを4枚選ぶ」の中身）。2026-10-08 に作り直し（オーナー要望）:
 * 左: 4枠を1枠1行で並べた一覧。行をクリックすると、その行のすぐ下に編集欄（アビリティ3行／メインパラボ）が開く
 * 右: メモリーセット（4枚まとめて保存・呼び出し・上書き。よく使う）
 * 保存したメモリー（1枚ずつ）は使う機会が少ないので作業台には出さず、編集欄の小さなボタン
 * 「一覧から選ぶ」（モーダル。選ぶ・✎で編集・削除）と「この中身を保存」にまとめる。
 */
export default function MemoryWorkbench({
  store,
  paraboAssign,
  focusKey = 0,
}: {
  store: Store;
  /** テンプレ（パラボ追従）を今の踏み方で展開するための割当 */
  paraboAssign: ParaboAssign;
  /** 増えるたびに「最初の空枠（無ければ枠1）」を開く */
  focusKey?: number;
}) {
  const firstEmpty = store.slots.findIndex((s) => !s);
  const [active, setActive] = useState<number>(firstEmpty === -1 ? 0 : firstEmpty);
  useEffect(() => {
    if (!focusKey) return;
    const empty = store.slots.findIndex((s) => !s);
    setActive(empty === -1 ? 0 : empty);
    // focusKey が増えたときだけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  const [setModal, setSetModal] = useState<"save" | "load" | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

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

  const value = store.slots[active] ?? null;
  const status = store.slotStatus(active);
  const sourceName = value?.sourceId ? store.findMemory(value.sourceId)?.skillName : undefined;
  const full = store.count === SLOT_SIZE;
  const ownSets = store.sets.filter((s) => !s.saveId).length;
  const activeSet = store.activeSet;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* 左: 4枠の一覧＋開いている枠の編集欄 */}
      <MemorySlotList
        memories={store.slotMemories}
        activeIndex={active}
        paraboAssign={paraboAssign}
        onSelect={setActive}
        onRemove={store.clearSlot}
      >
        <SlotEditor
          index={active}
          value={value}
          status={status}
          sourceName={sourceName}
          paraboAssign={paraboAssign}
          libraryCount={store.library.length}
          onChange={(next) => store.setSlot(active, next)}
          onClear={() => store.clearSlot(active)}
          onPickParabo={(id) => store.pickIntoSlot(active, id)}
          onSaveNew={() => store.saveSlot(active, "new")}
          onOverwrite={() => store.saveSlot(active, "overwrite")}
          duplicate={store.findDuplicate(active)}
          onUseDuplicate={() => {
            const dup = store.findDuplicate(active);
            if (dup) store.pickIntoSlot(active, dup.id);
          }}
          onOpenLibrary={() => setLibraryOpen(true)}
        />
      </MemorySlotList>

      {/* 右: メモリーセット */}
      <section className="flex w-full shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 lg:w-72">
        <h2 className="text-sm font-bold text-slate-900">
          メモリーセット
          <span className="ml-2 text-xs font-normal text-slate-500">4枚まとめて保存・呼び出し</span>
        </h2>
        {activeSet ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-800">
            <span className="min-w-0 truncate font-bold">「{activeSet.name}」</span>
            {store.activeSetModified ? (
              <span className={CHIP_WARN}>枠を変更中</span>
            ) : (
              <span className={CHIP_OK}>セットの通り</span>
            )}
          </p>
        ) : (
          <p className={NOTE}>今の4枚は、どのセットからも入れていません。</p>
        )}
        <div className="flex flex-col items-stretch gap-1.5">
          <button type="button" onClick={() => setSetModal("load")} className={BTN_SECONDARY_LG}>
            <FolderInput size={16} />
            保存したセットから入れる
            {ownSets > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {ownSets}
              </span>
            )}
          </button>
          {activeSet && store.activeSetModified && (
            <button
              type="button"
              onClick={() => store.overwriteSet(activeSet.id)}
              title="今の4枚で、このセットの中身を書き換えます"
              className={BTN_PRIMARY}
            >
              <Save size={15} />
              <span className="min-w-0 truncate">「{activeSet.name}」を上書き保存</span>
            </button>
          )}
          <button
            type="button"
            disabled={!full}
            onClick={() => setSetModal("save")}
            title={full ? "今の4枚を新しいメモリーセットとして保存します" : "4枚そろうと保存できます"}
            className={BTN_SECONDARY_LG}
          >
            <FolderPlus size={16} />
            新しいセットとして保存
          </button>
        </div>
        <p className={NOTE}>
          セットから入れたあとに枠を変えても、セットは変わりません（変えた4枚はこの育成のセーブデータに入ります）。セット自体を変えるときは「上書き保存」。
        </p>
      </section>

      {/* 保存したメモリー（1枚ずつ）の一覧。編集欄の「一覧から選ぶ」から */}
      {libraryOpen && (
        <MemoryLibraryModal
          store={store}
          activeIndex={active}
          onPick={(id) => {
            pick(id);
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {setModal && (
        <MemorySetModal
          mode={setModal}
          slots={store.slotMemories}
          sets={store.sets}
          activeSetId={activeSet?.id ?? null}
          onSave={store.saveSet}
          onApply={store.applySet}
          onDeleteSet={store.deleteSet}
          onRenameSet={store.renameSet}
          onClose={() => setSetModal(null)}
        />
      )}
    </div>
  );
}
