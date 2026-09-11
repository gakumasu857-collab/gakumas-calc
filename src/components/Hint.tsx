import { useState } from "react";
import { Info } from "lucide-react";

/**
 * ⓘ の説明。ホバーでツールチップ（title）、クリック／タップで吹き出しを開く。
 * 長い説明文を本文（灰色の注記）から追い出して、画面をすっきりさせるために使う。
 */
export default function Hint({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          // label の中に置いても、チェックボックス等のクリックにならないようにする
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={text}
        aria-label="説明を表示"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-blue-600"
      >
        <Info size={14} />
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-30 cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <span className="absolute left-0 top-5 z-40 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] font-normal leading-relaxed text-slate-600 shadow-lg">
            {text}
          </span>
        </>
      )}
    </span>
  );
}
