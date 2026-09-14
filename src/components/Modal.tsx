import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** モーダル幅（デフォルト max-w-2xl。広い画面が必要なら max-w-4xl 等を渡す） */
  widthClass?: string;
  /**
   * 見出しのすぐ下に固定で置くもの（決定ボタンなど）。中身がスクロールしても動かない
   * （中身の中に sticky で置くと、帯の上に隙間ができて下が透けるのでこちらを使う）。
   */
  toolbar?: ReactNode;
  /**
   * 出し方。center＝画面中央（既定）。left＝左端から出す引き出し。
   */
  side?: "center" | "left";
};

/** 共通モーダル。背景クリックか×で閉じる。 */
export default function Modal({
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
  toolbar,
  side = "center",
}: Props) {
  const header = (
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={18} />
      </button>
    </div>
  );
  const bar = toolbar ? (
    <div className="border-b border-slate-200 bg-white px-4 py-2.5">{toolbar}</div>
  ) : null;

  if (side === "left") {
    return (
      <div
        className="fixed inset-0 z-50 flex justify-start bg-slate-900/15"
        onClick={onClose}
      >
        <div
          className={`drawer-left flex h-full w-full flex-col bg-white shadow-2xl ${widthClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {bar}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full flex-col rounded-xl bg-white shadow-xl ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {bar}
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
