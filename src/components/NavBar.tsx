import { Link, useLocation } from "react-router-dom";

// サポカ編成計算機のナビ（メインは /calc）。ブランド名クリックでホームへ戻る。
const TABS = [
  { href: "/calc", label: "計算" },
  { href: "/support", label: "所持状況" },
  { href: "/memory", label: "メモリー設定" },
  { href: "/ability-counts", label: "発動回数" },
  { href: "/card-settings", label: "サポカ設定" },
  { href: "/card-scores", label: "点数表" },
  { href: "/database", label: "データベース" },
];

export default function NavBar() {
  const pathname = useLocation().pathname;

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
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap scrollbar-thin">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
