import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 数値入力の共通コンポーネント。
 * 普段はただの数値入力欄で、右クリックするとスライダー＋±ボタンのポップオーバーが開く
 * （大きい数字をマウスだけで入力するため）。
 * スライダーはドラッグしたまま上下に離すと微調整（×1/10・×1/100）、ホイールで±1
 * （Shift=±10、Ctrl=±100）。
 * ポップオーバーはポータルで画面直付けにし、モーダル内の下端（選抜3など）でも
 * はみ出さないよう、下に収まらなければ上向きに開く。
 */
type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  /** 値の上限（スライダーの右端にもなる） */
  max?: number;
  /** スライダーの右端だけ実用的な範囲に狭めたいとき */
  sliderMax?: number;
  disabled?: boolean;
  /** 幅などの追加クラス（デフォルト w-28） */
  className?: string;
};

/** ポップオーバーの大きさ（w-64＋スライダー＋±ボタン行のおおよその高さ） */
const POP_W = 256;
const POP_H = 88;

export default function NumberField({
  value,
  onChange,
  min = 0,
  max = 99_999_999,
  sliderMax,
  disabled,
  className = "w-28",
}: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  /**
   * 入力中の文字列（欄に入っている間だけ）。数字を全部消した瞬間に「0」が出て、次に打つと「014000」になるのを防ぐ
   * （値そのものは打つたびに反映し、表示だけ打った通りにしておく。欄から離れたら値の表示に戻る＝空なら 0）。
   * オーナー要望 2026-10-07
   */
  const [draft, setDraft] = useState<string | null>(null);
  /** 欄の外（スライダー・±）から値を変えるときは、入力中の文字列を捨てて値の表示に戻す */
  const commit = (v: number) => {
    setDraft(null);
    onChange(v);
  };

  /** 入力欄の位置から画面内に収まる表示位置を決める（収まらなければ上向き） */
  const togglePopover = () => {
    if (pos) {
      setPos(null);
      return;
    }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, POP_W / 2 + 8),
      window.innerWidth - POP_W / 2 - 8,
    );
    const below = rect.bottom + 4;
    const top =
      below + POP_H > window.innerHeight - 8 ? rect.top - POP_H - 4 : below;
    setPos({ left, top });
  };

  return (
    <span
      ref={anchorRef}
      className={`relative inline-block align-middle ${className}`}
    >
      <input
        type="number"
        min={min}
        max={max}
        value={draft ?? String(value)} // 文字列で渡す: 数値だと「014000」と 14000 が同じ扱いになり、欄の表示が直らない
        disabled={disabled}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            setDraft(""); // 表示は空のまま（値は 0 として反映）
            onChange(clamp(0));
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            setDraft(raw);
            return;
          }
          const next = clamp(n);
          setDraft(next === n ? raw : String(next)); // 上限を超えたら上限の値を見せる
          onChange(next);
        }}
        onBlur={() => setDraft(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!disabled) togglePopover();
        }}
        title="右クリックでスライダー・±ボタン"
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-300"
      />
      {pos &&
        createPortal(
          <>
            {/* 外側クリック（または再右クリック）で閉じる */}
            <div
              className="fixed inset-0 z-60"
              onClick={() => setPos(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPos(null);
              }}
            />
            <div
              className="fixed z-60 w-64 -translate-x-1/2 rounded-lg border border-slate-300 bg-white p-2 shadow-lg"
              style={{ left: pos.left, top: pos.top }}
            >
              <MiniSlider
                value={value}
                min={min}
                max={Math.max(min + 1, sliderMax ?? max)}
                onChange={(v) => commit(clamp(v))}
              />
              <div className="mt-1.5 flex items-center justify-center gap-1">
                {[-100, -10, -1].map((step) => (
                  <StepButton
                    key={step}
                    step={step}
                    disabled={value <= min}
                    onClick={() => commit(clamp(value + step))}
                  />
                ))}
                {[+1, +10, +100].map((step) => (
                  <StepButton
                    key={step}
                    step={step}
                    disabled={value >= max}
                    onClick={() => commit(clamp(value + step))}
                  />
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

/**
 * ポップオーバー内のスライダー。
 * 横ドラッグ=通常移動 / 上下に離すほど微調整（±40pxで×1/10、±100pxで×1/100）/
 * ホイール±1（Shift=±10、Ctrl=±100）。
 */
function MiniSlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    lastX: number;
    startY: number;
    acc: number;
    startValue: number;
  } | null>(null);
  const [dragFactor, setDragFactor] = useState<number | null>(null);

  // ホイールのpreventDefaultはReactのonWheel（passive）では効かないためネイティブで登録する
  const latest = useRef({ value, min, max, onChange });
  latest.current = { value, min, max, onChange };
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { value: v, min: lo, max: hi, onChange: fn } = latest.current;
      e.preventDefault();
      const step = e.ctrlKey ? 100 : e.shiftKey ? 10 : 1;
      fn(Math.max(lo, Math.min(hi, v + (e.deltaY < 0 ? step : -step))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const factorOf = (dy: number) => (dy < 40 ? 1 : dy < 100 ? 0.1 : 0.01);
  const range = max - min;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = trackRef.current!;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const v = clamp(min + ((e.clientX - rect.left) / rect.width) * range);
    onChange(v);
    dragRef.current = { lastX: e.clientX, startY: e.clientY, acc: 0, startValue: v };
    setDragFactor(1);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = trackRef.current!.getBoundingClientRect();
    // 因数はその瞬間の縦距離で決め、横移動を逐次積分する（因数が切り替わっても値が飛ばない）
    const factor = factorOf(Math.abs(e.clientY - drag.startY));
    drag.acc += ((e.clientX - drag.lastX) / rect.width) * range * factor;
    drag.lastX = e.clientX;
    onChange(clamp(drag.startValue + drag.acc));
    setDragFactor(factor);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragFactor(null);
  };

  const pct = range > 0 ? ((value - min) / range) * 100 : 0;

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative h-6 w-full cursor-pointer touch-none select-none"
      title="上下に離すと微調整・ホイールで±1"
    >
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
      <div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-l-full bg-blue-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow ring-1 ring-slate-300"
        style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      {/* ドラッグ中は値と精度を表示 */}
      {dragFactor !== null && (
        <div
          className="absolute -top-6 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
          style={{ left: `${Math.min(88, Math.max(12, pct))}%` }}
        >
          {value.toLocaleString()}
          {dragFactor < 1 && (
            <span className="ml-1 text-amber-300">
              ×{dragFactor === 0.1 ? "1/10" : "1/100"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StepButton({
  step,
  disabled,
  onClick,
}: {
  step: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-9 rounded-md border px-1 py-1 text-[11px] font-semibold transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {step > 0 ? `+${step}` : step}
    </button>
  );
}
