import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** モーダル幅（デフォルト max-w-2xl。広い画面が必要なら max-w-4xl 等を渡す） */
  widthClass?: string;
};

/** 画面中央に出す共通モーダル。背景クリックか×で閉じる。 */
export default function Modal({
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full flex-col rounded-xl bg-white shadow-xl ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
