import { useEffect, useState } from "react";
import { Check, Save, Trash2 } from "lucide-react";
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
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { ownershipCustomized } from "@/lib/ownershipAck";
import { P_IDOL_MASTERS } from "@/lib/pIdol";
import type { useOwnedLevels } from "@/lib/useOwnedLevels";
import type { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import type { useOwnedSaves, OwnedSave } from "@/lib/useOwnedSaves";

/**
 * 既定のスロット「全サポカ完凸」。理論値を見たいときに戻すための固定データで、
 * 読み込みだけできる（変更の保存先にはならない）。Pアイドルは初回既定と同じ特訓6・開花4。
 * 保存はせず毎回DBから組み立てるので、新カードも自動的に完凸として含まれる。
 */
export const BUILTIN_ALL4: OwnedSave = {
  id: "builtin-all4",
  name: "全サポカ完凸（既定）",
  savedAt: "常に最新",
  levels: Object.fromEntries(SUPPORT_CARD_DB.map((c) => [c.id, 4])),
  pIdols: Object.fromEntries(
    P_IDOL_MASTERS.map((m) => [m.key, { kunren: 6, kaika: 4 }]),
  ),
  cardCount: SUPPORT_CARD_DB.length,
};

const SECTION =
  "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5";
const HEAD = "text-xs font-bold text-slate-700";
const BTN_PRIMARY =
  "flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
const BTN =
  "flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 所持状況のスロット（保存先）とCSV入出力。
 * - スロットを選ぶ＝その内容を読み込み、以後の変更はそのスロットへ随時保存
 * - 「名前をつけて保存」＝今の所持状況で新しいスロットを作り、保存先にする
 * - 計算ページのセーブデータと一緒に作られた控え（saveId 付き）は「セーブデータ用」のグループ
 */
export default function OwnedSaveBar({
  levels,
  pIdols,
  store,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  levels: ReturnType<typeof useOwnedLevels>;
  pIdols: ReturnType<typeof useOwnedPIdols>;
  store: ReturnType<typeof useOwnedSaves>;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // 完了メッセージは数秒で消す（出しっぱなしだと次の操作の結果と混ざる）
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const own = store.saves.filter((s) => !s.saveId);
  const linked = store.saves.filter((s) => s.saveId);
  const active = store.activeId
    ? store.saves.find((s) => s.id === store.activeId)
    : undefined;
  const placeholder = `所持状況 ${new Date().toLocaleDateString("ja-JP")}`;

  /** スロットを選ぶ: その内容を読み込んで保存先にする（既定は読み込みのみ） */
  const choose = (id: string) => {
    if (!id) {
      store.setActiveSlot(null);
      setMessage("保存先なしにしました（これからの変更はどこにも保存されません）");
      return;
    }
    const target =
      id === BUILTIN_ALL4.id ? BUILTIN_ALL4 : store.saves.find((s) => s.id === id);
    if (!target) return;
    // 保存先が無いまま入力した内容は読み込みで消えるので、一度だけ確認する
    if (
      !store.activeId &&
      ownershipCustomized(levels.levels) &&
      !window.confirm(
        `「${target.name}」を読み込みます。今の所持状況は保存先が無いため失われます。続けますか？`,
      )
    )
      return;
    // 先に保存先を切り替えてから読み込む（読み込み直後の自動保存が新しい保存先へ向くように）
    store.setActiveSlot(id === BUILTIN_ALL4.id ? null : id);
    levels.replaceAll(target.levels, target.cardCount);
    if (target.pIdols) pIdols.replaceAll(target.pIdols);
    setMessage(
      id === BUILTIN_ALL4.id
        ? "全サポカ完凸を読み込みました（保存先はなし。変更を残すには名前をつけて保存）"
        : `「${target.name}」を読み込みました。これからの変更はここに自動保存されます`,
    );
  };

  const doSaveAs = () => {
    const finalName = name.trim() || placeholder;
    const id = store.upsert({
      name: finalName,
      levels: levels.levels,
      pIdols: pIdols.map,
    });
    store.setActiveSlot(id);
    setName("");
    setMessage(`「${finalName}」に保存しました。これからの変更はここに自動保存されます`);
  };

  const doDelete = () => {
    if (!active) return;
    if (!window.confirm(`「${active.name}」を削除しますか？（所持状況の入力はそのまま残ります）`))
      return;
    store.remove(active.id);
    setMessage(`「${active.name}」を削除しました（保存先はなしになりました）`);
  };

  const options = (list: OwnedSave[]) =>
    list.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}（{s.savedAt}）
      </option>
    ));

  return (
    <div className="flex flex-col gap-3">
      {/* 1. 保存先スロット */}
      <section className={SECTION}>
        <span className={HEAD}>今の所持状況の保存先（スロット）</span>
        <select
          value={store.activeId ?? ""}
          onChange={(e) => choose(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="">保存先なし（変更は保存されない）</option>
          <optgroup label="既定（読み込みのみ）">
            <option value={BUILTIN_ALL4.id}>{BUILTIN_ALL4.name}</option>
          </optgroup>
          <optgroup label="この画面で保存したもの">
            {own.length > 0 ? (
              options(own)
            ) : (
              <option disabled>（まだありません。下の「名前をつけて保存」で作れます）</option>
            )}
          </optgroup>
          {linked.length > 0 && (
            <optgroup label="セーブデータ用（計算ページのセーブと一緒に保存）">
              {options(linked)}
            </optgroup>
          )}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-500">
            {active
              ? `「${active.name}」に自動保存中（最終 ${active.savedAt}）`
              : "スロットを選ぶとその内容を読み込み、以後の変更はそこへ自動で保存されます"}
          </span>
          <button
            type="button"
            disabled={!active}
            onClick={doDelete}
            className={`${BTN} ml-auto hover:bg-red-50 hover:text-red-600`}
          >
            <Trash2 size={13} />
            このスロットを削除
          </button>
        </div>
      </section>

      {/* 2. 新規スロット */}
      <section className={SECTION}>
        <span className={HEAD}>名前をつけて保存（新しいスロット）</span>
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
          今のサポカの凸とPアイドルの特訓・才能開花をまとめて保存し、保存先にします。
        </span>
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
        ※ 所持状況とスロットはお使いのブラウザの中（localStorage）に保存されます。
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
