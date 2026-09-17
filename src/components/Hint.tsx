import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/** 吹き出しと画面の端・ボタンとの間隔（px） */
const MARGIN = 8;
const GAP = 4;

/**
 * ⓘ の説明。ホバーでツールチップ（title）、クリック／タップで吹き出しを開く。
 * 長い説明文を本文（灰色の注記）から追い出して、画面をすっきりさせるために使う。
 *
 * 吹き出しは body 直下（createPortal）に画面基準（fixed）で出す。モーダルの中身のように
 * スクロールする枠（overflow）の中に置くと、枠の外にはみ出した分が切れて読めなかったため
 * （「条件設定」の下のほうの ⓘ は、押しても文章が見えなかった）。
 * 位置は ⓘ の下（入らなければ上）で、左右は画面の中に収める。スクロール・画面サイズの変更で閉じる。
 */
export default function Hint({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  // 開いたら、吹き出しの実際の大きさを測ってから位置を決める（決まるまでは見えない状態で描く）
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - w - MARGIN));
    const below = r.bottom + GAP;
    const top =
      below + h <= window.innerHeight - MARGIN ? below : Math.max(MARGIN, r.top - GAP - h);
    setPos({ left, top });
  }, [open, text]);

  // 画面基準で置いているので、スクロールや画面サイズの変更で ⓘ とずれる前に閉じる
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  /** label の中に置いても、チェックボックス等のクリックにならないようにする（portal でも React のイベントは親へ届く） */
  const swallow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          swallow(e);
          setOpen((v) => !v);
        }}
        title={text}
        aria-label="説明を表示"
        aria-expanded={open}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-blue-600"
      >
        <Info size={14} />
      </button>
      {open &&
        createPortal(
          <>
            {/* 外側を押したら閉じる（モーダルより手前） */}
            <span
              className="fixed inset-0 z-[70] cursor-default"
              onClick={(e) => {
                swallow(e);
                setOpen(false);
              }}
            />
            <span
              ref={popRef}
              role="tooltip"
              onClick={swallow}
              style={{
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                visibility: pos ? "visible" : "hidden",
              }}
              className="fixed z-[71] w-64 max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] font-normal leading-relaxed text-slate-600 shadow-lg"
            >
              {text}
            </span>
          </>,
          document.body,
        )}
    </span>
  );
}
