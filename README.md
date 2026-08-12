# 学マス計算ツール

Vite + React + React Router + Tailwind v4 の SPA。
Cloudflare Workers 1つで **SPA配信 + マスタ配信API + スプシ→R2同期(cron)** をまかなう。

- 本番: https://gkapps.hoppepan.com
- 計算ロジックはすべてブラウザ側（localStorage + `src/lib/`）。Worker はマスタ配信専用。

## マスタ配信のしくみ

編集は Google スプレッドシート（非公開）だけで行い、フロントは絶対にスプシを直接読まない。
スプシ → R2 に JSON を同期し、フロントは Worker 経由の JSON だけを読む。

```
[Google スプレッドシート]（非公開・編集用）
        │  Sheets API values:batchGet（サービスアカウント認証）
        ▼
[Worker: scheduled(cron) / POST /api/sync]  ← 5分ごと自動 + 手動トリガー
        │  タブごとに JSON 化して put
        ▼
[R2 バケット gakumas-master（非公開）]  master/<タブ>.json + master/_index.json
        │  バインド経由で get（r2.dev は使わない）
        ▼
[Worker: GET /api/master(?name=xxx)]  Cache-Control: max-age=300
        ▼
[React（src/useMaster.js）]
```

R2 を使う理由: 全ユーザー共通の参照データを丸ごと配るだけ（実質ファイル配信）で、
絞り込み・結合・行更新・RLS などの DB 機能が不要。D1 の行数制限や
Supabase の「7日無活動で一時停止」とも無縁。R2 は egress 無料。

## 構成

```
worker/
  index.js          Worker本体: SPA配信 + /api/master + /api/sync + cron(scheduled)
  lib/google-auth.js サービスアカウントで access_token 取得（Web Crypto で RS256 自前署名）
  lib/sync.js        スプシ → R2 同期（batchGet → JSON化 → put、空タブは上書きしない）
wrangler.toml       Worker設定（R2バインド・cron・assets・vars）
src/
  useMaster.js      useMaster(name) / useMasterIndex() フック
  ...               計算ツール本体
```

## API

| メソッド・パス | 内容 |
|---|---|
| `GET /api/master` | 利用可能タブ一覧 `{tabs, updatedAt}` |
| `GET /api/master?name=xxx` | タブ `xxx` のオブジェクト配列（`^[A-Za-z0-9_-]+$` 検証・max-age=300） |
| `POST /api/sync` | `x-sync-token: <SYNC_SECRET>` 一致で同期実行 |
| その他のGET | SPA（`dist/`。未マッチは index.html） |

JSON は各タブの先頭行をキーにしたオブジェクト配列。数値は数値のまま
（`valueRenderOption=UNFORMATTED_VALUE`）。空ヘッダー列は出力せず、全セル空の行は捨てる。

## デプロイ / 再デプロイ

前提: Cloudflare に `wrangler login` 済み、R2 バケット `gakumas-master` 作成済み。

```bash
npm run build            # dist/ を生成（wrangler.toml の [assets] が配信）
npx wrangler deploy      # Worker をデプロイ（R2バインド・cron・assets 込み）
```

秘密は一度だけ設定（値は入力・ここには残さない）:

```bash
npx wrangler secret put GS_CLIENT_EMAIL   # サービスアカウントのメール
npx wrangler secret put GS_PRIVATE_KEY    # サービスアカウントの秘密鍵(PEM全文)
npx wrangler secret put SYNC_SECRET       # /api/sync 保護用の任意の長い文字列
```

秘密でない `SHEET_ID` / `SHEET_TABS` は `wrangler.toml` の `[vars]` にある。
同期するタブを増減するときは `SHEET_TABS` を編集する。

### 必要な設定値

| 名前 | 種別 | 内容 |
|---|---|---|
| `SHEET_ID` | vars | スプシID（URLの `/d/` と `/edit` の間） |
| `SHEET_TABS` | vars | 同期するタブ名のカンマ区切り |
| `GS_CLIENT_EMAIL` | secret | サービスアカウントのメール |
| `GS_PRIVATE_KEY` | secret | サービスアカウントの秘密鍵(PEM)。`\n` 文字列のままでも可 |
| `SYNC_SECRET` | secret | `/api/sync` 保護用トークン |
| `MASTER_BUCKET` | R2バインド | バケット `gakumas-master` |

## 動作確認

```bash
# 手動で同期（初回や即時反映したいとき）
curl -X POST -H "x-sync-token: <SYNC_SECRET>" https://gkapps.hoppepan.com/api/sync
# → {"synced":[{"tab":"supMaster","rows":193},...],"skipped":[],...}

curl https://gkapps.hoppepan.com/api/master
curl "https://gkapps.hoppepan.com/api/master?name=supMaster"
```

ローカルは `npx wrangler dev`（R2/cron/secret 込みで Worker を再現）。
secret は `.dev.vars`（gitignore 済み）に `KEY=値` で書く。`.dev.vars.example` を参照。
※ `npm run dev`（vite）は SPA だけで `/api/*` は動かない。

## フロントでの使用例

```jsx
import { useMaster, useMasterIndex } from "./useMaster";

function SupportCardList() {
  const { data, loading, error } = useMaster("supMaster");
  if (loading) return <p>読み込み中…</p>;
  if (error) return <p>取得に失敗: {String(error)}</p>;
  return <ul>{data.map((row) => <li key={row.id}>{row.name}（{row.rarity}）</li>)}</ul>;
}
```

※ 現状フロントはビルド時同梱の `src/data/generated/*.json` を使っている。
`/api/master`（R2由来）へ切り替えるのは今後の作業。

## 無料枠の要点

- **Workers**: 10万リクエスト/日、Cron Trigger 追加課金なし。5分ごと=288回/日で余裕。
  `/api/master` は max-age=300 でキャッシュも効く。
- **R2**: 10GB・Class A 100万/月・Class B 1000万/月。JSON数個の put/get は誤差。egress 無料。
- **Sheets API**: 読み取り 300回/分。batchGet で全タブ1回なので余裕。

## ハマりどころ

- サービスアカウントにスプシを「閲覧者」で共有し忘れると Sheets API が 403。
- `GS_PRIVATE_KEY` は PEM ヘッダー/フッターごと全文。改行が `\n` 文字列でも動く。
- R2 バケットは公開しない（バインド経由でのみ読む）。
- 同期に失敗したタブは R2 を上書きしない（正常データ保護）。`/api/sync` の `skipped` で確認。
