/** 計算ページのカード枠と入力欄ラベル（各ブロックで共通） */
export function Card({
  id,
  title,
  hint,
  action,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1 text-sm font-bold text-slate-900">
          {title}
          {hint}
        </h2>
        {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}
