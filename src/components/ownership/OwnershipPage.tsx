import { useState } from "react";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";

/** 所持状況入力ページ（サポカ／Pアイドルの切り替え式） */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");

  return (
    <div className="flex flex-col gap-4">
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
      {tab === "support" ? <SupportCardOwnership /> : <PIdolOwnership />}
    </div>
  );
}
