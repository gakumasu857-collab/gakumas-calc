# 学マス計算ツール

Vite + React の SPA（Cloudflare Pages でホスティング）。
このリポジトリには、マスタデータを Google スプレッドシートから Cloudflare R2 へ同期して
サイトに配信する仕組みが含まれる。以下はその仕組みのドキュメント。

## 全体像

```
[Google スプレッドシート]  ←編集はここだけ（非公開）
        │  Sheets API (values:batchGet / サービスアカウント認証)
        ▼
[Pages Functions /api/sync]  ←POST + x-sync-token で保護
        │  タブごとに JSON 化して put
        ▼
[R2 バケット (非公開)]  master/<タブ名>.json + master/_index.json
        │  バインディング経由で get（r2.dev は使わない）
        ▼
[Pages Functions /api/master]  ←Cache-Control: max-age=300
        │
        ▼
[React (useMaster フック)]

[Cron Worker (master-sync-cron)] ──5分ごとに /api/sync を POST──▶ 同期起動
```

- スプレッドシートは編集専用。フロントは絶対にスプシを直接読まない。
- R2 を選んだ理由: 全ユーザー共通の参照データを丸ごと配るだけ（実質ファイル配信）で、
  絞り込み・結合・行更新・RLS などの DB 機能が不要。D1 の行数制限や
  Supabase の「7日無活動で一時停止」とも無縁。R2 は egress 無料。
- R2 バケットは非公開のまま、Functions のバインディング経由でのみ読む
  （r2.dev の本番レート制限を回避、独自ドメイン不要）。

## ファイル構成

```
functions/
  _lib/google-auth.js   サービスアカウントで access_token 取得（Web Crypto で RS256 署名）
  _lib/sync.js          スプシ → R2 同期の本体（batchGet → JSON 化 → put）
  api/master.js         GET  /api/master(?name=xxx)  フロント向け読み取り
  api/sync.js           POST /api/sync               保護された同期トリガー
cron-worker/
  src/index.js          Cron から /api/sync を叩く別 Worker
  wrangler.toml         Cron 設定（5分ごと）
src/
  useMaster.js          useMaster(name) / useMasterIndex() React フック
```

## セットアップ手順

### 1. Google 側（サービスアカウント）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（無料）。
2. 「API とサービス」→「ライブラリ」で **Google Sheets API を有効化**。
3. 「認証情報」→「サービスアカウント」を作成 → キー（JSON）を発行してダウンロード。
4. JSON 内の `client_email` と `private_key` を後述の環境変数に使う。
5. **対象スプレッドシートをサービスアカウントのメールアドレスに「閲覧者」で共有する。**
   ここを忘れると Sheets API が 403 になる（最頻のハマりどころ）。

### 2. R2 バケット

1. Cloudflare ダッシュボード → R2 → バケット作成（例: `gakumas-master`）。
2. **公開設定はしない**（r2.dev ドメインも独自ドメインも繋がない）。

### 3. Cloudflare Pages

1. このリポジトリを Pages に接続（ビルド: `npm run build`、出力: `dist`）。
   `functions/` ディレクトリは自動で Pages Functions として認識される。
2. 「設定」→「バインディング」で R2 バケットをバインドする:
   - 変数名: `MASTER_BUCKET` / バケット: 手順2で作ったもの
3. 「設定」→「環境変数」で以下を設定（Production。秘密のものは Secret として）:

| 変数名 | 内容 | 例 |
|---|---|---|
| `SHEET_ID` | スプシの ID（URL の `/d/` と `/edit` の間） | `1Hcl8izr...` |
| `SHEET_TABS` | 同期するタブ名（カンマ区切り） | `supMaster,abilityValues,pidleName,pidleStatus,idleTypes,abilityCountsHIF,abilityCountsNIA,abilityCountsHajime,abilityEvolutions` |
| `GS_CLIENT_EMAIL` | サービスアカウントのメール | `xxx@yyy.iam.gserviceaccount.com` |
| `GS_PRIVATE_KEY` | サービスアカウントの秘密鍵（PEM 全文・Secret） | `-----BEGIN PRIVATE KEY-----\n...` |
| `SYNC_SECRET` | 同期トリガー保護用の任意の長い文字列（Secret） | ランダム文字列 |

   `GS_PRIVATE_KEY` は改行が `\n` という文字列のまま貼り付けても動く
   （コード側で実改行に戻している）。

