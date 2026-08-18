import { useState } from "react";
import { imageUrl } from "@/lib/config";

type Props = {
  card: { name: string; rarity: string; image: string };
  level: number;
  onChange: (level: number) => void;
};

/** レアリティごとのバッジ配色 */
const RARITY_BADGE: Record<string, string> = {
  SSR: "bg-amber-400/95 text-amber-950",
  EventSSR: "bg-fuchsia-500/95 text-white",
  SR: "bg-sky-400/95 text-sky-950",
  R: "bg-slate-300/95 text-slate-700",
};

/**
 * サポカ所持入力の1行（コンパクト版）。
 * 画像＋「未所持」＋凸1〜4のボタンで1セット。
 * 凸ボタンは点灯中の数字をもう一度押すと0凸（所持・無凸）に戻る。
 */
export default function SupportCardItem({ card, level, onChange }: Props) {
  const [broken, setBroken] = useState(false);
  const owned = level >= 0; // -1 のときだけ未所持
  const url = imageUrl(card.image);
  const showImage = Boolean(url) && !broken;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
      {/* 画像（未所持はモノクロ・左上に凸バッジ） */}
      <div
        className="relative h-11 w-22 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-black/5"
        title={card.name}
      >
        {showImage ? (
          // 静的エクスポート＋外部R2画像なので next/image ではなく素の img を使う
          <img
            src={url}
            alt={card.name}
            loading="lazy"
            onError={() => setBroken(true)}
            className={`h-full w-full object-cover ${owned ? "" : "grayscale opacity-60"}`}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight text-slate-500 ${
              owned ? "" : "grayscale opacity-70"
            }`}
          >
            {card.name}
          </div>
        )}
        <span
          className={`absolute left-0.5 top-0.5 rounded px-1 text-[8px] font-bold shadow-sm ${
            RARITY_BADGE[card.rarity] ?? "bg-slate-300/95 text-slate-700"
          }`}
        >
          {card.rarity === "EventSSR" ? "配布" : card.rarity}
        </span>
        {owned && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 text-[9px] font-bold text-white">
            {level}凸
          </span>
        )}
      </div>

      {/* 名前＋ボタン列 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] leading-tight text-slate-600" title={card.name}>
          {card.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(level === -1 ? 0 : -1)}
            title="未所持⇔所持(0凸)を切り替え"
            className={`h-7 rounded-md px-1.5 text-[11px] font-semibold transition ${
              level === -1
                ? "bg-slate-600 text-white"
                : "bg-slate-100 text-slate-400 hover:bg-slate-200"
            }`}
          >
            未
          </button>
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              title={`${n}凸にする`}
              className={`h-7 w-7 rounded-md text-xs font-bold transition ${
                owned && level === n
                  ? "bg-blue-400 text-white"
                  : owned && level > n
                    ? "bg-blue-100 text-blue-500"
                    : "bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
