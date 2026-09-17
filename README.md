# ほぺマス（学マス育成・評価値計算の非公式ツール）

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
[Worker: scheduled(cron) / POST /api/sync]  ← gen:all 前の手動同期 + 毎日3時(JST)の保険cron
        │  タブごとに JSON 化して put
        ▼
[R2 バケット gakumas-master（非公開）]  master/<タブ>.json + master/_index.json
        │  バインド経由で get（r2.dev は使わない）
        ▼
[Worker: GET /api/master(?name=xxx)]  Cache-Control: max-age=300
        ▼
[React（ビルド時同梱の generated/*.json）]
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

## アップデート手順まとめ（チートシート）

大原則: **フロントはビルド時に JSON を同梱している**ので、スプシや画像を
どう変えても、サイトに反映するには最後に `gen → build → deploy` が要る。
まとめて1コマンドなら:

```bash
npm run gen:all && npm run release
```

**コマンドを打ちたくないとき（ダブルクリック用）**: プロジェクト直下の

- `release.cmd` … コードだけ反映（build → deploy）
- `update-all.cmd` … 画像同期 → スプシ同期＋全データ再生成 → build → deploy のフルコース
- `dev.cmd` … ローカル確認用。開発サーバーを起動してブラウザで http://localhost:5173 を開く（何も配信しない。窓を閉じると止まる）

をエクスプローラーでダブルクリックするだけでよい（黒い窓が開いて進捗が出る。終わったら何かキーで閉じる）。
デスクトップに「ショートカットの作成」で置いておくと楽。

（gen:all = スプシ→R2同期＋全データ再生成 / release = build＋deploy。合計2分弱）

スプシ→R2 の同期は `.env.local` に `SYNC_SECRET` があれば gen:all が即時に打つ。
未設定の場合はスキップされ、毎日3時(JST)の cron 同期を待ってから gen することになる
（＝スプシ編集直後に反映したいなら SYNC_SECRET を設定しておくのが楽）。

| 編集したもの | やること |
|---|---|
| スプシの数値だけ（サポカDB / abilityValues / 発動回数 / Pアイドル / 成長タグ） | `npm run gen:all` → `npm run release` |
| 新カード・新Pアイドルの追加（フルコース） | ①スプシに行追加 ②画像をドライブに置いて `npm run sync:images`（またはR2へ直接アップ） ③`npm run gen:all` → `npm run release` |
| 画像の追加（ドライブに置いた場合） | ①ドライブの画像フォルダにPNG/JPGを置く ②`npm run sync:images`（webp変換→R2アップまで自動） ③スプシに行/語を追記 ④`npm run gen:all` → `npm run release` |
| サポカ画像の追加（R2直接） | ①スプシに行追加 ②R2 `gakumas-image` 直下に `<カード名>.webp` をアップ ③`npm run gen:all` → `npm run release` |
| 前イベ画像の追加（R2直接） | ①R2 `preEvent/<前イベ名>.webp` にアップ（スプシの「前イベ名」と同じ名前） ②`npm run gen:all` → `npm run release` |
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
- **画像を上げた直後に「無い」と判定されるとき**: Cloudflare は 404 も数分キャッシュするため、
  アップ直後は古い「無い」応答が返ることがある。スクリプト側は実行ごとに一意なクエリを付けて
  キャッシュを素通りさせている（2026-08〜）ので通常は起きないが、ブラウザで見て無いときは数分待つか
  スーパーリロードする。なお **ドライブに置いただけでは何も起きない**（`sync:images` を実行して初めてR2に上がる）
- **画像が無いカードがあってもリリースは可能**（画像照合の対象外になるだけ。gen:sprite が一覧を出す）
- `npm run gen:all` = スプシ→R2同期（`.env.local` の `SYNC_SECRET` を使用。未設定ならスキップ）＋全gen（1分弱。どれか1つでもよい）＋`check:labels`（スプシの名前がコードに登録済みかの確認。未登録があれば止まる）
- スプシ→R2の定期同期cronは毎日3時(JST)の保険のみに変更（gen:all が同期を打つので通常は不要）
- `npm run release` = `npm run build && wrangler deploy`
- **git commit は配信には不要**（配信は wrangler deploy のみで決まる）。ただしバックアップ・巻き戻し用に、反映がうまくいったら `git add -A && git commit` を推奨
- R2 へ手動アップの例: `npx wrangler r2 object put "gakumas-image/<カード名>.webp" --file <ファイル> --content-type image/webp --remote`
- 取得元を変えたいとき: 環境変数 `GAKUMAS_IMAGE_BASE`（既定はR2公開URL）

## スプシの構造を変えたときに直す場所（コード側）

数値の変更・行の追加・新カードは `npm run gen:all`（または update-all.cmd）だけで反映される。
**列名・アビリティ名・イベントの種類など「構造」を変えたときは、次のコードも直す**:

| スプシで変えたもの | 直すファイル | 何を直すか |
|---|---|---|
| supMaster の列名・列の追加/削除 | `src/data/supportCardsDb.ts` | `HEADER_ALIASES`（日本語ヘッダー→内部キー）と `convert()`（列から `SupportCardData` を組み立てる部分） |
| 新しいアビリティ名（カードの n アビ / abilityValues の行） | `src/data/constants.ts` → `src/data/abilityCounts.ts` | `ABILITY_NAMES` にキーとラベルを追加（表記ゆれは `ABILITY_LABEL_ALIASES`）。発動回数の分類（`CATEGORIES`）にキーを追加。未登録だと回数が結び付かず点数0になる（gen:perf が「perf に無い」警告を出す） |
| 発動回数タブ（abilityCounts*）の行名 | `src/data/constants.ts` | ラベルが `ABILITY_NAMES` と一致すればそのまま通る。違う表記は `ABILITY_LABEL_ALIASES` に追記 |
| スケジュールタブ（schedule*）の中身 | 直すところ無し（スプシだけでよい） | プロデュースごとの「どの週（日）に何を踏むか」。セルは お出かけ／相談／差し入れ（初は活動支給）／特別指導／休む・空欄。列は発動回数タブと同じ並びにする。おかしいと `gen:counts` が場所を名指しして止まる。お出かけ・相談・差し入れ・特別指導・休むの回数はこのタブから数えるので、発動回数タブの同じ5行はテンプレでは使われない |
| アビリティ名・前イベ起動タグの改名（例: 基本チェンジ→基本スキルチェンジ） | `src/data/constants.ts` | `ABILITY_NAMES` の日本語名を書き換えるだけ（内部キーは変えない）。直さないと該当アビリティが点数0になる。`gen:all` 末尾の `check:labels` が未登録の名前を列挙して止まる。詳細は docs/ARCHITECTURE.md 4-1 C-2 |
| 「〜(N回まで)」のような上限違いの派生アビリティ | `src/data/abilityCounts.ts` | `DERIVED_CAPS`（基の回数から上限付きの回数を作る） |
| アビリティの値の意味（率で補正する等） | `src/lib/sheetScore.ts` | `abilitySlotValue()`（枠の値の解釈）、`cardResources()`（Pポイント・回復・体力） |
| 前イベ・後イベ・ステイベの種類や列 | `src/data/supportCardsDb.ts` → `src/lib/sheetScore.ts` → `src/components/EventControls.tsx` | `LATER_EVENT_MAP`／前イベ列の判定／`statEventType`、`eventCountContributionSplit()`（回数への反映）、画面の〇✕・A/M・任意スキルのUI |
| pidleName / pidleStatus / idleTypes（Pアイドル） | `scripts/generatePIdols.mjs`、`src/lib/pIdol.ts` | 列の読み取りと `P_IDOL_MASTERS`／`IDOL_RANKS` の組み立て |
| abilityValues のティア表（枠ごとの段階） | `src/data/abilityValues.ts`（`SLOT_TIER`）、`scripts/generateAbilityPerf.mjs` | レアリティ別の枠×凸→ティアの対応 |
| 同期するタブを増減 | `wrangler.toml` の `SHEET_TABS`、`scripts/*.mjs` | タブ名を追加し、読む側のスクリプトを用意 |

迷ったら「どの列/行を、どう変えたか」を Claude に伝えれば該当箇所を直す。

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
# → {"synced":[{"tab":"supMaster","rows":202},...],"skipped":[],...}

curl https://gkapps.hoppepan.com/api/master
curl "https://gkapps.hoppepan.com/api/master?name=supMaster"
```

ローカルは `npx wrangler dev`（R2/cron/secret 込みで Worker を再現）。
secret は `.dev.vars`（gitignore 済み）に `KEY=値` で書く。`.dev.vars.example` を参照。
※ `npm run dev`（vite）は SPA だけで `/api/*` は動かない。

## フロントのデータ取得

フロントはビルド時同梱の `src/data/generated/*.json` を使っている（実行時に /api/master は呼ばない）。
そのため、スプシを変えたら gen → build → deploy（update-all.cmd）で反映する。

## 無料枠の要点

- **Workers**: 10万リクエスト/日、Cron Trigger 追加課金なし（現在は日次1回）。
  `/api/master` は max-age=300 でキャッシュも効く。
- **R2**: 10GB・Class A 100万/月・Class B 1000万/月。JSON数個の put/get は誤差。egress 無料。
- **Sheets API**: 読み取り 300回/分。batchGet で全タブ1回なので余裕。

## ハマりどころ

- サービスアカウントにスプシを「閲覧者」で共有し忘れると Sheets API が 403。
- `GS_PRIVATE_KEY` は PEM ヘッダー/フッターごと全文。改行が `\n` 文字列でも動く。
- R2 バケットは公開しない（バインド経由でのみ読む）。
- 同期に失敗したタブは R2 を上書きしない（正常データ保護）。`/api/sync` の `skipped` で確認。
