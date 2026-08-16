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

## 自分の編集を反映する手順（チートシート）

「スプシ→R2」は cron が5分ごとに自動同期するが、**フロントはビルド時に
JSON を同梱している**ので、サイトに反映するには gen → build → deploy が必要。

| 編集したもの | やること |
|---|---|
| スプシ（サポカDB / abilityValues / 発動回数 / Pアイドル） | `npm run gen:all` → `npm run release` |
| 画像の追加（ドライブに置いた場合） | ①ドライブの画像フォルダにPNG/JPGを置く ②`npm run sync:images`（webp変換→R2アップまで自動） ③スプシに行/語を追記 ④`npm run gen:all` → `npm run release` |
| サポカ画像の追加（R2直接） | ①スプシに行追加 ②R2 `gakumas-image` 直下に `<カード名>.webp` をアップ ③`npm run gen:all` → `npm run release` |
| 前イベ画像の追加（R2直接） | ①R2 `preEvent/<前イベ名>.webp` にアップ ②スプシの Search_word に前イベ名（`,`区切り） ③`npm run gen:all` → `npm run release` |
| Pアイドル画像の追加 | ドライブ経由なら `sync:images`、直接なら R2 `skill/<固有スキル名>.webp` にアップ（gen不要・即反映） |
| コード（.ts/.tsx） | `npm run release` |

- **`npm run sync:images`** = ドライブの画像フォルダをR2へ同期（PNG→webp変換込み。R2に無いものだけアップ、`npm run sync:images -- --force` で全上書き）。初回設定は下の詳細を参照

### sync:images の初回設定（詳細・1回だけ）

1. **サービスアカウントのJSON鍵を置く**
   [Google Cloud Console](https://console.cloud.google.com/) → スプシ同期で使っているプロジェクト →
   「IAMと管理」→「サービスアカウント」→ 対象アカウント →「キー」タブ →
   「鍵を追加」→「新しい鍵を作成」→ JSON でダウンロード。
   ファイルをプロジェクト直下に **`service-account.json`** という名前で置く（gitignore済みでコミットされない）。
2. **Google Drive API を有効化**
   同じプロジェクトの「APIとサービス」→「ライブラリ」→「Google Drive API」→「有効にする」
   （Sheets APIとは別物。これをやらないと一覧取得が403になる）。
3. **ドライブのフォルダをサービスアカウントに共有**
   ドライブで画像フォルダを右クリック → 共有 → サービスアカウントのメール
   （`…@….iam.gserviceaccount.com`、service-account.json の client_email）を「閲覧者」で追加。
   カテゴリごとに別フォルダが必要（サポカ用・前イベ用・Pアイドル用。1つに混在は不可）。
4. **フォルダIDを `.env.local` に書く**
   ブラウザでフォルダを開いたときのURL `…/folders/XXXXX` の XXXXX がID。同期したいものだけでよい:
   ```
   DRIVE_FOLDER_CARDS=XXXXX      # サポカ画像 → R2直下 <カード名>.webp
   DRIVE_FOLDER_PREEVENTS=XXXXX  # 前イベ画像 → preEvent/<前イベ名>.webp
   DRIVE_FOLDER_SKILLS=XXXXX     # Pアイドル固有スキル画像 → skill/<固有スキル名>.webp
   ```
5. 以後は **ドライブにPNG/JPGを置いて `npm run sync:images`** だけ。
   ファイル名（拡張子を除く）がそのままR2のキー名になるので、
   **スプシのカード名/前イベ名/固有スキル名と完全一致**させること（全角半角・記号・スペースも）。
   画像を差し替えたいときは `npm run sync:images -- --force`。
- **画像はローカルフォルダ不要**（gen:sprite / gen:preevents はR2の公開URLから直接取得する）
- `npm run gen:all` = スプシ→R2同期（`.env.local` の `SYNC_SECRET` を使用。未設定ならスキップ）＋全gen（1分弱。どれか1つでもよい）
- スプシ→R2の定期同期cronは毎日3時(JST)の保険のみに変更（gen:all が同期を打つので通常は不要）
- `npm run release` = `npm run build && wrangler deploy`
- **git commit は配信には不要**（配信は wrangler deploy のみで決まる）。ただしバックアップ・巻き戻し用に、反映がうまくいったら `git add -A && git commit` を推奨
- R2 へ手動アップの例: `npx wrangler r2 object put "gakumas-image/<カード名>.webp" --file <ファイル> --content-type image/webp --remote`
- 取得元を変えたいとき: 環境変数 `GAKUMAS_IMAGE_BASE`（既定はR2公開URL）

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
