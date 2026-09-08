import { useEffect, useState } from "react";
import { Check, FolderOpen, Save, Trash2 } from "lucide-react";
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
import { useOwnedSaves, type OwnedSave } from "@/lib/useOwnedSaves";

const SECTION =
  "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5";
const HEAD = "text-xs font-bold text-slate-700";
const BTN_PRIMARY =
  "flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
const BTN =
  "flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 所持状況（サポカの凸＋Pアイドルの特訓/開花）の保存・読み込み・削除・CSV入出力。
 * 「名前をつけて保存」と、「保存した所持状況を選んで 読み込む／上書き保存／削除」、
 * 「CSV」の3段構成。計算ページのセーブデータと一緒に作られた控え（saveId 付き）は
 * 選択肢の中で「セーブデータ用」のグループに分けて出す。
 */
export default function OwnedSaveBar({
  levels,
  pIdols,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  levels: ReturnType<typeof useOwnedLevels>;
  pIdols: ReturnType<typeof useOwnedPIdols>;
}) {
  const store = useOwnedSaves();
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // 完了メッセージは数秒で消す（出しっぱなしだと次の操作の結果と混ざる）
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const own = store.saves.filter((s) => !s.saveId);
  const linked = store.saves.filter((s) => s.saveId);
  const selected = store.saves.find((s) => s.id === selectedId);
  const placeholder = `所持状況 ${new Date().toLocaleDateString("ja-JP")}`;

  const doSaveAs = () => {
    const finalName = name.trim() || placeholder;
    const id = store.upsert({
      name: finalName,
      levels: levels.levels,
      pIdols: pIdols.map,
    });
    setName("");
    setSelectedId(id);
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

  const doOverwrite = () => {
    if (!selected) return;
    if (!window.confirm(`「${selected.name}」を今の所持状況で上書きしますか？`))
      return;
    store.overwrite(selected.id, { levels: levels.levels, pIdols: pIdols.map });
    setMessage(`「${selected.name}」を上書き保存しました`);
  };

  const doDelete = () => {
    if (!selected) return;
    if (!window.confirm(`「${selected.name}」を削除しますか？`)) return;
    store.remove(selected.id);
    setSelectedId("");
    setMessage(`「${selected.name}」を削除しました`);
  };

  const options = (list: OwnedSave[]) =>
    list.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}（{s.savedAt}）
      </option>
    ));

  return (
    <div className="flex flex-col gap-3">
      {/* 1. 新規保存 */}
      <section className={SECTION}>
        <span className={HEAD}>名前をつけて保存</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSaveAs()}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
          />
          <button type="button" onClick={doSaveAs} className={BTN_PRIMARY}>
            <Save size={13} />
            保存する
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          今のサポカの凸とPアイドルの特訓・才能開花をまとめて保存します。
        </span>
      </section>

      {/* 2. 保存済みへの操作（選んで 読み込む／上書き保存／削除） */}
      <section className={SECTION}>
        <span className={HEAD}>保存した所持状況</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="">操作するものを選択</option>
          <optgroup label="この画面で保存したもの">
            {own.length > 0 ? (
              options(own)
            ) : (
              <option disabled>（まだありません）</option>
            )}
          </optgroup>
          {linked.length > 0 && (
            <optgroup label="セーブデータ用（計算ページのセーブと一緒に保存）">
              {options(linked)}
            </optgroup>
          )}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!selected}
            onClick={doLoad}
            title="今の所持状況を選んだものに置き換えます"
            className={BTN_PRIMARY}
          >
            <FolderOpen size={13} />
            読み込む
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={doOverwrite}
            title="選んだものを今の所持状況で上書きします（名前はそのまま）"
            className={BTN}
          >
            <Save size={13} />
            上書き保存
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={doDelete}
            className={`${BTN} hover:bg-red-50 hover:text-red-600`}
          >
            <Trash2 size={13} />
            削除
          </button>
        </div>
      </section>

      {/* 3. CSV */}
      <section className={SECTION}>
        <span className={HEAD}>CSVで書き出し・読み込み</span>
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
      </section>

      <p className="text-[11px] leading-relaxed text-slate-400">
        ※ 所持状況と保存データはお使いのブラウザの中（localStorage）に保存されます。
        ブラウザのデータ削除・別の端末やブラウザ・シークレットモードでは引き継がれず、
        消えることがあります。控えが必要なときはCSVで書き出しておいてください。
      </p>

      {message && (
        <p className="flex items-center gap-1 text-xs font-bold text-emerald-700">
          <Check size={13} />
          {message}
        </p>
      )}
    </div>
  );
}
