import { BookOpen } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/**
 * プロデュース計算機のナビ（メインは /calc）。
 * 計算ページ以外は「探索の設定」（所持状況・発動回数・サポカ設定＝探索に使う条件）と
 * 「表」（サポカ点数表・サポカDB＝見るだけ）の2つに分けて、小さな見出しで区切る。
 * ブランド名クリックでホームへ戻る。右端はヘルプ。
 */
const GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  {
    label: "探索の設定",
    tabs: [
      { href: "/support", label: "所持状況" },
      { href: "/ability-counts", label: "発動回数" },
      { href: "/card-settings", label: "サポカ設定" },
    ],
  },
  {
    label: "表",
    tabs: [
      { href: "/card-scores", label: "サポカ点数表" },
      { href: "/database", label: "サポカDB" },
    ],
  },
];

const TAB_CLASS = (active: boolean) =>
  `shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-blue-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function NavBar() {
  const pathname = useLocation().pathname;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-x-3 px-4 py-2">
        <Link
          to="/"
          title="ホーム（ツール一覧）へ戻る"
          className="flex shrink-0 items-center gap-1.5 text-base font-bold tracking-tight text-blue-600 transition hover:text-blue-500"
        >
          <img src="/icon-192.png" alt="" className="h-6 w-6 object-contain" />
          <span className="hidden sm:inline">プロデュース計算機</span>
        </Link>
        {/* タブは折り返さず横スクロール（2行にしない） */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-thin">
          <Link to="/calc" className={`${TAB_CLASS(pathname === "/calc")} font-bold`}>
            計算
          </Link>
          {GROUPS.map((group) => (
            <span key={group.label} className="flex shrink-0 items-center gap-1">
              {/* グループの見出し（縦線＋小さな文字） */}
              <span className="ml-1.5 flex items-center border-l border-slate-300 pl-2 text-[10px] font-bold tracking-wide text-slate-400">
                {group.label}
              </span>
              {group.tabs.map((tab) => (
                <Link key={tab.href} to={tab.href} className={TAB_CLASS(pathname === tab.href)}>
                  {tab.label}
                </Link>
              ))}
            </span>
          ))}
        </nav>
        <Link
          to="/help"
          title="使い方・用語・よくある質問"
          className={`${TAB_CLASS(pathname === "/help")} flex items-center gap-1`}
        >
          <BookOpen size={15} />
          <span className="hidden sm:inline">ヘルプ</span>
        </Link>
      </div>
    </header>
  );
}