### 4. Cron Worker

```bash
cd cron-worker
npx wrangler secret put SYNC_ENDPOINT   # https://<プロジェクト>.pages.dev/api/sync
npx wrangler secret put SYNC_SECRET     # Pages 側と同じ値
npx wrangler deploy
```

デフォルトは5分ごと。間隔は `cron-worker/wrangler.toml` の `crons` を編集する。

## 動作確認

```bash
# 1. 手動で同期を起動（初回はこれで R2 に JSON が入る）
curl -X POST -H "x-sync-token: <SYNC_SECRET>" https://<プロジェクト>.pages.dev/api/sync
# → {"synced":[{"tab":"supMaster","rows":193},...],"skipped":[],...}

# 2. 一覧を確認
curl https://<プロジェクト>.pages.dev/api/master
# → {"tabs":["supMaster",...],"updatedAt":"..."}

# 3. 個別マスタを確認
curl "https://<プロジェクト>.pages.dev/api/master?name=supMaster"

# 4. Cron Worker の手動起動（fetch ハンドラ）
curl https://master-sync-cron.<アカウント>.workers.dev/
```

ローカル確認は `wrangler pages dev` を使う（**`npm run dev`（vite）では
Pages Functions が動かない**ので /api/... は 404 になる）:

```bash
npm run build
npx wrangler pages dev dist --r2 MASTER_BUCKET   # 環境変数は --binding で渡す
```

## フロントでの使用例

```jsx
import { useMaster, useMasterIndex } from "./useMaster";

function SupportCardList() {
  const { data, loading, error } = useMaster("supMaster");
  if (loading) return <p>読み込み中…</p>;
  if (error) return <p>取得に失敗: {String(error)}</p>;
  return (
    <ul>
      {data.map((row) => (
        <li key={row.id}>{row.name}（{row.rarity}）</li>
      ))}
    </ul>
  );
}

function MasterList() {
  const { data } = useMasterIndex();
  return <p>利用可能: {data?.tabs.join(", ")}（更新 {data?.updatedAt}）</p>;
}
```

JSON の形式: 各タブの先頭行がキーになったオブジェクト配列。
数値セルは数値のまま入る（`valueRenderOption=UNFORMATTED_VALUE`）。
空のヘッダー列は出力されず、全セル空の行はスキップされる。

## 無料枠の要点

- **Pages Functions**: 10万リクエスト/日。`/api/master` は max-age=300 の
  キャッシュが効くので実リクエストはさらに少ない。
- **R2**: ストレージ 10GB・Class A 100万回/月・Class B 1000万回/月。
  マスタ JSON 数個の put/get では誤差レベル。**egress は無料**。
- **Workers (Cron)**: 10万リクエスト/日・Cron Trigger は追加課金なし。
  5分ごと = 288回/日で余裕。
- **Sheets API**: 読み取り 300回/分/プロジェクト。batchGet で全タブ1回なので
  5分ごとでも 288回/日と余裕。

## ハマりどころ（再掲）

- `GS_PRIVATE_KEY` の改行: `\n` が文字列のまま入っても動くようにしてあるが、
  PEM のヘッダー/フッターごと全文を貼ること。
- サービスアカウントにスプシを共有し忘れると 403。
- R2 バケットは公開しない（バインディング経由でのみ読む）。
- 同期が失敗したタブは R2 を上書きしない（正常データ保護）。失敗が続くときは
  `/api/sync` のレスポンスの `skipped` を確認する。
