import { useState } from "react";
import { ArrowRightLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
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
  type OwnedSave,
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
 * 所持状況の管理（新しく作る／名前・複製・削除／CSV）。切り替えは所持状況ページのプルダウンでも、
 * ここの「対象」を選んで「これを使う」でもできる。
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
  const findSave = (id: string): OwnedSave =>
    id === BUILTIN_ID ? BUILTIN_ALL4 : (store.saves.find((s) => s.id === id) ?? BUILTIN_ALL4);
  const [name, setName] = useState("");
  const [base, setBase] = useState<"current" | "all4">("current");
  /** 名前・複製・削除の対象（初期値は使っているもの） */
  const [targetId, setTargetId] = useState(store.activeId);
  const target = findSave(targetId);
  const targetIsBuiltin = target.id === BUILTIN_ID;
  const targetIsActive = target.id === store.activeId;
  const [newName, setNewName] = useState(target.name);
  const own = store.saves.filter((s) => !s.saveId);
  const linked = store.saves.filter((s) => s.saveId);

  const chooseTarget = (id: string) => {
    setTargetId(id);
    setNewName(findSave(id).name);
  };

  /** 所持ストアへ読み込む（使用中を切り替えた直後に呼ぶ） */
  const loadInto = (save: OwnedSave) => {
    levels.replaceAll(save.levels, save.cardCount);
    if (save.pIdols) pIdols.replaceAll(save.pIdols, save.pIdolCount);
  };

  const doCreate = () => {
    const rec = store.createFrom(name, base);
    // 先に使用中を切り替えてから読み込む（読み込み直後の自動保存が新しいものへ向くように）
    store.setActiveSlot(rec.id);
    if (base === "all4") loadInto(BUILTIN_ALL4);
    onDone(`「${rec.name}」を作りました。これからの変更はここに自動で保存されます`);
  };

  const doUse = () => {
    if (targetIsActive) return;
    store.setActiveSlot(target.id);
    loadInto(target);
    onDone(
      targetIsBuiltin
        ? `「全サポカ完凸」に切り替えました（凸を変えると「${DEFAULT_OWN_NAME}」が自動で作られます）`
        : `「${target.name}」に切り替えました。変更はここに自動で保存されます`,
    );
  };

  const doRename = () => {
    if (targetIsBuiltin) return;
    const finalName = newName.trim() || target.name;
    store.rename(target.id, finalName);
    onDone(`名前を「${finalName}」に変えました`);
  };

  const doDuplicate = () => {
    const rec = store.duplicate(target.id, "");
    if (!rec) return;
    store.setActiveSlot(rec.id);
    loadInto(rec);
    onDone(`「${rec.name}」を作りました（「${target.name}」の複製）。これからの変更はここに自動で保存されます`);
  };

  const doDelete = () => {
    if (targetIsBuiltin) return;
    if (!window.confirm(`「${target.name}」を削除しますか？`)) return;
    const wasActive = targetIsActive;
    store.remove(target.id);
    if (wasActive) loadInto(BUILTIN_ALL4);
    onDone(
      wasActive
        ? `「${target.name}」を削除しました。全サポカ完凸に戻りました`
        : `「${target.name}」を削除しました`,
    );
  };

  const option = (s: OwnedSave) => (
    <option key={s.id} value={s.id}>
      {s.name}（{s.savedAt}）{s.id === store.activeId ? "・使用中" : ""}
    </option>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 1. 新しく作る */}
      <section className={SECTION}>
        <span className={HEAD}>新しく作る</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doCreate()}
          placeholder={`名前（空なら「${DEFAULT_OWN_NAME}」）`}
          className={INPUT}
        />
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

      {/* 2. 名前・複製・削除（対象を選べる） */}
      <section className={SECTION}>
        <label className="flex flex-wrap items-center gap-2">
          <span className={HEAD}>対象</span>
          <select
            value={targetId}
            onChange={(e) => chooseTarget(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value={BUILTIN_ID}>
              全サポカ完凸（既定）{store.activeId === BUILTIN_ID ? "・使用中" : ""}
            </option>
            {own.length > 0 && <optgroup label="自分で作ったもの">{own.map(option)}</optgroup>}
            {linked.length > 0 && <optgroup label="セーブデータ用">{linked.map(option)}</optgroup>}
          </select>
          <button type="button" disabled={targetIsActive} onClick={doUse} className={BTN}>
            <ArrowRightLeft size={13} />
            {targetIsActive ? "使用中" : "これを使う"}
          </button>
        </label>
        {targetIsBuiltin ? (
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
            disabled={targetIsBuiltin}
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
        {store.activeId === BUILTIN_ID && (
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
