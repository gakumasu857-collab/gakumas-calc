# プロジェクト構成メモ

Vite + React 19 + React Router + Tailwind CSS v4 + TypeScript の SPA（2026-07 に Next.js から移行済み）。

- `npm run dev` で開発サーバー、`npm run build` で `dist/` に静的ビルド。
- ルーティングは `src/App.tsx` の PAGES 配列。ページ実体は `src/components/` 配下。
- 環境変数は `VITE_` プレフィックス（`import.meta.env.VITE_IMAGE_BASE_URL`）。
- 計算はすべてブラウザ側で完結（localStorage ストア群 + `src/lib/`）。
- デプロイは Cloudflare Workers 1つ（`worker/index.js` + `wrangler.toml`）。
  SPA配信 + マスタ配信API(`/api/master`,`/api/sync`) + スプシ→R2同期(cron) をまかなう。
  本番 https://gkapps.hoppepan.com 。詳細は README.md。
- マスタは Google スプシ(非公開) → R2 バケット `gakumas-master` に同期して配信。
  フロントはビルド時同梱の `src/data/generated/*.json` を使用（反映は update-all.cmd）。
- 仕組みと修正箇所の解説: docs/ARCHITECTURE.md
- 自動探索のしくみ（非エンジニア向けのやさしい説明）: docs/SEARCH_GUIDE.md
