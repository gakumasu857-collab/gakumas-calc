# プロジェクト構成メモ

Vite + React 19 + React Router + Tailwind CSS v4 + TypeScript の SPA（2026-07 に Next.js から移行済み）。

- `npm run dev` で開発サーバー、`npm run build` で `dist/` に静的ビルド（Cloudflare Pages にデプロイ）。
- ルーティングは `src/App.tsx` の PAGES 配列。ページ実体は `src/components/` 配下。
- 環境変数は `VITE_` プレフィックス（`import.meta.env.VITE_IMAGE_BASE_URL`）。
- 計算はすべてブラウザ側で完結（localStorage ストア群 + `src/lib/`）。サーバー機能なし。
