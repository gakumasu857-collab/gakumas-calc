import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";

/** 所持状況入力ページ（サポカ／Pアイドルの切り替え式） */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");
  // 所持ストアはこのページで1つだけ持って子へ配る
  // （フックごとに独立したstateなので、複数箇所で呼ぶと保存の読み込みが同期しない）
  const levels = useOwnedLevels();
  const pIdols = useOwnedPIdols();

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
        <Link
          to="/card-import"
          className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
        >
          <Camera size={15} />
          画面キャプチャで所持入力（β版。PCのみ）
        </Link>
      </div>
      {/* 所持状況を名前をつけて保存・読み込み（サポカ凸＋Pアイドル特訓/開花） */}
      <OwnedSaveBar levels={levels} pIdols={pIdols} />
      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}
    </div>
  );
}
