import { BookOpen, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

/**
 * プロデュース計算機のナビ（メインは /calc）。
 * 計算｜所持状況・プロデュース・サポカ設定｜点数表・データベース｜ヘルプ。
 * 2026-11-18 に「自動編成機能の設定」のまとまりをやめ、ページの名前をそのまま並べた
 * （所持状況・プロデュースは計算ページの「準備」の欄で選ぶものの中身を作るページ。まとまりの名前が「設定の設定」になって
 * 分かりにくかったため。オーナー「思うようにやって」）。欄の名前とページの名前をそろえている。
 * 幅の狭い画面（md 未満）は「計算」と「メニュー」の2つだけにして、メニューで全ページを短い説明つきで出す。
 * ブランド名クリックでホームへ戻る。右端はヘルプ（枠で囲ったボタン。オーナー指定 2026-10-01）。
 */
type Page = { href: string; label: string; note: string; sub?: boolean };
/** 計算ページの「準備」で選ぶものの中身を作るページ */
const MAKE_PAGES: Page[] = [
  { href: "/support", label: "所持状況", note: "持っているサポカの凸、Pアイドルの特訓と才能開花" },
  { href: "/card-import", label: "画面キャプチャで所持入力（β）", note: "ゲーム画面から凸を読み取る", sub: true },
  { href: "/ability-counts", label: "プロデュース", note: "アビリティが何回発動するか" },
  { href: "/card-settings", label: "サポカ設定", note: "前イベの回数の上限、固定・BAN・レンタルNG" },
];
/** 見るだけの表 */
const TABLE_PAGES: Page[] = [
  { href: "/card-scores", label: "点数表", note: "全サポカの点数" },
  { href: "/database", label: "データベース", note: "サポカとPアイドルのデータ" },
];

const TAB_CLASS = (active: boolean) =>
  `shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-blue-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function NavBar() {
  const pathname = useLocation().pathname;
  const [menuOpen, setMenuOpen] = useState(false);
  // ページが変わったら閉じる
  useEffect(() => setMenuOpen(false), [pathname]);
  const current = [...MAKE_PAGES, ...TABLE_PAGES].find((p) => p.href === pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-x-2 px-3 py-2 sm:gap-x-3 sm:px-4">
        <Link
          to="/"
          title="ホーム（ツール一覧）へ戻る"
          className="flex shrink-0 items-center gap-1.5 text-base font-bold tracking-tight text-blue-600 transition hover:text-blue-500"
        >
          <img src="/icon-192.png" alt="" className="h-6 w-6 object-contain" />
          <span className="hidden lg:inline">プロデュース計算機</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap">
          <Link to="/calc" className={`${TAB_CLASS(pathname === "/calc")} font-bold`}>
            計算
          </Link>
          {/* PC: ページの名前をそのまま並べる */}
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-slate-300 md:block" />
          {MAKE_PAGES.filter((p) => !p.sub).map((p) => (
            <Link
              key={p.href}
              to={p.href}
              title={p.note}
              className={`hidden md:block ${TAB_CLASS(pathname === p.href || (p.href === "/support" && pathname === "/card-import"))}`}
            >
              {p.label}
            </Link>
          ))}
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-slate-300 md:block" />
          {TABLE_PAGES.map((p) => (
            <Link
              key={p.href}
              to={p.href}
              title={p.note}
              className={`hidden md:block ${TAB_CLASS(pathname === p.href)}`}
            >
              {p.label}
            </Link>
          ))}
          {/* スマホ: メニュー（今いるページの名前も出す） */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className={`flex items-center gap-1 md:hidden ${TAB_CLASS(!!current)}`}
          >
            <Menu size={15} />
            {current ? current.label : "メニュー"}
          </button>
        </nav>
        <Link
          to="/help"
          title="使い方・用語・よくある質問"
          className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-bold transition ${
            pathname === "/help"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-blue-400 bg-white text-blue-700 hover:bg-blue-50"
          }`}
        >
          <BookOpen size={15} />
          <span className="hidden sm:inline">ヘルプ</span>
        </Link>
      </div>
      {menuOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/30 md:hidden" onClick={() => setMenuOpen(false)}>
            <div
              className="absolute inset-x-0 top-0 max-h-full overflow-y-auto rounded-b-2xl bg-white p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">メニュー</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="閉じる"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <MenuLink page={{ href: "/calc", label: "計算", note: "編成を探して評価値を出す" }} pathname={pathname} />
              <p className="mt-2 px-2 text-[11px] font-bold text-slate-400">準備で選ぶものを作る</p>
              {MAKE_PAGES.map((p) => (
                <MenuLink key={p.href} page={p} pathname={pathname} />
              ))}
              <p className="mt-2 px-2 text-[11px] font-bold text-slate-400">見るだけの表</p>
              {TABLE_PAGES.map((p) => (
                <MenuLink key={p.href} page={p} pathname={pathname} />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}

function MenuLink({ page, pathname }: { page: Page; pathname: string }) {
  const active = pathname === page.href;
  return (
    <Link
      to={page.href}
      className={`flex flex-col rounded-lg py-2 pr-3 transition ${page.sub ? "pl-7" : "pl-3"} ${
        active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <span className={page.sub ? "text-xs font-bold" : "text-sm font-bold"}>{page.label}</span>
      <span className={`text-[11px] ${active ? "text-blue-100" : "text-slate-500"}`}>{page.note}</span>
    </Link>
  );
}
