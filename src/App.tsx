import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import NavBar from "@/components/NavBar";
import StatusBar from "@/components/StatusBar";
import AbilityCountManager from "@/components/ability-counts/AbilityCountManager";
import CalcPage from "@/components/calc/CalcPage";
import CardScoreTable from "@/components/card-scores/CardScoreTable";
import CardSettingsPage from "@/components/card-settings/CardSettingsPage";
import DatabasePage from "@/components/database/DatabasePage";
import DebugPage from "@/components/debug/DebugPage";
import MemoryManager from "@/components/memory-manager/MemoryManager";
import OwnershipPage from "@/components/ownership/OwnershipPage";

/** メイン（/=計算ページ）以外のページ（共通の余白＋見出しで包む） */
const PAGES: { path: string; title: string; element: React.ReactNode }[] = [
  { path: "/support", title: "所持状況入力", element: <OwnershipPage /> },
  { path: "/memory", title: "メモリー設定", element: <MemoryManager /> },
  {
    path: "/ability-counts",
    title: "アビリティ発動回数",
    element: <AbilityCountManager />,
  },
  {
    path: "/card-settings",
    title: "サポカ設定",
    element: <CardSettingsPage />,
  },
  { path: "/card-scores", title: "サポカ点数表", element: <CardScoreTable /> },
  { path: "/database", title: "データベース", element: <DatabasePage /> },
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
  return (
    <>
      <ScrollToTop />
      <NavBar />
      {/* 下部のステータスバーに隠れないよう余白を確保 */}
      <div className="flex-1 pb-20">
        <Routes>
          {/* メインは計算ページ */}
          <Route
            path="/"
            element={
              <main className="mx-auto max-w-7xl px-4 py-4">
                <h1 className="mb-3 text-xl font-bold text-slate-900">
                  計算ページ
                </h1>
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
      <StatusBar />
    </>
  );
}
