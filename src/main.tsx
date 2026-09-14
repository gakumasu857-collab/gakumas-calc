import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./globals.css";

// 開発時だけ: ヘルプページ用のスクリーンショット作成に使う（画像に出力と同じライブラリを window に出す）。
// 使い方: ブラウザのコンソールで await window.__shot.domToWebp(el) → fetch("/__shot", ...)（vite.config.ts）
if (import.meta.env.DEV) {
  import("modern-screenshot").then((m) => {
    (window as unknown as { __shot: typeof m }).__shot = m;
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
