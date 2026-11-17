import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { preparePortal } from "./lib/portalLink";
import "./globals.css";

// ハイ元クロスポータルと連携している人だけ、ポータルの最新を読んでから表示する（それ以外の人はすぐ表示）
preparePortal().finally(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
));
