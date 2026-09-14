import { BookOpen, ChevronDown, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

/**
 * プロデュース計算機のナビ（メインは /calc）。
 * 計算｜自動編成機能の設定（プルダウン: 所持状況・プロデュース設定・サポカ設定）｜点数表・データベース｜ヘルプ。
 * 「自動編成機能の設定」は探索（自動編成）が参照する設定ページ3つをまとめたもの（2026-09-16、オーナー指示。
 * 表の2つと計算はそのまま）。ブランド名クリックでホームへ戻る。右端はヘルプ。
 * メニューは nav が横スクロール（overflow）なので、切れないよう body 直付け（createPortal）で描く。
 */
const SETTINGS_PAGES: { href: string; label: string; note: string }[] = [
  { href: "/support", label: "所持状況", note: "持っているサポカの凸・Pアイドルの特訓と才能開花" },
  { href: "/ability-counts", label: "プロデュース設定", note: "アビリティ発動回数のデフォルト" },
  { href: "/card-settings", label: "サポカ設定", note: "前イベ・後イベの既定、固定・BAN・レンタルNG" },
];
const TABLE_PAGES: { href: string; label: string }[] = [
  { href: "/card-scores", label: "点数表" },
  { href: "/database", label: "データベース" },
];

const TAB_CLASS = (active: boolean) =>
  `shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-blue-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

const MENU_WIDTH = 256;

export default function NavBar() {
  const pathname = useLocation().pathname;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const inSettings = SETTINGS_PAGES.some((p) => p.href === pathname);

  // ページが変わったら閉じる
  useEffect(() => setOpen(false), [pathname]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const b = btnRef.current.getBoundingClientRect();
      // 画面右にはみ出さないように
      setPos({
        left: Math.max(8, Math.min(b.left, window.innerWidth - MENU_WIDTH - 8)),
        top: b.bottom + 6,
      });
    }
    setOpen((v) => !v);
  };

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
          {/* グループの区切り（細い線だけ） */}
          <span className="mx-1 h-5 w-px shrink-0 bg-slate-300" />
          <button
            ref={btnRef}
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            title="探索（自動編成）が参照する設定: 所持状況・プロデュース設定・サポカ設定"
            className={`${TAB_CLASS(inSettings || open)} flex items-center gap-1`}
          >
            <Settings2 size={14} />
            自動編成機能の設定
            <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
          <span className="mx-1 h-5 w-px shrink-0 bg-slate-300" />
          {TABLE_PAGES.map((tab) => (
            <Link key={tab.href} to={tab.href} className={TAB_CLASS(pathname === tab.href)}>
              {tab.label}
            </Link>
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
      {open &&
        createPortal(
          <>
            {/* 外側クリックで閉じる */}
            <span className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
            <div
              role="menu"
              style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
              className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold text-slate-400">
                探索（自動編成）が参照する設定
              </p>
              {SETTINGS_PAGES.map((p) => {
                const active = pathname === p.href;
                return (
                  <Link
                    key={p.href}
                    to={p.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`flex flex-col rounded-lg px-2.5 py-1.5 transition ${
                      active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-sm font-bold">{p.label}</span>
                    <span className={`text-[11px] ${active ? "text-blue-100" : "text-slate-500"}`}>
                      {p.note}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </header>
  );
}
