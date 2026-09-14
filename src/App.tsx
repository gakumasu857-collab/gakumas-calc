import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import NavBar from "@/components/NavBar";
import AbilityCountManager from "@/components/ability-counts/AbilityCountManager";
import CalcPage from "@/components/calc/CalcPage";
import CardImportPage from "@/components/card-import/CardImportPage";
import CardScoreTable from "@/components/card-scores/CardScoreTable";
import CardSettingsPage from "@/components/card-settings/CardSettingsPage";
import DatabasePage from "@/components/database/DatabasePage";
import DebugPage from "@/components/debug/DebugPage";
import EventCounterPage from "@/components/event-counter/EventCounterPage";
import HelpPage from "@/components/help/HelpPage";
import HomePage from "@/components/home/HomePage";
import OwnershipPage from "@/components/ownership/OwnershipPage";

/** プロデュース計算機のメイン（/calc）以外のページ（共通の余白＋見出しで包む） */
const PAGES: { path: string; title: string; element: React.ReactNode }[] = [
  { path: "/support", title: "所持状況入力", element: <OwnershipPage /> },
  {
    path: "/card-import",
    title: "画面キャプチャで所持入力（β）",
    element: <CardImportPage />,
  },
  {
    path: "/ability-counts",
    title: "発動回数",
    element: <AbilityCountManager />,
  },
  {
    path: "/card-settings",
    title: "サポカ設定",
    element: <CardSettingsPage />,
  },
  { path: "/card-scores", title: "サポカ点数表", element: <CardScoreTable /> },
  { path: "/database", title: "サポカDB", element: <DatabasePage /> },
  { path: "/help", title: "ヘルプ", element: <HelpPage /> },
  { path: "/debug", title: "デバッグ", element: <DebugPage /> },
];

/** ページ遷移時にスクロールを先頭へ戻す（SPAでは自動で戻らないため） */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  // ホーム（/）とイベントカウンターは計算機のナビバーを出さない
  // （別ツール。イベントカウンターは自前のヘッダーを持つ）
  const { pathname } = useLocation();
  const standalone = pathname === "/" || pathname === "/event-counter";
  return (
    <>
      <ScrollToTop />
      {!standalone && <NavBar />}
      <div className="flex-1">
        <Routes>
          {/* ホーム: ツールの入口 */}
          <Route path="/" element={<HomePage />} />
          {/* イベントカウンター（開発中・独立ツール） */}
          <Route path="/event-counter" element={<EventCounterPage />} />
          {/* プロデュース計算機のメイン */}
          <Route
            path="/calc"
            element={
              <main className="mx-auto max-w-7xl px-4 py-4">
                {/* 見出しはヘルプボタンと同じ行に置くため CalcPage 側で描画 */}
                <CalcPage />
              </main>
            }
          />
          {PAGES.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <main className="mx-auto max-w-7xl px-4 py-4">
                  <h1 className="mb-3 text-xl font-bold text-slate-900">
                    {page.title}
                  </h1>
                  {page.element}
                </main>
              }
            />
          ))}
        </Routes>
      </div>
    </>
  );
}
