import { useState } from "react";
import { Check, ChevronDown, FolderOpen, Save, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import type { useOwnedLevels } from "@/lib/useOwnedLevels";
import type { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import { useOwnedSaves } from "@/lib/useOwnedSaves";

/**
 * 所持状況（サポカの凸＋Pアイドルの特訓/開花）を名前をつけて保存・読み込みするバー。
 * 計算ページのセーブデータから作られた控え（saveId 付き）は、
 * 数が増えても邪魔にならないよう既定では畳んでおく。
 */
export default function OwnedSaveBar({
  levels,
  pIdols,
  bare = false,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  levels: ReturnType<typeof useOwnedLevels>;
  pIdols: ReturnType<typeof useOwnedPIdols>;
  /** モーダルの中に置くとき用（枠と背景を外す） */
  bare?: boolean;
}) {
  const store = useOwnedSaves();
  const [selectedId, setSelectedId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showLinked, setShowLinked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const linkedCount = store.saves.filter((s) => s.saveId).length;
  const visible = store.saves.filter((s) => showLinked || !s.saveId);
  const selected = store.saves.find((s) => s.id === selectedId);

  const doSave = (name: string) => {
    const finalName =
      name.trim() || `所持状況 ${new Date().toLocaleDateString("ja-JP")}`;
    store.upsert({ name: finalName, levels: levels.levels, pIdols: pIdols.map });
    setDialogOpen(false);
    setMessage(`「${finalName}」に保存しました`);
  };

  const doLoad = () => {
    if (!selected) return;
    levels.replaceAll(selected.levels);
    if (selected.pIdols) pIdols.replaceAll(selected.pIdols);
    setMessage(
      `「${selected.name}」を読み込みました（サポカ${Object.keys(selected.levels).length}枚${
        selected.pIdols ? "・Pアイドル込み" : ""
      }）`,
    );
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs ${
        bare
          ? ""
          : "rounded-xl border border-slate-200 bg-white px-3 py-2"
      }`}
    >
      {!bare && <span className="font-bold text-slate-700">所持状況の保存</span>}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        title="今のサポカ凸・Pアイドルの特訓/開花に名前をつけて保存します"
        className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 font-bold text-white transition hover:bg-blue-500"
      >
        <Save size={13} />
        名前をつけて保存
      </button>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="max-w-56 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-slate-700"
      >
        <option value="">保存した所持状況を選択</option>
        {visible.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}（{s.savedAt}）
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        onClick={doLoad}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FolderOpen size={13} />
        読み込む
      </button>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (selected && window.confirm(`「${selected.name}」を削除しますか？`)) {
            store.remove(selected.id);
            setSelectedId("");
            setMessage("削除しました");
          }
        }}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={13} />
        削除
      </button>
      {linkedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowLinked((v) => !v)}
          title="計算ページのセーブデータと一緒に保存された所持状況です"
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-medium transition ${
            showLinked
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 text-slate-500 hover:bg-slate-100"
          }`}
        >
          <ChevronDown size={12} />
          セーブデータ用も表示（{linkedCount}）
        </button>
      )}
      {message && (
        <span className="flex items-center gap-1 font-bold text-emerald-700">
          <Check size={13} />
          {message}
        </span>
      )}

      {dialogOpen && (
        <SaveNameModal
          placeholder={`所持状況 ${new Date().toLocaleDateString("ja-JP")}`}
          onSubmit={doSave}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function SaveNameModal({
  placeholder,
  onSubmit,
  onClose,
}: {
  placeholder: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal title="所持状況に名前をつけて保存" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          名前
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit(name)}
            placeholder={placeholder}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
          />
          <span className="text-[11px] text-slate-400">
            サポカの凸とPアイドルの特訓・才能開花をまとめて保存します。
          </span>
        </label>
        <button
          type="button"
          onClick={() => onSubmit(name)}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          保存する
        </button>
      </div>
    </Modal>
  );
}
