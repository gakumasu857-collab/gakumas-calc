import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Save } from "lucide-react";
import Modal from "@/components/Modal";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";

const HEAD_BTN =
  "flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100";

/** 所持状況入力ページ（サポカ／Pアイドルをプルダウンで切り替え） */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");
  // 所持ストアはこのページで1つだけ持って子へ配る
  // （フックごとに独立したstateなので、複数箇所で呼ぶと保存の読み込みが同期しない）
  const levels = useOwnedLevels();
  const pIdols = useOwnedPIdols();
  // 保存・読み込み・削除・CSVは1つのモーダルにまとめる
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as "support" | "pidol")}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
          >
            <option value="support">サポートカード</option>
            <option value="pidol">Pアイドル</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          title="所持状況に名前をつけて保存・読み込み・削除、CSVの書き出し・読み込み"
          className={HEAD_BTN}
        >
          <Save size={15} />
          保存・読み込み・CSV
        </button>
        <Link
          to="/card-import"
          className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
        >
          <Camera size={15} />
          画面キャプチャで所持入力（β版。PCのみ）
        </Link>
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">
        入力内容はお使いのブラウザの中に自動保存されます（ブラウザのデータ削除や別端末では引き継がれません）。
        新しく実装されたサポカは完凸（4凸）として扱います。
      </p>

      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}

      {/* 所持状況の保存・読み込み・削除・CSV（サポカ凸＋Pアイドル特訓/開花） */}
      {saveOpen && (
        <Modal
          title="所持状況の保存・読み込み・CSV"
          onClose={() => setSaveOpen(false)}
        >
          <OwnedSaveBar levels={levels} pIdols={pIdols} />
        </Modal>
      )}
    </div>
  );
}
