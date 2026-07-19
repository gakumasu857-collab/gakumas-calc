import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  PLAN_LIST,
  SLOT_SIZE,
  type Memory,
  type MemorySet,
  type PlanKey,
} from "@/lib/memoryTypes";
import MemoryCard from "./MemoryCard";
import Modal from "@/components/Modal";

type Props = {
  mode: "create" | "load";
  memories: Memory[];
  sets: MemorySet[];
  findMemory: (id: string) => Memory | undefined;
  onSave: (name: string, memoryIds: string[]) => void;
  onApply: (set: MemorySet) => void;
  onDeleteSet: (id: string) => void;
  onClose: () => void;
};

/** メモリーセットの作成（create）と呼び出し（load）を行うモーダル。 */
export default function MemorySetModal({
  mode,
  memories,
  sets,
  findMemory,
  onSave,
  onApply,
  onDeleteSet,
  onClose,
}: Props) {
  return mode === "create" ? (
    <CreateView memories={memories} onSave={onSave} onClose={onClose} />
  ) : (
    <LoadView
      sets={sets}
      findMemory={findMemory}
      onApply={onApply}
      onDeleteSet={onDeleteSet}
      onClose={onClose}
    />
  );
}

function CreateView({
  memories,
  onSave,
  onClose,
}: {
  memories: Memory[];
  onSave: (name: string, memoryIds: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [planFilter, setPlanFilter] = useState<PlanKey | "すべて">("すべて");

  const visible = useMemo(
    () =>
      planFilter === "すべて"
        ? memories
        : memories.filter((m) => m.plan === planFilter),
    [memories, planFilter],
  );

  // 4枚選べば保存可能（名前は未入力なら自動命名）
  const canSave = picked.length === SLOT_SIZE;

  return (
    <Modal title="メモリーセットを作成" onClose={onClose}>
      {/* 名前入力欄 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="セット名（未入力なら自動で命名されます）"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
      />

      {/* 選択中プレビュー */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">
          選択中 {picked.length}/{SLOT_SIZE}:
        </span>
        <div className="flex gap-1.5">
          {picked.map((id, i) => (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() =>
                setPicked((prev) => prev.filter((_, idx) => idx !== i))
              }
              className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200"
              title="クリックで外す"
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* プラン簡易フィルター */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(["すべて", ...PLAN_LIST] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlanFilter(p)}
            className={`rounded-md border px-2 py-0.5 text-xs transition ${
              planFilter === p
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* フィルター済みメモリー一覧（スクロール可） */}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 p-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {visible.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              disabled={picked.length >= SLOT_SIZE}
              selectedCount={picked.filter((id) => id === memory.id).length}
              onClick={() => setPicked((prev) => [...prev, memory.id])}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!canSave}
        onClick={() => {
          onSave(name.trim(), picked);
          onClose();
        }}
        className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-bold transition ${
          canSave
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "cursor-not-allowed bg-slate-100 text-slate-400"
        }`}
      >
        {canSave
          ? "セットとして保存"
          : `あと${SLOT_SIZE - picked.length}枚選択してください`}
      </button>
    </Modal>
  );
}

function LoadView({
  sets,
  findMemory,
  onApply,
  onDeleteSet,
  onClose,
}: {
  sets: MemorySet[];
  findMemory: (id: string) => Memory | undefined;
  onApply: (set: MemorySet) => void;
  onDeleteSet: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="メモリーセットから選択" onClose={onClose}>
      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          保存済みのメモリーセットはありません。「メモリーセットを作成」から作れます。
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sets.map((set) => (
            <div
              key={set.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {set.name}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteSet(set.id)}
                  aria-label="セットを削除"
                  className="ml-auto rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(set);
                    onClose();
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-500"
                >
                  スロットに展開
                </button>
              </div>
              <div className="flex gap-2">
                {set.memoryIds.map((id, i) => {
                  const memory = findMemory(id);
                  return memory ? (
                    <div key={`${id}-${i}`} className="w-1/4 max-w-24">
                      <MemoryCard memory={memory} />
                    </div>
                  ) : (
                    <div
                      key={`${id}-${i}`}
                      className="flex aspect-3/5 w-1/4 max-w-24 items-center justify-center rounded-lg border border-dashed border-red-300 text-[10px] text-red-400"
                    >
                      削除済み
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
