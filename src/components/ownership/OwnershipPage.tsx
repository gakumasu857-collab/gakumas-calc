import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, FileSpreadsheet, Save } from "lucide-react";
import Modal from "@/components/Modal";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import CsvTransfer from "@/components/ownership/CsvTransfer";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";
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

const HEAD_BTN =
  "flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100";

/** 所持状況入力ページ（サポカ／Pアイドルの切り替え式） */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");
  // 所持ストアはこのページで1つだけ持って子へ配る
  // （フックごとに独立したstateなので、複数箇所で呼ぶと保存の読み込みが同期しない）
  const levels = useOwnedLevels();
  const pIdols = useOwnedPIdols();
  // 上部が混み合わないよう、保存・CSVはボタンから開くモーダルにまとめる
  const [saveOpen, setSaveOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden self-start rounded-xl border border-slate-300">
          {(
            [
              ["support", "サポートカード"],
              ["pidol", "Pアイドル"],
            ] as const
          ).map(([key, label], i) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-5 py-2 text-sm font-bold transition ${i > 0 ? "border-l border-slate-300" : ""} ${
                tab === key
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          title="今のサポカ凸・Pアイドルの特訓/開花に名前をつけて保存・読み込みします"
          className={HEAD_BTN}
        >
          <Save size={15} />
          保存・読み込み
        </button>
        <button
          type="button"
          onClick={() => setCsvOpen(true)}
          title="所持状況をCSVで書き出し・読み込みします"
          className={HEAD_BTN}
        >
          <FileSpreadsheet size={15} />
          CSV
        </button>
        <Link
          to="/card-import"
          className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
        >
          <Camera size={15} />
          画面キャプチャで所持入力（β版。PCのみ）
        </Link>
      </div>

      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}

      {/* 所持状況を名前をつけて保存・読み込み（サポカ凸＋Pアイドル特訓/開花） */}
      {saveOpen && (
        <Modal title="所持状況の保存・読み込み" onClose={() => setSaveOpen(false)}>
          <OwnedSaveBar levels={levels} pIdols={pIdols} bare />
        </Modal>
      )}

      {/* CSVで一括入出力（開いているタブのぶん） */}
      {csvOpen && (
        <Modal
          title={`CSVで${tab === "support" ? "サポカ" : "Pアイドル"}の所持状況を入出力`}
          onClose={() => setCsvOpen(false)}
        >
          {tab === "support" ? (
            <CsvTransfer
              formatNote={SUPPORT_CSV_NOTE}
              exportName={SUPPORT_CSV_FILENAME}
              buildCsv={() => buildSupportCsv(levels.getLevel)}
              onImport={(text) => importSupportCsv(text, levels.applyLevels)}
              bare
            />
          ) : (
            <CsvTransfer
              formatNote={PIDOL_CSV_NOTE}
              exportName={PIDOL_CSV_FILENAME}
              buildCsv={() => buildPIdolCsv(pIdols.getOwnership)}
              onImport={(text) => importPIdolCsv(text, pIdols.applyOwnership)}
              bare
            />
          )}
        </Modal>
      )}
    </div>
  );
}
