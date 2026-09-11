import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

// サポカ編成計算機のナビ（メインは /calc）。使う順（計算→所持状況→メモリー→発動回数）に並べ、
// 参照系・上級者向け（サポカ設定／点数表／データベース）は「その他」にまとめる。
// ブランド名クリックでホームへ戻る。
const TABS = [
  { href: "/calc", label: "計算" },
  { href: "/support", label: "所持状況" },
  { href: "/memory", label: "メモリー" },
  { href: "/ability-counts", label: "発動回数" },
];
const MORE = [
  {
    href: "/card-settings",
    label: "サポカ設定",
    note: "前イベ・後イベの既定、固定・BAN・レンタルNG（上級者向け）",
  },
  { href: "/card-scores", label: "サポカ点数表", note: "全カードの点数を一覧で見る" },
  { href: "/database", label: "データベース", note: "サポカのアビリティ・イベント一覧" },
];

const TAB_CLASS = (active: boolean) =>
  `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-blue-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function NavBar() {
  const pathname = useLocation().pathname;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => m.href === pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-x-4 px-4 py-2.5">
        <Link
          to="/"
          title="ホーム（ツール一覧）へ戻る"
          className="flex shrink-0 items-center gap-1.5 text-base font-bold tracking-tight text-blue-600 transition hover:text-blue-500"
        >
          <img src="/icon-192.png" alt="" className="h-6 w-6 object-contain" />
          サポカ編成計算機
        </Link>
        {/* タブは折り返さず横スクロール（2行にしない） */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-thin">
          {TABS.map((tab) => (
            <Link key={tab.href} to={tab.href} className={TAB_CLASS(pathname === tab.href)}>
              {tab.label}
            </Link>
          ))}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`${TAB_CLASS(moreActive)} flex items-center gap-0.5`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              {moreActive ? MORE.find((m) => m.href === pathname)?.label : "その他"}
              <ChevronDown size={14} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                <div
                  role="menu"
                  className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                  {MORE.map((m) => (
                    <Link
                      key={m.href}
                      to={m.href}
                      role="menuitem"
                      onClick={() => setMoreOpen(false)}
                      className={`block rounded-md px-3 py-2 transition hover:bg-slate-100 ${
                        pathname === m.href ? "bg-blue-50" : ""
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-800">
                        {m.label}
                      </span>
                      <span className="block whitespace-normal text-[11px] text-slate-500">
                        {m.note}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
