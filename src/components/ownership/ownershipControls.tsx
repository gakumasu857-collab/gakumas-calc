import { useState, type ReactNode } from "react";
import { ChevronDown, Layers, Search } from "lucide-react";

/**
 * 所持状況入力ページの共通部品（サポカ・Pアイドルで同じ見た目にする）。2026-11-09 にページを整理したときに切り出した。
 * - Toolbar: 検索・絞り込み・件数・一括入力を1本の帯にまとめる（一括入力は押したときだけ開く）
 * - GroupHeading: 一覧の区切り（レアリティ・アイドル）
 * - FilterSelect / Segmented: 絞り込みのプルダウンと一括入力のボタン列
 */

/** 検索・絞り込みの帯。children に絞り込み、bulk に一括入力の中身を渡す */
export function Toolbar({
  query,
  onQuery,
  placeholder,
  count,
  children,
  bulk,
}: {
  query?: string;
  onQuery?: (v: string) => void;
  placeholder?: string;
  /** 表示中の枚数 */
  count: number;
  children: ReactNode;
  /** 一括入力の中身（「一括入力」を押したときだけ開く） */
  bulk: ReactNode;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-xs text-slate-600">
        {onQuery && (
          <label className="flex min-w-44 flex-1 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1 focus-within:border-blue-500 sm:max-w-64">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              type="search"
              value={query ?? ""}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
        )}
        {children}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-slate-400">{count}枚</span>
          <button
            type="button"
            onClick={() => setBulkOpen((v) => !v)}
            aria-expanded={bulkOpen}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition ${
              bulkOpen
                ? "border-blue-400 bg-blue-50 text-blue-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
            title="表示中のカードにまとめて同じ値を入れる"
          >
            <Layers size={13} />
            一括入力
            <ChevronDown size={13} className={`transition ${bulkOpen ? "rotate-180" : ""}`} />
          </button>
        </span>
      </div>
      {bulkOpen && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs">
          {bulk}
        </div>
      )}
    </div>
  );
}

/** 一覧の区切り見出し（例: 「SSR 64枚」「花海咲季 13枚」） */
export function GroupHeading({ label, count, owned }: { label: string; count: number; owned?: number }) {
  return (
    <h3 className="col-span-full mt-2 flex items-baseline gap-2 border-b border-slate-200 pb-1 text-sm font-bold text-slate-800 first:mt-0">
      {label}
      <span className="text-xs font-normal text-slate-400">
        {count}枚{owned !== undefined ? `（所持 ${owned}）` : ""}
      </span>
    </h3>
  );
}

/** 一括入力の適用ボタン */
export function ApplyButton({ count, disabled, onClick }: { count: number; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      表示中の{count}枚に適用
    </button>
  );
}

/** 一括入力用のセグメントボタン */
export function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      <span className="whitespace-nowrap text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {options.map((option, i) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap px-1.5 py-1 font-semibold transition sm:px-2 ${i > 0 ? "border-l border-slate-300" : ""} ${
              option.value === value ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 絞り込みのプルダウン（先頭は「すべて」） */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[] | string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const active = value !== "すべて" && value !== "";
  return (
    <label className="flex items-center gap-1">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-40 rounded-lg border px-1.5 py-1 ${
          active ? "border-blue-400 bg-blue-50 font-semibold text-blue-800" : "border-slate-300 bg-white"
        }`}
      >
        <option value="すべて">すべて</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 「所持のみ」などのチェック */
export function CheckFilter({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      {label}
    </label>
  );
}
