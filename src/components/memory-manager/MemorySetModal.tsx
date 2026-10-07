import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { slotToMemory, type Memory, type MemorySet } from "@/lib/memoryTypes";
import { BTN_SECONDARY, FIELD } from "@/components/ui";
import MemoryCard from "./MemoryCard";
import Modal from "@/components/Modal";

type Props = {
  mode: "save" | "load";
  /** 今の4枠（保存時のプレビュー用） */
  slots: (Memory | null)[];
  sets: MemorySet[];
  /** 今の4枠を入れたセット（一覧で「使用中」と出す） */
  activeSetId: string | null;
  onSave: (name: string) => void;
  onApply: (set: MemorySet) => void;
  onDeleteSet: (id: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onClose: () => void;
};

/** メモリーセットの保存（save: 今の4枠をそのまま）と呼び出し・名前の変更・削除（load）を行うモーダル。 */
export default function MemorySetModal({
  mode,
  slots,
  sets,
  activeSetId,
  onSave,
  onApply,
  onDeleteSet,
  onRenameSet,
  onClose,
}: Props) {
  return mode === "save" ? (
    <SaveView slots={slots} onSave={onSave} onClose={onClose} />
  ) : (
    <LoadView
      sets={sets}
      activeSetId={activeSetId}
      onApply={onApply}
      onDeleteSet={onDeleteSet}
      onRenameSet={onRenameSet}
      onClose={onClose}
    />
  );
}

/** 4枚を横に並べたプレビュー（保存時・一覧） */
function SetCards({ memories }: { memories: (Memory | null)[] }) {
  return (
    <div className="flex gap-2">
      {memories.map((memory, i) =>
        memory ? (
          <div key={i} className="w-1/4 max-w-24">
            <MemoryCard memory={memory} />
          </div>
        ) : (
          <div
            key={i}
            className="flex aspect-3/5 w-1/4 max-w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400"
          >
            空
          </div>
        ),
      )}
    </div>
  );
}

function SaveView({
  slots,
  onSave,
  onClose,
}: {
  slots: (Memory | null)[];
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal title="この4枚を新しいメモリーセットとして保存" onClose={onClose}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="セット名（未入力なら自動で命名されます）"
        autoFocus
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
      />
      <SetCards memories={slots} />
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        セットには4枚の中身がそのまま入ります（保存していないメモリーもそのまま）。
        「保存したセットから入れる」でいつでも4枠に戻せます。保存したあとは、そのセットを使っている状態になります。
      </p>
      <button
        type="button"
        onClick={() => {
          onSave(name.trim());
          onClose();
        }}
        className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        セットとして保存
      </button>
    </Modal>
  );
}

function LoadView({
  sets,
  activeSetId,
  onApply,
  onDeleteSet,
  onRenameSet,
  onClose,
}: {
  sets: MemorySet[];
  activeSetId: string | null;
  onApply: (set: MemorySet) => void;
  onDeleteSet: (id: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onClose: () => void;
}) {
  // 計算ページのセーブデータ用セットは既定で畳む（増えても一覧が埋まらないように）
  const [showSaveSets, setShowSaveSets] = useState(false);
  /** 名前を変えているセットと、入力中の名前 */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const saveSets = sets.filter((s) => s.saveId);
  const ownSets = sets.filter((s) => !s.saveId);
  const visible = showSaveSets ? [...ownSets, ...saveSets] : ownSets;
  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name) onRenameSet(renaming.id, name);
    setRenaming(null);
  };
  return (
    <Modal title="保存したメモリーセット" onClose={onClose}>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        「4枠に入れる」で4枚まとめて入ります。入れたあとに枠を変えても、セットは変わりません（セット自体を変えるときは、作業台の「上書き保存」）。
      </p>
      {saveSets.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSaveSets((v) => !v)}
          title="計算ページのセーブデータと一緒に保存されたメモリーセットです"
          className={`mb-3 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
            showSaveSets
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 text-slate-500 hover:bg-slate-100"
          }`}
        >
          セーブデータ用も表示（{saveSets.length}件）
        </button>
      )}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          {saveSets.length > 0
            ? "自分で保存したメモリーセットはありません（セーブデータ用は上のボタンで表示できます）。"
            : "保存したメモリーセットはありません。4枠そろえて「新しいセットとして保存」で作れます。"}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((set) => {
            const isActive = set.id === activeSetId;
            const isRenaming = renaming?.id === set.id;
            return (
              <div
                key={set.id}
                className={`flex flex-col gap-2 rounded-lg border p-3 ${
                  isActive ? "border-blue-400 bg-blue-50/40" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {isRenaming ? (
                    <>
                      <input
                        type="text"
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: set.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        autoFocus
                        maxLength={30}
                        className={`${FIELD} min-w-0 flex-1`}
                      />
                      <button type="button" onClick={commitRename} className={BTN_SECONDARY}>
                        <Check size={13} />
                        決定
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} className={BTN_SECONDARY}>
                        やめる
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 truncate text-sm font-bold text-slate-900">{set.name}</span>
                      {isActive && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          使用中
                        </span>
                      )}
                      {set.saveId && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                          セーブデータ用
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: set.id, name: set.name })}
                        aria-label="名前を変更"
                        title="名前を変更"
                        className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSet(set.id)}
                        aria-label="セットを削除"
                        title="セットを削除"
                        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
                        4枠に入れる
                      </button>
                    </>
                  )}
                </div>
                <SetCards memories={set.memories.map((m, i) => (m ? slotToMemory(m, i) : null))} />
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
