import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import CsvTransfer from "@/components/ownership/CsvTransfer";
import {
  PIDOL_CSV_FILENAME,
  PIDOL_CSV_NOTE,
  SUPPORT_CSV_FILENAME,
  SUPPORT_CSV_NOTE,
  buildPIdolCsv,
  buildSupportCsv,
  importPIdolCsv,
  importSupportCsv,
} from "@/lib/ownershipCsv";
import type { useOwnedLevels } from "@/lib/useOwnedLevels";
import type { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import {
  BUILTIN_ALL4,
  BUILTIN_ID,
  DEFAULT_OWN_NAME,
  type useOwnedSaves,
} from "@/lib/useOwnedSaves";

const SECTION =
  "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5";
const HEAD = "text-xs font-bold text-slate-700";
const BTN_PRIMARY =
  "flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
const BTN =
  "flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT =
  "min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500";

/**
 * 所持状況の管理（新しく作る／名前・複製・削除／CSV）。切り替えは所持状況ページのプルダウン。
 * - 「新しく作る」＝今の内容か全サポカ完凸から作って、そのまま使用中にする
 * - 使用中のものは変更が自動保存されているので、「上書き保存」は無い
 */
export default function OwnedSaveBar({
  levels,
  pIdols,
  store,
  onDone,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  levels: ReturnType<typeof useOwnedLevels>;
  pIdols: ReturnType<typeof useOwnedPIdols>;
  store: ReturnType<typeof useOwnedSaves>;
  /** 操作が終わったら閉じて、ページ側に一言出す */
  onDone: (message?: string) => void;
}) {
  const active =
    store.activeId === BUILTIN_ID
      ? BUILTIN_ALL4
      : (store.saves.find((s) => s.id === store.activeId) ?? BUILTIN_ALL4);
  const isBuiltin = active.id === BUILTIN_ID;
  const [name, setName] = useState("");
  const [base, setBase] = useState<"current" | "all4">("current");
  const [newName, setNewName] = useState(active.name);

  const loadBuiltin = () => {
    levels.replaceAll(BUILTIN_ALL4.levels, BUILTIN_ALL4.cardCount);
    pIdols.replaceAll(BUILTIN_ALL4.pIdols ?? {});
  };

  const doCreate = () => {
    const rec = store.createFrom(name, base);
    // 先に使用中を切り替えてから読み込む（読み込み直後の自動保存が新しいものへ向くように）
    store.setActiveSlot(rec.id);
    if (base === "all4") loadBuiltin();
    onDone(`「${rec.name}」を作りました。これからの変更はここに自動で保存されます`);
  };

  const doRename = () => {
    if (isBuiltin) return;
    const finalName = newName.trim() || active.name;
    store.rename(active.id, finalName);
    onDone(`名前を「${finalName}」に変えました`);
  };

  const doDuplicate = () => {
    const rec = store.duplicate(active.id, "");
    if (!rec) return;
    store.setActiveSlot(rec.id);
    onDone(`「${rec.name}」を作りました（複製）。これからの変更はここに自動で保存されます`);
  };

  const doDelete = () => {
    if (isBuiltin) return;
    if (!window.confirm(`「${active.name}」を削除しますか？`)) return;
    store.remove(active.id);
    loadBuiltin();
    onDone(`「${active.name}」を削除しました。全サポカ完凸に戻りました`);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 1. 新しく作る */}
      <section className={SECTION}>
        <span className={HEAD}>新しく作る</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doCreate()}
            placeholder={`名前（空なら「${DEFAULT_OWN_NAME}」）`}
            className={INPUT}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
          <span className="text-slate-500">元にする内容:</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="owned-base"
              checked={base === "current"}
              onChange={() => setBase("current")}
              className="accent-blue-600"
            />
            今の内容をコピー
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="owned-base"
              checked={base === "all4"}
              onChange={() => setBase("all4")}
              className="accent-blue-600"
            />
            全サポカ完凸から
          </label>
          <button type="button" onClick={doCreate} className={`${BTN_PRIMARY} ml-auto`}>
            <Plus size={13} />
            作って切り替える
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          作ったものが「使う所持状況」になり、以後の変更はそこに自動で保存されます。
        </span>
      </section>

      {/* 2. 使っているもの */}
      <section className={SECTION}>
        <span className={HEAD}>
          使っているもの: <span className="text-blue-700">{active.name}</span>
          {!isBuiltin && (
            <span className="ml-1.5 font-normal text-slate-400">（最終保存 {active.savedAt}）</span>
          )}
        </span>
        {isBuiltin ? (
          <span className="text-[11px] text-slate-500">
            既定は名前の変更・削除ができません。カードの凸などを変えると「{DEFAULT_OWN_NAME}」が自動で作られます。
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doRename()}
              className={INPUT}
            />
            <button type="button" onClick={doRename} className={BTN}>
              <Pencil size={13} />
              名前を変更
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={doDuplicate} className={BTN}>
            <Copy size={13} />
            複製して切り替える
          </button>
          <button
            type="button"
            disabled={isBuiltin}
            onClick={doDelete}
            className={`${BTN} ml-auto hover:bg-red-50 hover:text-red-600`}
          >
            <Trash2 size={13} />
            削除
          </button>
        </div>
      </section>

      {/* 3. CSV */}
      <section className={SECTION}>
        <span className={HEAD}>CSVで書き出し・読み込み（使っているものに反映）</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 font-bold text-slate-500">サポカ</span>
          <CsvTransfer
            formatNote={SUPPORT_CSV_NOTE}
            exportName={SUPPORT_CSV_FILENAME}
            buildCsv={() => buildSupportCsv(levels.getLevel)}
            onImport={(text) => importSupportCsv(text, levels.applyLevels)}
            bare
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 font-bold text-slate-500">Pアイドル</span>
          <CsvTransfer
            formatNote={PIDOL_CSV_NOTE}
            exportName={PIDOL_CSV_FILENAME}
            buildCsv={() => buildPIdolCsv(pIdols.getOwnership)}
            onImport={(text) => importPIdolCsv(text, pIdols.applyOwnership)}
            bare
          />
        </div>
        {isBuiltin && (
          <span className="text-[11px] text-slate-400">
            全サポカ完凸を使っているときに読み込むと、「{DEFAULT_OWN_NAME}」が自動で作られてそこに入ります。
          </span>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-slate-400">
        ※ 所持状況はお使いのブラウザの中（localStorage）に保存されます。
        ブラウザのデータ削除・別の端末やブラウザ・シークレットモードでは引き継がれず、
        消えることがあります。控えが必要なときはCSVで書き出しておいてください。
      </p>
    </div>
  );
}
