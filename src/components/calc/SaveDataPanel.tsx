import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Pencil, Save, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { SCENARIO_LABELS } from "@/data/scenarios";
import {
  applySave,
  deleteSaveLinked,
  renameSaveLinked,
  saveExtrasFor,
  saveSummary,
} from "@/lib/calcSaveIO";
import type { useCalcResult } from "@/lib/useCalcResult";
import { useOwnedSaves } from "@/lib/useOwnedSaves";

type CalcResult = ReturnType<typeof useCalcResult>;

const SMALL_BTN =
  "flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 計算ページのセーブデータ操作。
 * 保存はその育成の全状態（シナリオ・踏み方・メモリー・所持状況・発動回数・編成・
 * イベント設定）を1件にまとめて持つので、読み込めば評価値まで丸ごと再現できる。
 */
export default function SaveDataPanel({ r }: { r: CalcResult }) {
  const calc = r.calc;
  const ownedSaves = useOwnedSaves();
  const [selectedSaveId, setSelectedSaveId] = useState("");
  /** 名前をつけて保存するモーダル（new=新規, rename=名前変更） */
  const [dialog, setDialog] = useState<"new" | "rename" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSave = calc.saves.find((s) => s.id === selectedSaveId);

  // メッセージは数秒で自動的に消す（押した手ごたえ用）
  const notify = (text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 4000);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** 新規保存（控えのセット類もこのIDに紐づけて作る） */
  const doSaveNew = (name: string) => {
    const id = calc.newSaveId();
    const finalName = name.trim() || defaultName(r);
    calc.saveNew(finalName, saveExtrasFor(r, ownedSaves, id, finalName), id);
    setSelectedSaveId(id);
    setDialog(null);
    notify(`「${finalName}」に保存しました（評価値 ${Math.round(r.rating).toLocaleString()}）`);
  };

  /** 選択中のセーブへ上書き */
  const doOverwrite = () => {
    if (!selectedSave) return;
    calc.overwrite(
      selectedSave.id,
      saveExtrasFor(r, ownedSaves, selectedSave.id, selectedSave.name),
    );
    notify(`「${selectedSave.name}」に上書き保存しました（評価値 ${Math.round(r.rating).toLocaleString()}）`);
  };

  const doLoad = () => {
    if (!selectedSave) return;
    const { full } = applySave(r, selectedSave);
    notify(
      full
        ? `「${selectedSave.name}」を読み込みました（シナリオ・踏み方・メモリー・所持状況・発動回数・編成すべて）`
        : `「${selectedSave.name}」を読み込みました（旧形式のため設定と所持状況のみ）`,
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDialog("new")}
          title="今の状態（シナリオ・踏み方・メモリー・所持状況・発動回数・編成）に名前をつけて保存します"
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
        >
          <Save size={13} />
          名前をつけて保存
        </button>
        <span className="text-[11px] text-slate-400">
          育成の状態をまるごと保存します（読み込みで評価値まで再現）
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={selectedSaveId}
          onChange={(e) => setSelectedSaveId(e.target.value)}
          className="w-72 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="">セーブデータを選択</option>
          {calc.saves.map((save) => (
            <option key={save.id} value={save.id}>
              {save.name}（{save.savedAt}
              {save.rating ? ` / 評価値${save.rating.toLocaleString()}` : ""}）
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selectedSave}
          onClick={doLoad}
          title="保存した状態をまるごと読み込みます"
          className={SMALL_BTN}
        >
          <FolderOpen size={13} />
          読み込む
        </button>
        <button
          type="button"
          disabled={!selectedSave}
          onClick={doOverwrite}
          title="今の状態でこのセーブを上書きします"
          className={SMALL_BTN}
        >
          <Save size={13} />
          上書き保存
        </button>
        <button
          type="button"
          disabled={!selectedSave}
          onClick={() => setDialog("rename")}
          className={SMALL_BTN}
        >
          <Pencil size={13} />
          名前変更
        </button>
        <button
          type="button"
          disabled={!selectedSave}
          onClick={() => {
            if (
              selectedSave &&
              window.confirm(
                `「${selectedSave.name}」を削除しますか？（このセーブ用のメモリーセット・発動回数セット・所持状況の控えも消えます）`,
              )
            ) {
              deleteSaveLinked(r, ownedSaves, selectedSave);
              setSelectedSaveId("");
              notify("セーブデータを削除しました");
            }
          }}
          className={`${SMALL_BTN} hover:bg-red-50! hover:text-red-600!`}
        >
          <Trash2 size={13} />
          削除
        </button>
      </div>

      {/* 選択中セーブの中身（何が入っているか一目で分かるように） */}
      {selectedSave && (
        <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500">
          {selectedSave.snapshot && (
            <>
              <b className="text-slate-600">
                {SCENARIO_LABELS[selectedSave.snapshot.scenario]}
              </b>
              ／{selectedSave.settings.idol}
              {selectedSave.settings.pIdol && `・${selectedSave.settings.pIdol}`}
              ／
            </>
          )}
          {saveSummary(selectedSave)}
          {selectedSave.rating != null && (
            <>
              ／保存時の評価値{" "}
              <b className="text-blue-700">
                {selectedSave.rating.toLocaleString()}
              </b>
            </>
          )}
        </p>
      )}

      {message && (
        <p className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
          <Check size={14} />
          {message}
        </p>
      )}

      {dialog && (
        <SaveNameModal
          mode={dialog}
          initial={dialog === "rename" ? (selectedSave?.name ?? "") : ""}
          placeholder={defaultName(r)}
          onSubmit={(name) => {
            if (dialog === "new") {
              doSaveNew(name);
            } else if (selectedSave) {
              // 控え（メモリーセット・発動回数セット・所持状況）の名前も揃える
              renameSaveLinked(r, ownedSaves, selectedSave, name.trim() || selectedSave.name);
              setDialog(null);
              notify("名前を変更しました");
            }
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** 名前未入力のときの既定名（アイドル＋Pアイドル＋日付） */
function defaultName(r: CalcResult): string {
  const date = new Date().toLocaleDateString("ja-JP");
  return [r.calc.settings.idol, r.calc.settings.pIdol, date]
    .filter(Boolean)
    .join(" ");
}

/** 保存名の入力モーダル（保存ボタンを押したときに出る） */
function SaveNameModal({
  mode,
  initial,
  placeholder,
  onSubmit,
  onClose,
}: {
  mode: "new" | "rename";
  initial: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal
      title={mode === "new" ? "名前をつけて保存" : "セーブ名の変更"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          セーブ名
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
            未入力なら「{placeholder}」で保存します。
          </span>
        </label>

        {mode === "new" && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            <b className="text-slate-600">保存されるもの:</b>{" "}
            育成シナリオ／アイドル・Pアイドル／レッスン・授業・試験の踏み方／
            メモリー4枚／サポカ編成6枚と前イベ・後イベ設定／発動回数／
            サポカ・Pアイドルの所持状況／条件設定。
            <br />
            メモリー・発動回数・所持状況は、それぞれのページからも呼び出せるよう
            <b className="text-slate-600">「セーブデータ用」</b>
            の控えとしても保存します（各ページでは既定で畳んで表示）。
          </div>
        )}

        <button
          type="button"
          onClick={() => onSubmit(name)}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          {mode === "new" ? "保存する" : "変更する"}
        </button>
      </div>
    </Modal>
  );
}
