import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, HardDrive } from "lucide-react";
import Modal from "@/components/Modal";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import { BTN_SECONDARY } from "@/components/ui";
import { markOwnershipVisited } from "@/lib/ownershipAck";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import { useOwnedSaves } from "@/lib/useOwnedSaves";

/** 所持状況入力ページ（サポカ／Pアイドルを切り替え） */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");
  // 所持ストアはこのページで1つだけ持って子へ配る
  // （フックごとに独立したstateなので、複数箇所で呼ぶと保存の読み込みが同期しない）
  const levels = useOwnedLevels();
  const pIdols = useOwnedPIdols();
  const saves = useOwnedSaves();
  const active = saves.activeId
    ? saves.saves.find((s) => s.id === saves.activeId)
    : undefined;
  // スロット（保存先）の切り替え・作成・削除・CSVは1つのモーダルにまとめる
  const [saveOpen, setSaveOpen] = useState(false);
  // 計算ページの「所持状況が未入力」判定は「このページを開いたことがあるか」で行う
  useEffect(() => {
    markOwnershipVisited();
  }, []);

  const tabBtn = (key: "support" | "pidol", label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
        tab === key
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 見出し行: 左＝サポカ／Pアイドルの切り替え、右＝保存先スロットとキャプチャ入力 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {tabBtn("support", "サポートカード")}
          {tabBtn("pidol", "Pアイドル")}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            title="保存先スロットの切り替え・作成・削除、CSVの書き出し・読み込み"
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition ${
              active
                ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 hover:bg-amber-100"
            }`}
          >
            <HardDrive size={16} className={active ? "text-emerald-600" : "text-amber-600"} />
            <span className="flex flex-col">
              <span className="text-[10px] font-semibold text-slate-500">保存先スロット</span>
              <span className={`text-sm font-bold ${active ? "text-emerald-800" : "text-amber-800"}`}>
                {active ? active.name : "なし（変更は保存されない）"}
              </span>
            </span>
            <span className="ml-1 text-[11px] text-slate-500">
              {active ? "自動保存中 ▾" : "作る ▾"}
            </span>
          </button>
          <Link to="/card-import" className={BTN_SECONDARY} title="ゲーム画面を映して所持を自動読み取り（β版・PCのみ）">
            <Camera size={14} />
            画面キャプチャで入力
          </Link>
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">
        入力内容はこのブラウザに自動保存されます（別端末・ブラウザのデータ削除では引き継がれません）。
        保存先スロットを作ると、その内容にも随時保存されます。新しく実装されたサポカは完凸（4凸）として扱います。
      </p>

      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}

      {/* 所持状況のスロット・CSV（サポカ凸＋Pアイドル特訓/開花） */}
      {saveOpen && (
        <Modal title="所持状況の保存先（スロット）・CSV" onClose={() => setSaveOpen(false)}>
          <OwnedSaveBar levels={levels} pIdols={pIdols} store={saves} />
        </Modal>
      )}
    </div>
  );
}
