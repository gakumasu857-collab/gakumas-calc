# ほぺマス 仕組みと修正箇所の解説（オーナー向け）

このファイルは、サイト「ほぺマス」（https://gkapps.hoppepan.com）が **どう動いているか** と、
**スプレッドシートを変えたときにどこを直せばよいか** を、プログラムを読まない人向けにまとめたものです。
コマンドの打ち方や初回設定は `README.md` にもあります。この文書は「仕組みの理解」と「修正箇所の地図」が目的です。

- 文中の `src/lib/sheetScore.ts` のような表記は、このプロジェクトのフォルダの中のファイルの場所です。
- 「関数名」「定数名」は、ファイルの中で探すときの目印（検索ワード）だと思ってください。
  例: `HEADER_ALIASES` と書いてあれば、そのファイルを開いて `HEADER_ALIASES` で検索すれば該当箇所に着きます。
- 直し方が分からないときは「どのタブの・どの列（行）を・どう変えたか」を Claude に伝えれば、該当箇所を直せます。

---

## 1. 全体像（データがサイトに届くまで）

### 1-1. 流れの図

```
┌──────────────────────────────┐
│ Google スプレッドシート（非公開）  │ ← オーナーが編集する唯一の場所
└──────────────┬───────────────┘
               │ ① 同期: POST /api/sync（gen:all の先頭で自動実行）
               │         または 毎日3時(JST)の定期実行（cron）
               ▼
┌──────────────────────────────┐
│ R2 バケット gakumas-master      │ タブごとに master/<タブ名>.json として保存
└──────────────┬───────────────┘
               │ ② 取得: GET /api/master?name=<タブ名>（scripts/_sheet.mjs）
               ▼
┌──────────────────────────────┐
│ gen スクリプト（scripts/ フォルダ） │ gen:cards / gen:perf / gen:counts / gen:pidols / gen:sprite / gen:preevents
└──────────────┬───────────────┘
               │ ③ 書き出し
               ▼
┌──────────────────────────────┐
│ src/data/generated/*.json     │ アプリが読むデータ（6ファイル）
└──────────────┬───────────────┘
               │ ④ npm run build（JSON をアプリの中に焼き込む）→ dist/ フォルダ
               ▼
┌──────────────────────────────┐
│ Cloudflare Workers            │ wrangler deploy で dist/ をアップロード
│ （worker/index.js）           │ → https://gkapps.hoppepan.com で配信
└──────────────────────────────┘
```

画像は別ルートです。

```
Google ドライブの画像フォルダ ── npm run sync:images ──▶ R2 バケット gakumas-image
（PNG/JPG を置くだけ）            （webp に変換してアップロード）   （https://img.hoppepan.com で公開）
                                                                     │
        gen:sprite / gen:preevents は「R2 にどの画像があるか」を問い合わせて JSON に書く
                                                                     │
                            利用者のブラウザは img.hoppepan.com から直接画像を表示する
```

### 1-2. いちばん大事なこと

- **サイトはスプシを直接読んでいません。** ビルド（`npm run build`）のときに `src/data/generated/*.json` の中身を
  アプリに焼き込んで配っています。したがって、**スプシや画像をどう変えても、`update-all.cmd`（または
  `npm run gen:all` → `npm run release`）を実行するまでサイトには何も反映されません。**
- 計算（点数・評価値・理想編成の探索）は **すべて利用者のブラウザの中** で動きます。サーバー（Worker）は
  ファイルを配るだけで、計算も保存もしていません。利用者の入力は各自のブラウザ（localStorage）に保存されます（5章）。

### 1-3. 2つのダブルクリック用バッチの役割

| ファイル | やること | 使う場面 |
|---|---|---|
| `release.cmd` | `npm run release`（= `npm run build` → `wrangler deploy`）だけ | プログラム（.ts/.tsx）だけを直したとき。スプシ・画像は取り込まない |
| `update-all.cmd` | ①`npm run sync:images`（ドライブ→R2。未設定なら飛ばす）→ ②`npm run gen:all`（スプシ→R2 同期＋6つの gen）→ ③`npm run release` | スプシや画像を変えたとき。これ1本で全部やる（2〜3分） |
| `dev.cmd` | `npm run dev`（開発サーバー）を起動し、数秒後にブラウザで http://localhost:5173 を開く。**何も配信しない** | リリース前にローカルで動きを確かめたいとき。黒い窓を閉じると止まる |

- `npm run gen:all` の中身（`package.json` の `scripts`）:
  `sync:master` → `gen:cards` → `gen:perf` → `gen:counts` → `gen:pidols` → `gen:sprite` → `gen:preevents` → `check:labels`
  最後の `check:labels` は「スプシに出てくるアビリティ名・起動タグ・行名がコードに登録済みか」の確認で、
  未登録があれば一覧を出して止まります（`update-all.cmd` は `*** FAILED at data generation ***` で停止）。直し方は 4-1 C-2。
- `sync:master`（`scripts/syncMaster.mjs`）は `.env.local` に `SYNC_SECRET` があるときだけ Worker に「今すぐ同期して」と頼みます。
  無いと警告して飛ばし、R2 には前回（または毎日3時の cron）の内容が残ったままになります。
  つまり **スプシを編集した直後に反映したいなら `SYNC_SECRET` が必要** です（現在は設定済み）。
- バッチの中身は英数字のみで書いてあります（日本語を書くと Windows のコマンドが誤動作するため）。中を編集するときは注意してください。

### 1-4. Worker（サーバー側）が持っている機能

`worker/index.js` が 1 つで次の 3 役をこなします（`wrangler.toml` が設定ファイル）。

- 静的ファイルの配信: `dist/` の中身をそのまま配る。`/api/` 以外は Worker を起動せず直接配るので無料枠を消費しません。
- `GET /api/master?name=<タブ名>`: R2 に保存したタブの JSON を返す（gen スクリプトがこれを読む）。
- `POST /api/sync`: 合言葉（`SYNC_SECRET`）が合えばスプシ→R2 の同期を実行。cron（`wrangler.toml` の `crons = ["0 18 * * *"]` = 日本時間3時）でも同じ同期が走ります。

同期する対象タブは `wrangler.toml` の `SHEET_TABS` に列挙されています（現在 12 タブ）。

---

## 2. フォルダとファイルの地図

### 2-1. プロジェクト直下

| 場所 | 何か |
|---|---|
| `README.md` | 運用マニュアル（コマンド、初回設定、無料枠、ハマりどころ） |
| `AGENTS.md` / `CLAUDE.md` | Claude 向けのプロジェクトメモ（`CLAUDE.md` は `AGENTS.md` を読むだけ） |
| `package.json` | `npm run ○○` の一覧（gen 系・release・sync 系はここに定義） |
| `wrangler.toml` | Cloudflare Workers の設定（ドメイン、R2 のつなぎ先、cron、同期するタブ名 `SHEET_TABS`、スプシID `SHEET_ID`） |
| `.env.local`（git 管理外） | 画像の公開URL `VITE_IMAGE_BASE_URL`、ドライブのフォルダID 3つ、`SYNC_SECRET` |
| `service-account.json`（git 管理外） | Google のサービスアカウント鍵（`sync:images` がドライブを読むために使う） |
| `release.cmd` / `update-all.cmd` / `dev.cmd` | 1-3 参照 |
| `index.html` | サイトの入れ物（タイトル・説明文・アイコン指定） |
| `vite.config.ts` / `tsconfig.json` | ビルド設定（`@/` が `src/` を指す、など） |
| `dist/`（git 管理外） | ビルド結果。`wrangler deploy` がこれを配信 |
| `public/` | そのまま配信される固定ファイル（アイコン、プランのアイコン画像、キャプチャ読み取り用のスプライト画像・目印画像） |

### 2-2. `scripts/`（スプシ・画像を JSON に変換する台所）

| ファイル | 何をするか |
|---|---|
| `_env.mjs` | `.env.local` を読み込む小道具（全スクリプト共通） |
| `_sheet.mjs` | `GET /api/master?name=...` でタブを取ってくる共通関数 `fetchTab`（数値化の `num` も） |
| `syncMaster.mjs` | `POST /api/sync` を叩いてスプシ→R2 を今すぐ同期（`SYNC_SECRET` が無ければスキップ） |
| `generateSupportCards.mjs`（gen:cards） | `supMaster` タブをそのまま `generated/supportCards.json` に書く（変換はしない） |
| `generateAbilityPerf.mjs`（gen:perf） | `abilityValues`（効果量 level1〜5 と `trigger_tag`）＋`abilityEvolutions`（凸→ティア）を `generated/abilityPerf.json` に。カードが使っているのに `abilityValues` に無いアビリティを警告 |
| `generateAbilityCounts.mjs`（gen:counts） | `abilityCountsHIF/NIA/Hajime` の表（プラン行＋「アビリティ」ヘッダー行＋回数）と `scheduleHIF/NIA/Hajime` の表（週ごとに踏むもの）を `generated/abilityCounts.json` に。スケジュールは行の名前・選べる行動・プロデュースの列をアプリの定義と突き合わせ、食い違いはここで止める（黙って無視すると回数の合わないプロデュースが静かに出来るため） |
| `_sheet.mjs` / `_sheetDirect.mjs` | gen スクリプト共通のタブ取得。R2（`/api/master`）を見て、まだ無いタブだけ `service-account.json` でスプシから直接読む（同期するタブを足した直後、その Worker を本番に出す前でも gen が通るようにするため） |
| `generatePIdols.mjs`（gen:pidols） | `pidleName`（Pアイドル一覧）＋`pidleStatus`（成長段階ごとの数値）＋`idleTypes`（審査基準）を `generated/pIdols.json` に |
| `generateCardSprite.mjs`（gen:sprite） | R2 のサポカ画像を集めて `public/card-import/sprite.png`（一覧画像）と `generated/cardSprite.json`（並び順）を作る。画面キャプチャ所持入力用。画像が無いカードは一覧に出して飛ばす |
| `generatePreEventImages.mjs`（gen:preevents） | `supMaster` の「前イベ名」を候補に、R2 の `preEvent/<名前>.webp` が実在するものだけ `generated/preEventImages.json` に書く |
| `checkLabels.mjs`（check:labels） | 生成した JSON に出てくるアビリティ名・前イベ起動タグ・発動回数タブの行名・`trigger_tag` が `src/data/constants.ts` に登録済みかを確認。未登録があれば一覧を出して止まる（`gen:all` の最後に自動実行。単体は `npm run check:labels`） |
| `syncImagesFromDrive.mjs`（sync:images） | ドライブの 3 フォルダ（サポカ／前イベ／Pアイドル固有スキル）から画像を取り、webp に変換して R2 へ。既に R2 にあるものは飛ばす（`-- --force` で全部上書き） |

### 2-3. `worker/`（サーバー側）

| ファイル | 何をするか |
|---|---|
| `index.js` | 配信・`/api/master`・`/api/sync`・cron の入口（1-4 参照） |
| `lib/sync.js` | スプシの全タブを 1 回の API 呼び出しで取り、先頭行を見出しにした JSON へ変換して R2 に保存。空のタブは上書きしない。発動回数タブ 3 つとスケジュールタブ 3 つ（`GRID_TABS`）だけは見出し変換せず表のまま保存 |
| `lib/google-auth.js` | Google のサービスアカウントで認証トークンを作る（外部ライブラリなし） |

### 2-4. `src/data/`（スプシ由来のデータと、その読み替え）

| ファイル | 何をするか |
|---|---|
| `generated/supportCards.json` | supMaster の生データ（1 行 = 1 カード。列名は日本語のまま） |
| `generated/abilityPerf.json` | `perf`（「レアリティ＋アビリティ名」→ ティア別効果量と回数キー）と `slotTier`（レアリティ×枠×凸 → ティア番号） |
| `generated/abilityCounts.json` | 発動回数テンプレ（`hif` / `nia` / `hajime` ごとにセット名・プラン・行） |
| `generated/pIdols.json` | Pアイドル一覧（`masters`）、成長数値（`growth`）、審査基準（`idolRanks`） |
| `generated/cardSprite.json` / `generated/preEventImages.json` | 画像関連のカタログ（2-2 参照） |
| `supportCardsDb.ts` | **supMaster の読み替え役。** 日本語の列名を内部名に写す `HEADER_ALIASES`、1 行をカードの形に組み立てる `convert()`、後イベの語彙 `LATER_EVENT_MAP`、ステイベの種類 `STAT_EVENT_TYPES_ARRAY`、前イベの数値列 `NUMERIC_ACTION_MAP`、スキル分類列 `SKILL_FLAG_MAP` がここ。結果が `SUPPORT_CARD_DB` |
| `constants.ts` | アビリティの正式名一覧 `ABILITY_NAMES`（内部キー → 日本語名。2026-09 にレッスン系は「タイプレッスン／タイプSPレッスン／タイプ通常レッスン」、SP率は「タイプSPレッスン率／全タイプSPレッスン率」に改名。旧名は `ABILITY_LABEL_ALIASES` で受ける）、表記ゆれの受け皿 `ABILITY_LABEL_ALIASES`、日本語名からキーを引く `abilityKeyFromLabel`（括弧なしの起動タグ「チェンジ」「特別指導」は「その名前(N回まで)」の正式名に自動で結び付く）。**スプシでアビリティ名を変えたら直すのはここだけ**（4-1 C-2）。レアリティ表記 `RARITY_ALIASES`（配布SSR → EventSSR） |
| `abilityCounts.ts` | プロデュース設定ページの分類 `ABILITY_CATEGORIES`（4 分類に並ぶアビリティ）、上限計算 `abilityMax`（「(N回まで)」の N と、スケジュール上の回数の小さい方）、上限違いの派生 `DERIVED_CAPS`、テンプレセット `DEFAULT_SETS` / `NIA_DEFAULT_SETS` / `HATSU_DEFAULT_SETS` |
| `abilityValues.ts` | `SLOT_TIER`（凸→ティア表）を `abilityPerf.json` から取り出すだけ |
| `fixedAbilityCounts.ts` | 回数が変わらないアビリティの固定回数 `FIXED_ABILITY_COUNTS`（初期値=1、パラボ=1、パラメータイベント=1、SPレッスン率=1、何もなし=0、試験・オーディション終了= NIA3/初2/HIF5、レッスン系=スケジュールから自動）。内部キーで書くので、名前の改名には影響されない |
| `affection.ts` | 親愛度Lv（20以下・21〜37）。**スター性ボーナス**（Lv28 から +5% ずつ、36・37 で +50%）・**初期Pポイント**（STEP3。Lv21 から +10〜+30。H.I.F では選抜の開始時だけで本戦にはかからない）・**最大体力**（Lv22 から +1〜+2）。`starWithAffection(素の値, Lv)` が「素の値 ×(1+ボーナス) の切り捨て」。設定は `settings.affection`（全シナリオ共通。設定欄の「詳細設定」） |
| `hifBonus.ts` | H.I.Fボーナスのレベル表（Vo/Da/Vi 上昇は固定値とパラボが別のレベル。各 Lv0〜5＝固定+20L／パラボ+2L%、SPレッスン率 Lv0〜5＝+L%、本戦上限 Lv0〜6＝3000+50/80/110/140/170/200）と `hifBonusValues`。既定は全部最大（＝従来の +100/+10%/+5%/3200）。設定は `settings.hifBonus`（`{fixed:{vocal..}, pct:{..}, spRate, finalCap}`。旧形式のタイプごと1レベルは両方に読み替え）、調整は設定欄の一番下「詳細設定」→ DetailSettingsModal（親愛度と同じモーダル） |
| `niaChallenge.ts` | N.I.AのチャレンジPアイテム3枠の獲得ボーナス%（枠ごとの選択肢 5/10/15、10/15/20、5/10/15/20。既定は各枠の最大＝合計+55%）。`niaChallengeApply`（オーディションの素点に掛ける。その上に通常のパラボ）、ログの上昇幅との相互変換 `niaAuditionRise`／`niaAuditionBaseFromRise`。設定は `settings.niaChallenge`、調整は設定欄（ファン投票数の下）の NiaChallengeModal |
| `scenarios.ts` | 3 シナリオ（H.I.F / N.I.A / 初）の上限ステ `SCENARIO_CAPS`（3200/2600/3000）、N.I.A のレッスン・営業・投票換算（1 次・2 次の投票上限 12,000／17,998、最終の投票は種類別の式×1.5＝`niaFinaleVotes(score, kind)`、上限 FINALE 49,002／QUARTET 38,001）、最終オーディションのスコア→ステ式は FINALE／QUARTET の 2 種（`NIA_FINAL_STAT`、上限 `NIA_FINAL_CAPS`、`niaFinaleStat(tag, rank, score, kind)`）、初のレッスン・授業・試験換算 |
| `schedule.ts` | H.I.F の公開レッスン 8 回・授業 6 回・選抜 3 回・本戦 2 ラウンドの数値と、選抜の分配式・スター性の式、選抜の上昇ステ（パラボ抜き）とゲームのログに出る上昇幅（パラボ込み）の相互変換 `examRiseWithParabo`／`examBaseFromRise`。**選抜の式を直すときは `EXAMS`（基準値・固定・配分・★上限）／`examStar`（スコア→スター性）／`distributeExam`（スコア→ステ分配）の 3 か所（ファイル内の★コメント）。直したら `calc/PlanEditDrawer.tsx` の HifNumbers の説明文も合わせる** |
| `scheduleCalendar.ts` | 各シナリオの「何日目／何週目に何があるか」の表。お出かけ・相談・差し入れなどの最大回数の根拠。**週（日）ごとに1つ選ぶ「スケジュールの選択」**もここ（`scheduleChoiceRows`＝選択のある週の一覧、`countsFromChoices` / `abilityCountsFromChoices`＝選択→発動回数、`supplyLabel`＝画面での呼び名（H.I.F・N.I.Aは「差し入れ」、初レジェンドは「活動支給」）、`supplyPOf`＝差し入れ1回のPポイント（H.I.F 80／初 180／N.I.A は18週目から120・それより前110。ボーナス+30込み）、`supplyPFromChoices`＝選んだ差し入れの合計（H.I.Fは選抜・本戦別）、`inferChoices` / `resolveChoices`＝保存された選択があればそれが正、次にテンプレの踏み方（スプシの `scheduleXXX` タブ＝`TEMPLATE_CHOICES`）、どちらも無いセット（自分で追加したもの）だけ回数から推測（差し入れ→相談→お出かけ→特別指導の順に前の週から埋める `INFER_PRIORITY`）、`restFromChoices`＝**何も踏まない週（日）の数＝「休む」の回数**（ゲームではレッスン・授業の踏み忘れも休むになるが、探索は全部踏む前提なので数えない。オーナー指定 2026-09-18）、`choiceShortfall`＝推測が昔の回数に届かなかった分（画面の注意書き）） |
| `supportCardCatalog.ts` | 所持状況ページ向けの一覧（画像は `<カード名>.webp` で解決） |
| `cardReadings.json` | カード名の読み仮名（手作業で管理。検索でひらがな入力を効かせるため。無くても名前・検索ワードでは引ける） |

### 2-5. `src/lib/`（計算・探索・保存）

計算の中心です。

| ファイル | 何をするか |
|---|---|
| `sheetScore.ts` | **サポカ 1 枚の点数。** 効果量×発動回数の合計 `sheetScore`、内訳 `sheetScoreBreakdown`、パラボの%→固定値 `paraboConvert`（合算%を獲得ごとに切り捨て）、カード1枚のパラボの期待値 `paraboExpected`（切り捨て前。点数を「パラボ以外」と「パラボ」に分ける `sheetScoreSplit`）、発動回数の引き方 `buildCountResolver`、前イベの起動タグ `resolveTriggerCount`（「VocalSPレッスン」＝そのタイプ、「タイプSPレッスン」＝そのカードのタイプ、「SPレッスン」＝全タイプの合算）、前イベ・後イベが編成全体の回数を増やす分 `eventCountContributionSplit`、イベント値「基本値×(1+率)」`eventValue` / `abilitySlotValue`、Pポイント・回復の集計 `cardResources`、SP率 `cardSpRate` |
| `sheetContext.ts` | H.I.F の踏み方から「計算に必要な材料」（レッスン回数・パラボの母数）を組み立てる `buildSheetScoreContext`。タイプと内部ロールの対応（Vo=メイン1、Da=メイン2、Vi=サブ） |
| `scenarioGains.ts` | N.I.A・初の同じ役目（`buildNiaScoreContext` / `buildHatsuScoreContext`）と獲得量集計 |
| `formationConditions.ts` | 今の編成が探索の必須条件（固定・BAN・レンタルNG・プラン・ステージ用の除外・SP率持ち・タイプ割合・最低/最高ステ・H.I.Fで設定ONのときの「選抜は極振り」）を満たすかの判定 `formationIssues` と、評価値の下の条件チップ `conditionChips`。計算ページの「下回ったら変更なし」ガードはこれが満たしているときだけ効く |
| `formation.ts` | **編成の組み方。** カードを点数化 `scoreCard`、6 枚の合計評価 `evaluateTeam`（イベント相互作用と上限込み）、合算パラボ `summedParaboByType`、理想編成の探索でもパラボを合算%で変換するための土台 `ParaboJoint` / `paraboJointOf`、山登りで最良 6 枚を探す `findBestFormation`、条件（SP枚数・最低ステ・最高ステ・割合・固定/BAN・試験補助）の重み |
| `autoOptimize.ts` | **理想編成の探索（踏み方×編成を同時に）。** 入口は `runFullOptimize`、本体は `OptimizeEngine` クラス。踏み方だけの最適化 `optimizeSteppingForSlots` も |
| `optimize/stepping.ts` | 「踏み方」の表し方と近傍（1 箇所だけ変えた候補）の列挙、選抜スコアの整数比プリセット（極振りだけの `EXAM_RATIOS_SINGLE`、極振りかどうかの判定 `isSingleTypeExam` / `examsAllSingle`）。`steppingAxes(s, examRatios)` の第2引数で選抜の軸の候補を差し替える（空＝選抜を動かさない） |
| `optimize/climb.ts` | 踏み方の山登り `climbStepping`（乱数なし。1箇所ずつ良い方へ動かす） |
| `buildOptimizeInput.ts` | 計算ページの状態を探索の入力にまとめる。SP枚数条件をタイプに割り当てる `resolveSpMin` |
| `optimizeReady.ts` | 探索ボタンを押せる条件（シナリオ・アイドル・Pアイドル・発動回数セット・メモリーが選ばれているか） |
| `useCalcResult.ts` | **計算ページの「現在のステ」「評価値」。** 全ストアを読んで合計し、シナリオ別の評価式を適用する |
| `useSchedule.ts` | H.I.F の踏み方（レッスンのメイン／サブ／SP、授業、選抜スコア）の保存と集計 `computeScheduleGains`。授業は `null`＝未選択（上昇なし）を持てる（N.I.A の営業の `type`・初の授業も同じ。未選択の営業はファン投票数も入らない）。踏み方エディタの「レッスン・授業リセット」（N.I.A は「レッスン・営業リセット」）＝ `resetLessonsAndClasses` / `resetLessonsAndSales` でレッスンを全部「踏まない」、授業（営業）を全部「未選択」に戻す。探索が作る候補は必ずタイプが入る。選抜の入力を手で変える前の配分の控え `examBaseline`（値が実際に変わったときだけ控える＝`touchExams`。元の値に戻すか、探索が点数配分を書くと消える。控えがある間は `examTouched`） |
| `useNiaSchedule.ts` / `useHatsuSchedule.ts` | N.I.A・初の踏み方の保存。N.I.Aの最終オーディションは `finalStats`（ステ直接入力。null＝スコアから導出）と `finalKind`（FINALE／QUARTET）。オーディションの素点はパラボ込みのステ（獲得ボーナス込み・ログの値）から `niaAuditionBaseFromRise` で逆算できる |
| `memoryTotals.ts` / `memoryTypes.ts` | メモリー 4 枚の合計、パラボ追従メモリー（テンプレ「メインパラボ45/60/70点」）の展開。スロットの中身 `SlotMemory`（保存元 `sourceId`）とライブラリの相互変換 `toSlotMemory`／`slotToMemory`、旧形式（ID 配列）の展開 `slotsFromIds`、中身の一致判定 `sameMemoryContent` |
| `pIdol.ts` | Pアイドルの一覧 `P_IDOL_MASTERS`、審査基準 `IDOL_RANKS`、特訓・開花段階からステを出す `computePIdolStats` |
| `calcSaveIO.ts` | セーブデータの中身（全状態のスナップショット）と読み書き |
| `useCalcSettings.ts` | 計算ページの設定（アイドル・Pアイドル・条件設定・本戦点数など）とセーブ一覧のストア |
| `useOwnedLevels.ts` / `useOwnedPIdols.ts` / `useOwnedSaves.ts` | 所持状況（サポカ凸・Pアイドル特訓/開花）とその名前つき保存 |
| `useAbilityCounts.ts` | 発動回数セット（テンプレとの差分だけ保存＝プロデュースごとのデフォルト）、計算ページで使うセットの選択、計算ページでの「この育成だけ」の調整レイヤー `adjust`（`getRunCount`／`setRunCount`／`isRunAdjusted`／`resetRunAdjust`。デフォルトは変えず、計算・探索・セーブはこちらを使う。セーブ用セットを作るときは調整込みで固めて調整を消す）。**スケジュールの選択**（`getChoices` / `setChoice` / `getRunChoices` / `setRunChoice` / `isRunChoiceAdjusted` / `choiceFitNote`）も同じ2層で持つ。お出かけ・相談・活動支給・特別指導・**休む**（と「(N回まで)」版）の回数は**この選択から導き出す**（回数として保存し直さない）ので、`getCount` / `getRunCount` はそのキーだけ `abilityCountsFromChoices(表示中のシナリオ, 選択)` を返す。テンプレの踏み方 `TEMPLATE_CHOICES` はシナリオ付きで持ち、**別シナリオでは使わない**（週の番号が噛み合わず全部「休む」になるため）。`templateCount` / `isChangedFromTemplate`＝そのプロデュースの「最初の回数」（スプシ由来。自分で追加したセットは null）で、プロデュース設定ページの「元◯」に使う。**自動で決まる回数**（`isAutoCountKey`）は手では変えられない: `スキル強化`＝Aスキル強化＋Mスキル強化（`DERIVED_SUMS`。オーナー指定 2026-09-18）、`◯◯(N回まで)`＝元の回数の頭打ち（`DERIVED_CAP_OF`。以前は生成時に固めた値を持っていたので、ドリンク獲得を変えても(10回まで)が追従しなかった）。`ドリンク交換`を変えると `LINKED_COUNTS` で `ドリンク獲得`も同じだけ動く（逆はしない）。「元◯に戻す」は `resetToTemplate`＝差分を消す（連動する回数も一緒に消す。片方だけ戻すと、戻すボタンしか押していないのに元より減るため）。回数を読む側（計算・探索・セーブ・書き出し）はこれまでどおり回数だけを見ればよい。**選択はシナリオごと・回数はセット単位**なので、回数へ書き戻すと別シナリオの分を壊す（ユーザーセットは3シナリオすべてに出る）。そのため `useAbilityCounts(scenario)` は表示中のシナリオを引数で受け取る（`useScenario` は他の実体の切り替えに追従しないため、シナリオを持つ画面は必ず渡す） |
| `useEventCounts.ts` | カードごとの前イベ・後イベ・ステイベの手動設定 |
| `useMemoryStore.ts` | スロット 4 枠の中身（保存していないメモリーもそのまま持つ。`gakumas:memorySlots:v2`）・保存したメモリー（ライブラリ）・メモリーセット（4 枠の中身のスナップショット）。枠の保存状態 `slotStatus`（空／テンプレ／未保存／保存済み／変更あり）、`saveSlot`（新規／上書き）、`pickIntoSlot`（一覧から枠へコピー）、`fillSlots`（4 枠すべて同じテンプレ） |
| `useSelectedSupports.ts` | 計算ページの「選択サポカ」6 枠 |
| `useCardFlags.ts` | BAN／固定／レンタルNG |
| `useScenario.ts` | 選択中のシナリオ |
| `storeSync.ts` | ストアが保存されたことを画面内の別部品に知らせる仕組み |
| `config.ts` | 画像URLの組み立て `imageUrl`（`.env.local` の `VITE_IMAGE_BASE_URL` が土台） |
| `cardSearch.ts` | カード検索（名前・読み仮名・検索ワード） |
| `ownershipCsv.ts` | 所持状況の CSV 書き出し／読み込み |
| `paraboTable.ts` / `produceRank.ts` | パラボ変換表モーダル用の計算（`paraboRange`: 1枠ぶんの期待値と最小〜最大。最大は「端数が出る獲得の数」だけ上）、評価値→ランク（S5 など）の表 |
| `devHarness.ts` | 開発検証用（画面からは使わない） |
| `cardImport/` | 画面キャプチャから所持サポカを読み取る照合ロジック（Web Worker で動く） |
| `eventCounter/` | イベントカウンター（画面判定・育成の追跡・統計・保存） |

### 2-6. `src/components/`（画面）

2026-09-12 の「使い方の見直し」（docs/UX_PROPOSAL.md）で計算ページの部品を分けた:
`calc/PremiseCard.tsx`（「設定欄」（育成の前提）: 青い見出し帯＋番号つきの5欄（ラベルも値も text-sm・h-10。細かい説明文は置かない。アイドル欄の右に特訓・才能開花のボタン（PIdolTrainingModal）。所持状況は `calc/OwnershipField.tsx`（プルダウン: 既定＝全完凸／保存してある所持状況。切り替えは所持状況ページと同じく使用中を替えてから所持ストアへ読み込む。一番下から所持状況ページへ。選んだ時点で ownershipAck））（シナリオ・アイドル（下に特訓・才能開花の現在値と変更ボタン）・プロデュース（ⓘ はその場の説明）・メモリー・所持状況（既定＝全完凸なら「完凸のままでOK」（ownershipAck）か「自分の所持状況を入力」。決まれば通常表示））＋本戦の点数（H.I.Fは本戦ラウンド点数、N.I.Aはファン投票数・チャレンジPアイテムの「調整」→ `calc/NiaChallengeModal.tsx`、初は試験スコア。一番下に全シナリオ共通の「詳細設定」→ `calc/DetailSettingsModal.tsx`）。初回の所持確認モーダルと「つぎに所持状況」カードは廃止）、`calc/ActionPanel.tsx`（前提の直下の操作パネル: 求める▾と探索の条件を同じ行に。前提がそろって初めて押すまで動く矢印（`gakumas:calc:everRun:v1`）、所持状況の注記・前回の探索の内訳。診断ログは /debug へ移した。PC・スマホ共通）、
`calc/FormationPlanCard.tsx`（「サポカ編成と踏み方」: サポカ6枚＋踏み方チップ＋開始時のステータス（パラボ変換表）＋SP率＋前イベ調整の折りたたみ）、
`calc/PlanChips.tsx`（踏み方チップ: レッスンはメイン＋右下のサブバッジ、SPなしは薄い点線、授業／営業は順番、選抜は細い配分バー＋割合、N.I.Aのオーディションは 1次・2次・最終の上がるステ（素点）と投票数。要約 `currentPlanSummary`）、`calc/StatsCard.tsx`（育成後のステータス。内訳の積み上げバーと最低／最高ステの印、「内訳の数字」の表。開閉は `gakumas:calc:statsBreakdown:v1` に記憶）、`calc/SetPickerField.tsx`（プロデュース＝発動回数セットの選択欄。自前の一覧。Pアイドルのプランで使えるもの（`PLAN_FAMILY`: センス→好調・集中、ロジック→好印象・やる気、アノマリー→全力・強気）だけ表示）、
`calc/SupportSlot.tsx`（サポカ枠。歯車は廃止し、凸・固定・BAN・レンタルNG はサポカ選択画面 `SupportPickerModal` の行で切り替える）、
`calc/OwnershipConfirmModal.tsx`（初回の探索前、所持状況ページを開いたことがなければ確認）、
`calc/MemoryPickerModal.tsx`（計算ページ内でメモリー4枚を選ぶ。「設定欄」のメモリー欄から開く。中身は `memory-manager/MemoryWorkbench.tsx`。「汎用メモリーを入れる」（メインパラボ60点×4）を目立つ枠で上に置き、メインパラボの説明を添える。A/B の枠は廃止）、`calc/CalcCard.tsx`（カード枠・入力欄ラベル）、`calc/PIdolTrainingModal.tsx`（特訓・才能開花のモーダル。「設定欄」のアイドル欄の右のボタンから）、`help/HelpPage.tsx`（/help ヘルプページ: 全体の流れ・ページの構成（計算／探索の設定／表）・使い方（画面の要点を押せない模式図 `Mock` で描く。画面写真は小さくて見づらいので使わない）・操作のヒント・プロデュースと発動回数・用語・よくある質問（オーナー提供の文）・データの保存と注意。`#produce` などのハッシュで見出しへスクロール。計算ページのプロデュースの ⓘ はここへのリンク）、
`Hint.tsx`（ⓘの説明。吹き出しは body 直下（createPortal）に画面基準で出す＝モーダルのスクロール枠の中でも切れない。ⓘ の下に入らなければ上に出し、左右は画面内に収め、スクロール・リサイズで閉じる（2026-09-18。以前は枠の中に absolute で出していて、「探索の条件」の下のほうの ⓘ が読めなかった）。**文言は `src/lib/glossary.ts` に集約**し、どのキーが画面のどこに出るかの対応表をそのファイルの先頭コメントに置いている（ヘルプページの「用語」は別の文章）。設定欄のプロデュースの ⓘ もこれ（ヘルプへのリンクではない））、
`calc/DetailSettingsModal.tsx`（設定欄の一番下「詳細設定」→ 親愛度（全シナリオ）＋ H.I.Fボーナス（H.I.Fのみ）。旧 HifBonusModal）、`ui.ts`（ボタン・チップの共通クラス。色の意味を固定）、
`src/lib/useOptimizePlan.ts`（「今の編成のまま踏み方だけ」の共通処理）、`src/lib/ownershipAck.ts`（所持状況ページを開いた印・初回確認の了承）。
所持状況ページ（`ownership/OwnershipPage.tsx`）は「使う所持状況」のプルダウン（既定の全サポカ完凸／自分で作ったもの／セーブデータ用／＋新しく作る）と「管理・CSV」モーダル（`ownership/OwnedSaveBar.tsx`: 新しく作る・名前・複製・削除・CSV）。既定のまま編集すると「自分の所持状況」が自動で作られる（2026-09-13。以前の「保存先スロット（なし＝保存されない）」はやめた）。
左端の縦タブは `calc/SideTabs.tsx`（上＝「プロデュース」（アビリティ発動回数）・下＝「レッスン等の踏み方」。2026-09-15 に画面名を「発動回数」から「プロデュース」に改名（ページのほうは 2026-09-16 に「プロデュース設定」）。ナビ・ページ見出し・モーダル・セーブの要約・ヘルプも同じ。コード上の名前（ability-counts、useAbilityCounts 等）は据え置き）。計算ページのイベント手動指定（`CALC_EVENT_COUNTS_KEY`）は編成から外れたカードの分を `useEventCounts.pruneTo` で消す（「今の編成での調整」。2026-09-16）。`AbilityCountDrawer` / `PlanEditDrawer` は親から open/onClose を受け取る。

ページの割り当ては `src/App.tsx` の `PAGES` 配列と `Routes` にあります。

| フォルダ・ファイル | 画面 |
|---|---|
| `home/HomePage.tsx` | `/` ホーム（ツール入口・免責・保存場所の注意） |
| `calc/CalcPage.tsx` | `/calc` 計算ページ本体（選択サポカ 6 枠、現在のステ・評価値、理想編成ボタン、全自動最適化ボタン、診断ログ） |
| `calc/SettingPickers.tsx` | シナリオ・アイドル・Pアイドルの選択モーダルと「探索の条件」モーダル（基本／詳細の2タブ。6枠の割り振り `TypeSlotAllocator`） |
| `calc/PlanEditDrawer.tsx` | 踏み方エディタ（レッスン・授業／営業・選抜／オーディション／試験）と「選択サポカで踏み方を最適化」。H.I.Fの選抜と N.I.Aのオーディションは「パラボ込みのステ（ゲームのログの値）」→素点の逆算入力（`RiseField`／`AuditionStatRows`）、N.I.Aの最終はスコア／ステ切り替え。計算ページでは左端のタブ（`calc/SideTabs.tsx`: 上＝発動回数・下＝レッスン等の踏み方。初めて探索したあとは吹き出しで案内し、押すか「わかった」で `gakumas:calc:sideTabsSeen:v1`）か踏み方チップから中央のモーダルで開く。探索を押したとき選んでいるPアイドルが未所持なら `calc/PIdolUnownedModal.tsx` で注意 |
| `calc/AbilityCountDrawer.tsx` | 計算ページ左端の「プロデュース」タブから開くアビリティ発動回数のエディタ（この育成での回数。「上書き保存」でデフォルトへ） |
| `calc/SupportPickerModal.tsx` | 選択サポカを選ぶモーダル（点数順・絞り込み。各行に「その枠をそのサポカに入れ替えたときの合計ステータスの増減」＝`evaluateTeam`＋`paraboJointOf` で計算ページの合計と同じ式。並びは点数順／増減順。スマホでは1枚を2段にして名前を省略しない。検索欄に自動でカーソルを合わせない） |
| `calc/ExamPolicyModal.tsx` | 探索の前の確認（H.I.F）: 選抜の点数配分を手で変えていたら「このまま固定して探索／探索で決め直す」を選ぶ。`useExamGuard(r)` が `ask(scope, run)` と `modal` を返す（計算ページと踏み方エディタの両方で使う） |
| `calc/SaveDataPanel.tsx` | セーブデータの保存・読み込み・名前変更・削除 |
| `calc/ExportSheet.tsx` | 計算シートの画像出力（PNG） |
| `calc/ParaboTableModal.tsx` / `calc/CalcHelpModal.tsx` | パラボ変換表、ヘルプ |
| `ownership/` | `/support` 所持状況入力（サポカ・Pアイドル、CSV、名前つき保存。`OwnedSaveBar.tsx` に既定の「全サポカ完凸」） |
| `card-import/CardImportPage.tsx` | `/card-import` 画面キャプチャで所持入力（β） |
| `memory-manager/` | メモリーの作業台（計算ページの「メモリーを4枚選ぶ」の中身。メモリーページ（/memory）は廃止）。`MemoryWorkbench.tsx`: 上＝`MemorySlot.tsx`（4 枠。クリックで編集する枠を選ぶ（青い枠線）・×で空にする・空枠は「＋ クリックして設定」、編集中の空枠は「編集中・下で中身を作る」）＋ セットの保存／呼び出し（`MemorySetModal.tsx`）、下＝左 `SlotEditor.tsx`（値ボタンでその場で作る。テンプレ（メインパラボ）の枠も今の踏み方で展開した中身から始めてそのまま変えられ、変えた時点で普通のメモリーになる。保存は任意で「メモリーとして保存」「上書き保存」「別のメモリーとして保存」。同じアビリティ・プランのメモリーがあれば注意 `findDuplicate`）／右 `MemoryLibrary.tsx`（保存したメモリー＋テンプレ。クリックで編集中の枠に入れて次の空枠へ。✎で直接編集 `LibraryEditModal.tsx`）。入力欄は `MemoryFields.tsx` を共用。A の枠（初回）は最初の空枠を編集対象にして編集枠までスクロール（`focusKey`） |
| `ability-counts/` | `/ability-counts` 画面名は「プロデュース設定」（ナビの「自動編成機能の設定」の中・見出し。2026-09-15 に「発動回数」→「プロデュース」、2026-09-16 に「プロデュース設定」）。アビリティ発動回数＝プロデュースごとの**デフォルトの回数**（ページ上部に「プロデュース＝アビリティ発動回数」の1行と、前イベ・後イベ分を含めない赤い注意）。セットの表（「計算ページで使用中」列）・編集モーダル `SetEditModal.tsx`（`mode`: default＝ページ／run＝計算ページ。run では「この育成での回数」の帯・「調整中 N件」・すべてデフォルトに戻す）・1 件の入力 `AbilityCounter.tsx`（調整中の印） |
| `card-settings/CardSettingsPage.tsx` | `/card-settings` サポカ設定（前イベ・後イベ・ステイベの手動設定、BAN／固定／レンタルNG） |
| `card-scores/CardScoreTable.tsx` | `/card-scores` サポカ点数表（スマホでは左の名前・イラスト列を固定せず、文字と余白を小さくする。データベース・サポカ設定の表も同じ。PC は左2列を固定） |
| `ability-counts/AbilityCountManager.tsx` | `/ability-counts` プロデュース設定。**最初の回数（スプシ由来）から変えたマスは黄色＋左下に「元◯」**、ポップオーバーに「元◯に戻す」（`templateCount`。自分で追加したセットは元が無いので出ない。オーナー要望 2026-09-18）。自動で決まる回数（スキル強化・「(N回まで)」）は「自動」の印を付けて押せなくする |
| `database/DatabasePage.tsx` | `/database` データベース（サポカ・Pアイドルの一覧閲覧。スプシの見た目に近い） |
| `debug/DebugPage.tsx` | `/debug` 探索の中身を数値で開示 |
| `event-counter/` | `/event-counter` イベントカウンター（別ツール） |
| `EventControls.tsx` | 前イベ「取得」トグル、強化／削除の A/M 割り振り、任意スキル獲得の分類ピッカー、後イベ M/A/✕ ボタン、ステイベ 〇/✕（計算ページとサポカ設定ページで共用） |
| `ScoreDetailModal.tsx` | サポカ 1 枚の点数内訳モーダル |
| `globals.css` | 全体のスタイル。**スマホ（幅 640px 未満）だけ、大きめの文字を一段小さくする**（Tailwind v4 の `--text-sm`〜`--text-4xl` を上書き。`text-xs` と `text-[11px]` などの直接指定＝いちばん小さい段は変えない） |
| `NavBar.tsx` / `Modal.tsx` / `NumberField.tsx` / `ScheduleCalendarView.tsx` / `scheduleCards.tsx` | 共通部品（ナビ＝計算｜「自動編成機能の設定」プルダウン（所持状況・プロデュース設定・サポカ設定。createPortal で body 直付け）｜点数表・データベース｜ヘルプ、モーダル（`fill` で高さを画面の85%に固定し、中身が自分でスクロールする出し方。プロデュース設定モーダルで使う。中身に最小の高さを持たせ、低い画面（スマホ・横向き）ではモーダル全体がスクロールする）、数値入力、スケジュール（正方形カードを並べた表示。カード1枚の見た目と色は `scheduleCards.tsx` の `ScheduleCard`。授業・営業は同じ紫、レッスン・☆レッスンは同じ青で、アイコンと名前で見分ける、週ごとに1つ選ぶ画面は `ability-counts/ScheduleChoiceGrid.tsx`）） |

---

## 3. 計算の仕組み（非エンジニア向け）

### 3-1. サポカ 1 枚の点数（`src/lib/sheetScore.ts` の `sheetScore`）

元は「HIF計算機」スプシの式で、移植時に全 2,670 通り（178 枚×0〜4 凸×3 ロール）が一致することを確認しています。

```
カードの点数 = 枠1・2・4・5・6 の（効果量 × 発動回数）の合計        ※枠3 は点数に入れない
             ＋ パラボ枠は「レッスン・試験の獲得量の合計 × %」（切り捨て前の期待値。2026-09-17 変更。下の (c)）
             ＋ ステイベ（パラメータイベント）の値 × 発動したか（0 か 1）
             ＋ 前イベ＝パラメータ（R サポカ）の値 × 前イベ発動回数
アイテム補正 = 切り捨て（パラメータ上昇値 × 前イベ発動回数）      ※パラメ系 P アイテムを持つカードだけ
```

1 つずつ説明します。

**(a) 効果量（アビリティの強さ）**
- ティア（Ⅰ〜Ⅴ）は「レアリティ × 枠番号 × 凸数」で決まります。表は `abilityEvolutions` タブ →
  `generated/abilityPerf.json` の `slotTier`。例: SSR の枠1 は 0 凸=Ⅰ … 4 凸=Ⅴ、枠2 は 0〜1 凸=Ⅰ、2 凸以降=Ⅱ。
- 効果量は `abilityValues` タブの `level1〜5` 列です。「レアリティ＋アビリティ名」（例 `SSRレッスン`）で引きます。
  括弧の全角半角と空白は無視して照合します（`normAbi` / `perfOf`）。
- `abilityValues` に無いアビリティは **その枠が 0 点**になるだけで、カード全体が 0 にはなりません。

**(b) 発動回数（何回発動するか）** — `buildCountResolver` が次の順で決めます。
1. 固定回数表 `src/data/fixedAbilityCounts.ts`（初期値=1、パラメータボーナス=1、パラメータイベント=1、SPレッスン率=1、何もなし=0、
   試験・オーディション= N.I.A 3 回／初 2 回／H.I.F 5 回）
2. レッスン系（レッスン／SPレッスン／通常レッスン）は **踏み方から自動**。カードのタイプと同じタイプを
   メインで踏んだ回数だけ数えます（サブ枠で踏んだ分は数えない）。内部では Vo=メイン1、Da=メイン2、Vi=サブ という
   名前で持っています（表示では Vo/Da/Vi に直しています）。
3. それ以外（スキル獲得・強化・削除・お出かけなど）は **発動回数セット**（プロデュース設定ページで参照にしたセット）の値。
4. 「◯◯(N回まで)」という名前で、セットに同名の行が無いときは、◯◯ の回数を N で頭打ちにした値。
5. どれにも無ければ 0 回。

どの回数を参照するか（回数キー）は `abilityValues` の `trigger_tag` 列で決まります。レッスン系はロール別（`メイン1レッスン` など）に、
それ以外は `trigger_tag` の文字そのもの。名前に「（N回まで）」が付く場合はキーにも付きます（`scripts/generateAbilityPerf.mjs` の `countKeys`）。
`trigger_tag` が空のアビリティは「回数なし＝点数に入らない」扱いです（初期値とパラメータイベントだけ例外で名前で引く）。

**(c) パラメータボーナス（パラボ）** — `paraboConvert`
- レッスン 1 回・試験 1 回ごとに「獲得量 × %」を **切り捨て** て合算します（例: 15% で 115・225 なら 17+33=50。合計 340×15%=51 ではない）。
  2026-09-15 にいったん「合計 × %」へ変えましたが、2026-09-16 にオーナー指摘で元へ戻しました。N.I.A は 素点 → チャレンジPアイテム → パラボ の順にそれぞれ切り捨てます。
  同じ % でも踏み方で価値が変わるのは、母数（獲得量）が踏み方で決まるためです（パラボ変換表モーダルで確認できます）。
- 6 枚の編成を評価するときは、カードごとに変換せず **メモリー＋Pアイドル＋HIFボーナス 10%＋サポカ全部の % を合算してから 1 回だけ変換** します
  （`formation.ts` の `summedParaboByType`）。個別に変換すると切り捨てが増えて実際より低く出るためです。
- **カード 1 枚の点数に入れるパラボは、切り捨て前の期待値**（`paraboExpected` = % × 獲得量の合計。2026-09-17）です。
  点数表・サポカ設定の並べ替え・探索の候補出し（ショートリスト・ビーム・入れ替え候補）はこの値を使います。
  合算してから獲得ごとに切り捨てると、1 つの % が増やすステは平均すると切り捨て前の値になります
  （切り捨てで失う分は合計に 1 回だけかかり、獲得 1 回につき 1 未満。H.I.F のメインタイプで平均 5 前後）。
  以前は 1 枚ぶんの % だけで切り捨てていたので、H.I.F のメインタイプで SR・SSR のパラボ持ちが平均 5〜6（最大 11）低く出ていました。
  メモリーのパラボは探索でも最初から合算側に入っているので、この問題はありません（パラボ変換表の 1 枠ずつの行だけが最小値を出していた）。
- 編成の合計は期待値ではなく実際の値で出します。`summedParaboByType` はカードの「パラボ以外の点」（`pointsNoParabo`）に合算%の変換値を足し、
  `findBestFormation` / `evaluateTeam` も `parabo: paraboJointOf(...)` を渡すと同じ足し方を **上限をかける前に** します
  （呼び出し元は CalcPage の理想編成、OptimizeEngine.buildFormation、デバッグページ）。そのため理想編成の合計ステは画面の値と一致します
  （以前は最大 30 ほど低く出ていた）。変換値は土台ごとにカード%（0.1% 刻み）でメモします（`ParaboJoint.convCache`）。
- パラボ変換表の 1 枠ずつの行は、大きい数字が期待値、かっこ内が最小〜最大です（`paraboRange`）。
  2026-09-16〜17 までは最大に獲得の数（H.I.F は常に 11）をそのまま足していた不具合があり、端数が出ない獲得（レッスンを踏まない回など）を除くように直しました。

**(d) イベント系の値「基本値×(1+率)」** — `eventValue` / `abilitySlotValue`
- 2026-09 のスプシ仕様では、パラメータイベント・Pポイントイベント・回復イベントの本体はカードの「ステイベ」「前イベ」「後イベ」列で持ち、
  カードのアビリティ枠には「◯◯イベント率」が入ります。
- 値 = 切り捨て（レアリティ別の基本値 × (1 + 率)）。基本値は `abilityValues` の「パラメータイベント」行、
  率は「パラメータイベント率」行を、**率アビリティが入っている枠のティア**で引きます。例: SSR 完凸で 20×(1+1)=40。
- 率アビリティを持たないカード（旧データ・R）は基本値そのままです。

**(e) ステイベ（1 育成に 1 回のランダムイベント）**
- カードの「ステイベ」列が「パラメータイベント」なら上の値 × 発動(0/1)。既定は発動（1）。サポカ設定ページ・計算ページの 〇/✕ で切れます。
- 「Pポイントイベント」「回復イベント」はステ点ではなく Pポイント・体力の集計（`cardResources`）に入ります。

### 3-2. 前イベ・後イベ・任意スキル（回数への反映）

前イベ・後イベは「そのカード 1 枚の点数」ではなく、**編成 6 枚全員の発動回数を増やす** 形で効きます（イベント相互作用）。
`sheetScore.ts` の `eventCountContributionSplit` が「回数キー → 追加回数」を作り、`formation.ts` の `evaluateTeam` が
各カードの「そのキーの効果量 × 追加回数」を加点します（「(N回まで)」の上限は超えられません = `clampExtraCount`）。

**前イベの発動回数** = min(最大発動回数, トリガーの回数)（`preEventAutoActivations`）
- トリガー（`前イベ起動タグ` 列）が `VocalSPレッスン` のようにタイプ付きなら、そのタイプの踏み回数。`SPレッスン` のようにタイプ無しなら全タイプ合算。
  `相談` `スキル強化` `初期値` などはそのキーの回数。
- 前イベ＝スキルのカードはスプシに最大回数・トリガーが無いので「1 回・初期値」に補完します（`supportCardsDb.ts` の `convert`）。
- 利用者が「取得しない」にすると 0 回。回数の手動指定があればそれ（0〜最大）。

**前イベで増える回数**（1 回の発動ごとに、スプシの各列の値ぶん）
- `スキル獲得` → 「スキル獲得」＋、分類フラグ列（`Aスキル獲得` `Mスキル獲得` `好調スキル獲得` … `SSRスキル獲得`）が 1 なら各分類も同じ回数。
- `任意スキル獲得` → 利用者が「任意獲得の分類」で回ごとに選んだ分類（A/M・好調・集中・…・SSR）を +1（未選択の回は汎用スキル獲得のみ）。
- `スキル強化` → 「スキル強化」＋、M 側の枚数（利用者指定。既定は `defaultEnhanceTarget`: カードが Mスキル強化アビを持てば M、A なら A、
  それ以外はプランで共通・ロジック=M、センス・アノマリー=A）を「Mスキル強化」、残りを「Aスキル強化」に。
- `スキル削除` → 同様に「スキル削除」「Mスキル削除（3回まで）」「Aスキル削除（3回まで）」へ。
- `Aスキル削除` `Mスキル削除` `チェンジ` `ドリンク獲得` `回復` → それぞれの回数キーへ。
- 前イベ＝アイテムで `Pアイテム獲得` 列が 1 のカードは、取得そのものが「Pアイテム獲得（6回まで）」を +1。

**後イベ**（`後イベ` 列 → `supportCardsDb.ts` の `LATER_EVENT_MAP` で語彙をそろえる。既定 1 回、利用者が ✕ にすると 0）
- 強化（スキル強化／選択スキル強化）→ 「スキル強化」＋「Aスキル強化 or Mスキル強化」（M/A ボタンで選択）
- スキル削除（選択スキル削除）→ 「スキル削除」＋「A or Mスキル削除（3回まで）」（既定 A）
- トラブル削除 → 「スキル削除」のみ（A/M なし）
- チェンジ → 「チェンジ（3回まで）」、Pポイント → ステ点には影響なし（Pポイント集計へ）

**HIF のワッペン／N.I.A の札**: 前イベ由来の「スキル獲得」回数は、HIF ではワッペン（★15×回数、最大 20 回）、
N.I.A では札（2 枚ごとに 3,000 票）として評価値にも効きます（`useCalcResult.ts` / `autoOptimize.ts` の `extraScore`）。

### 3-3. 編成 6 枚の評価（`src/lib/formation.ts`）

- `scoreCard`: カード 1 枚を「点数＋アイテム補正」「パラボ%」「回数キー別の効果量」「前イベ・後イベで配る回数」などの形にまとめます。
  アシスト（トレーナー）は枠ごとの効果タイプ（`1タイプ〜6タイプ` 列）に従って Vo/Da/Vi に振り分けます。
- `evaluateTeam`: 6 枚の「配る回数」を合算 → 各カードの受け手アビリティに掛けてシナジー加点 → タイプごとに合計（`parabo` を渡したときはパラボ以外の点＋合算%の変換値）→
  **タイプ別上限（H.I.F 3200／N.I.A 2600／初 3000）で頭打ち** → 3 タイプ合計が編成の点。溢れた分にペナルティはありません。
- `findBestFormation`（「理想編成」ボタン・探索の中で使う編成の組み直し）:
  固定カードとレンタル枠（全カードから完凸 1 枚。レンタルNG は除外）を確定 → タイプ別枚数の全分割 × 点数上位取りで種（シード）を作り
  上位 4 つを残す → 1 枠ずつ別のカードに入れ替える山登り（最大 15 周）で相互作用を反映 → 最良を返す。

### 3-4. 現在のステと評価値（`src/lib/useCalcResult.ts`）

```
現在のステ[タイプ] = 授業（営業）＋ メモリー固定値 ＋ Pアイドル固定値（H.I.F は +100）
                   ＋ レッスン ＋ 試験（オーディション）
                   ＋ サポカ点（パラボ抜き＋シナジー）＋ 合算パラボの変換値
最終ステ = min(シナリオ上限, 現在のステ)
```

評価値（シナリオ別）:

- **H.I.F**: `Σ最終ステ × 2 ＋ 切り捨て(合計スター性 × 7.5) ＋ 本戦R1換算 ＋ 本戦R2換算 − 2000`
  - 合計スター性 = ワッペン（素の値 10）× 発動回数（最大 20。回数 = セットの「スキル獲得」＋編成サポカのスキル獲得上乗せ）
    ＋ レッスン★（`schedule.ts` の `LESSONS` の値。SP か非SP かで異なり、小数は切り捨て）＋ 選抜★（`schedule.ts` の `examStar`: スコアの区間ごとに両端のスター性を直線でつなぐ `EXAM_STAR_SEGMENTS`、切り捨て。表はオーナー提供 2026-09。スコア入力は上限に達する `examStarCapScore`（14,001／146,365／390,910）で止める）＋ 本戦固定（180＋225）
  - 本戦R1/R2 は `src/data/schedule.ts` の `FINAL_ROUNDS`（点数は条件設定の既定で上限 140 万／240 万）。
    `brackets` が点数評価値、`starBands`/`starMax` がスター性（区間に入った分だけ倍率が掛かる累積。素の上限 R1 120・R2 150。オーナー提供 2026-09-16）
  - **スター性はすべて「素の値 × (1＋親愛度ボーナス) の切り捨て」**（`affection.ts` の `starWithAffection`）。
    `LESSONS` の ★ と `EXAM_STAR_SEGMENTS` は**親愛度37（+50%込み）で観測した値**なので、`starFromObserved` が 1.5 で割ってから掛け直します
    （従来の 150→225・5→7・110→165・30→45 はすべて +50% 込みの値だった、というオーナー確認による）
- **N.I.A**: `切り捨て(Σ最終ステ × 2.3) ＋ ファン投票数の換算`（営業＋1次・2次＋最終＋札。`src/data/scenarios.ts` の `niaFanValue`）
- **初（レジェンド）**: `切り捨て(Σ最終ステ × 2.1) ＋ 最終順位分（1700/900/500/0）＋ 中間スコア換算 ＋ 最終スコア換算`

サポカの P率（`レッスンPポイント率`・`タイプSPレッスンPポイント率`）は、踏んだレッスン1回ごとに「そのレッスンのP × 率の合計（SPレッスンなら自タイプのSP率も足す）」を切り捨てて足します（ゲームは獲得のたびに切り捨てる。ステのパラボと同じ考え方。2026-09-17 まではレッスンの合計に掛けて最後に1回だけ切り捨てていた）。

N.I.A は、営業先で「Pポイント営業」を踏む回数ぶん（1回 +50P＝`P_SALE_POINTS`）も足します（`resources.pSales`）。回数はプロデュースの回数 `p_sale`（`constants.ts` の ABILITY_NAMES に「Pポイント営業」として登録。サポカのアビリティではない）で、営業の数（7）まで。N.I.A 以外では画面に出さず、回数も 0 として扱う（`abilityCounts.ts` の `abilityAppliesTo`）。テンプレの既定は、スプシの abilityCountsNIA に「Pポイント営業」の行があればその値、無ければ名前から決める（`defaultPSaleCount`: 「ドリンク」を含む＝0／ロジック（好印象・やる気）の「M強化」＝5／それ以外＝7。オーナー指定 2026-09-18）。入力は踏み方エディタ（N.I.A）の営業の表の下（この育成だけの回数）と、プロデュース設定の「スケジュール」。

Pポイント・体力（H.I.F は選抜・本戦それぞれの「H.I.Fボーナスの初期Pポイント」、選抜だけの「親愛度のSTEP3」、差し入れの固定分も含む。差し入れはスケジュールの選択で踏んだ週から `supplyPFromChoices` で出すのでシナリオ・週によって変わる）、SPレッスン率と踏み方の実現確率も同じファイルで出しています。画面（育成後のステータスの下）に出すのは `pCards`（サポカ分）と `pBase`（サポカ＋レッスン＋H.I.Fボーナスの初期P＋親愛度＋メモリー＋差し入れ＝その育成で手に入る合計。内訳も同じ行）の2行です。差し入れの呼び名は `supplyLabel`（初レジェンドは「活動支給」）。

### 3-5. 理想編成（全自動最適化）の流れ（`src/lib/autoOptimize.ts` の `runFullOptimize`）

計算ページの「理想の評価値編成を求める（サポカ編成＋踏み方を自動探索）」ボタンです。プログラムを読まない人向けのやさしい説明は **docs/SEARCH_GUIDE.md** にあります（ここは定数名・関数名つきの詳しい版）。**乱数を使わない**ので、同じ入力なら毎回同じ答えになります。
探索時間は約 7 秒（`TIME_BUDGET_MS`。前半 3 秒が広域探索、最後 1.2 秒が結合手の予約）。
以下に出てくる「何件・何秒」の数字は `autoOptimize.ts` の冒頭にある定数（`GREEDY_PARTS` `TOP_PARTS` `SEARCH_FINALISTS` など）で、
探索の調整に合わせて変わることがあります（この文書は 2026-09-11 時点の値です。仕組みの流れ自体は変わりません）。

1. **候補出し**（`buildShortlist`）: 代表的な踏み方 4 つ（H.I.F なら Vo8／Da8／Vi8／3-3-2）で全所持カードを採点し、タイプごとに
   「点数上位 12」「配り屋（前イベ・後イベで回数を増やす）上位 6」「SP率持ち上位 3」、レンタル上位 2、アシスト上位 4、固定カードを候補に残します。
2. **レッスン配分の全列挙**（`lessonPartitions` → `previewPartitions`）: レッスン回数のタイプ別分割を全部（H.I.F 45 通り／N.I.A 36／初 21）作り、
   小さなビームサーチ（幅 30）で編成まで組んで推定点を付けます。授業は上限に余裕があるタイプへ自動配置（`assignClassesByHeadroom`）。
3. **グリーディ補強**（`deterministicSearch`）: 上位の配分（`GREEDY_PARTS`。現在 6）は `findBestFormation` でも組み、見つかった編成群を全配分で評価し直して順位を補正します
   （削除札・投票札型のカードをビームが取りこぼす対策）。
4. **本気のビーム**: 上位の配分（`TOP_PARTS`。現在 10）＋**寄せ方（軸: VoDa／DaVi／VoVi = レッスンを多く踏む 2 タイプ）ごとに最低 2 配分** を、幅 220・正確評価 240 の
   ビームサーチで探索。編成候補は選抜の寄せ方プリセット 10 種と授業の全割り当て（上位 2 編成）でも評価して「寄せると勝つ」解を拾います。
   カードの組み合わせが異なる上位 4 候補（`searchFinalists`）と軸ごとの最良（`axisBests`）、今の編成を仕上げに持ち越します。
   固定カードが入っていない今の編成は持ち越さず、目的関数でも固定カードの欠け 1 枚につき大きく減点します
   （`pinnedShortfall`。2026-09-13 に修正: 以前は固定を外したままの今の編成が勝つことがあった）。
5. **踏み方の詰め直し**（`optimizeStepping`）: 点数上位 3 候補＋今の編成について、編成を固定し 9 種の起点から種
   （レッスン分割×選抜プリセット）を作って山登り（`climbStepping`）。起点は今の踏み方に依存しない正規形から作る。
   「上位タイプに SP 率持ち N 枚」の条件は、候補の踏み方ごとに上位タイプを取り直して判定する（`spMinFor`）。
6. **仕上げ**（`refineDayExamJoint` → `refineLoop` 最大 6 周。最初の `MIN_REFINE_ROUNDS` 周（現在 2）は時間切れでも必ず回す）: 選抜スコアの細かい比率（`EXAM_RATIOS_FINE` 約 60 通り）→ 踏み方の山登り →
   レッスン 2 日の入れ替え → 編成の組み直し → 改善が止まったら「レッスン 1 箇所変更＋編成組み直し」の同時手（`jointLessonFormationMove`）。
7. **結合手**（`swapFormationMove`）: 候補プール上位との 1 枚スワップを正確評価し、惜しいスワップにはレッスン 1 日の変更＋選抜の寄せを重ねて峠越え。
8. **仕上げの後処理**: 取得回数の制限があれば、どのカードの前イベ／後イベを残すかを**組み合わせを実際に評価して**選ぶ（`allocateEvents`。前イベと後イベは同じ上限を取り合うことがあるので、残す組み合わせを掛け合わせてまとめて評価する＝多くても 20×20=400 通り。制限なしの目的関数で比べ、同点は受け手の効果量の目安が高い方。手で前イベ・後イベを変えているときの「今の編成を残す」判定は、探索と同じ前提で出した `currentRating` と比べる。2026-09-16 に「上限に達したタイプへの価値を一律5%」の近似から変更。数えるのは「前イベ／後イベを持つカード」全部＝
   ※ 前イベの取得・前イベ回数・後イベの発動（`acquire`/`pre`/`post`）は**探索が決める項目**。探索の入力からは外し（`sheetScore.searchEventCounts`。前の探索の「取得しない」を価値0と見なして外し続けないため）、全自動・編成だけ（`allocateEventsForSlots`）・踏み方だけ（`optimizeSteppingForSlots` が授業の寄せより先に割り当て）のどれでも、終わったら結果の6枚ぶんを `applyEventOps` で書き直す。制限ありは割り当て、**制限なしは全部発動**。ステイベ・強化のM/A・任意スキルの分類は手で決めるので残す（2026-09-16）。
   ステージ用アイテムのように点数に効かないものも 1 枚と数える。結果は探索が終わった時点でそのまま計算ページのイベント設定へ反映する
   （`useEventCounts.applyEventOps`。2026-09-16 に「提案→ボタンで反映」をやめた））→ 授業を流行タイプの閾値ルール（第1流行 2100 以上 → 第2流行 1400 以上 → 第3流行 1100 以上の順。2026-09-13 に第2流行を追加）に寄せる
   （`applyClassPreference`）→ 計算ページと同じ式で最終評価値（`fullRating`）。
9. 結果が今の評価値を下回り、かつ今の編成が条件を満たしているときは変更しません（`src/lib/formationConditions.ts` の `currentMeetsConditions`）。
   固定カードが入っていない・BAN・レンタルNG・プラン外・ステージ用の除外・SP率持ち不足・タイプ割合違い・最低/最高ステ外は「満たしていない」扱いで、
   結果が低くても置き換えます（2026-09-13 に固定・レンタルNG を追加。以前は固定を入れた結果が「下回ったので変更なし」に吸われていた）。
   取得回数の制限 ON と試験補助 ON のときは、結果の評価値が今の評価値と同じ土俵でないのでガード自体を効かせません。

探索中の比較は「Σ最終ステ ＋ スター性のステ換算（★1 = 評価値 7.5 = ステ 3.75）＋ NIA 札換算」で行い、最終評価値は勝者だけ計算します。
「寄せ方の比較」（`axisReport`）は軸ごとの最良候補の評価値と、条件未達（SP率持ち不足・最低ステ未達・最高ステ超過）を画面に出します。

「理想編成」だけのボタン（`applyIdealFormation`）は今の踏み方のまま `findBestFormation` を 1 回、
踏み方エディタの「選択サポカで踏み方を最適化」（計算ページの ▾「踏み方だけ」も同じ）は今の編成のまま `optimizeSteppingForSlots` を回します。
ステ直接入力にした選抜（`examStats`）も、全自動・踏み方だけの探索で動かします。候補ごとに `Stepping.examStats` を持ち、今の踏み方は画面どおりステ入力の値で評価します。スコアを置き換えた候補はその選抜を null（スコア入力）に戻します（`withExamScores` / `withAllExamScores`）。結果は `SteppingResult.hif.examStats` で返り、`setPlan(lessons, classTypes, examScores, examStats)` がそのまま書きます。ステ入力からスコア入力に切り替わった選抜があれば、探索結果の注記で知らせます。
仕上げの授業寄せ（`applyClassPreference`）はこちらにも掛かります（2026-09-12。以前は掛かっておらず、第3流行が 1100 に届かない配分のまま返していた）。

**選抜の点数配分の方針（`AutoOptimizeInput.examPolicy`。H.I.Fだけ。2026-09-17）**: `free`＝探索が決める（既定）／`fixed`＝今の点数配分（ステ入力もそのまま）を動かさず、サポカ編成・レッスン・授業だけ探索／`single`＝選抜ごとに1タイプへの極振りだけ（`EXAM_RATIOS_SINGLE`。仕上げは 3×3×3=27 通りの総当たり）。
エンジンは評価の入口（`buildEctx`）と結果の出口（`toSteppingResult`・`fullRating`）で必ず `normExams` を通すので、途中で配分を動かした候補が混ざっても方針から外れた結果にはなりません。無駄な評価を減らすため、候補を作る側（山登りの選抜軸 `steppingAxes(s, examRatios)`・寄せ方プリセット・`refineExams`・結合手の選抜変形）も方針に合わせて絞っています。`free` のときの動きは今までと同じです（HEAD と同じ結果になることを確認）。
画面側は、選抜の入力を手で変えると `useSchedule` が変える前の点数配分を `examBaseline` に控え（元の値に戻せば消える。探索が点数配分を書いても消える）、控えがある間は `examTouched` が true になり、探索（全自動・踏み方だけ）を押したときに `calc/ExamPolicyModal.tsx` の `useExamGuard` が「このままの点数配分で探索する（fixed）／点数配分も探索で決め直す」を聞きます。固定を選んだ探索は選抜を書き換えないので印は残り、次の探索でもまた聞きます。「編成だけ」は踏み方を動かさないので聞かず、取得回数の割り当ては `fixed` で評価します。

### 3-6. 探索の条件の扱い（「探索の条件」モーダル = `SettingPickers.tsx` の `TheorySettingsModal`）

| 条件 | 探索でどう効くか（`formation.ts` / `autoOptimize.ts`） |
|---|---|
| SPレッスン率アップ持ちの最低枚数（1 番目／2 番目に多く踏むタイプ。0〜6 枚） | 不足 1 枚ごとに `SP_PENALTY`（10 億点）を引く。踏み方候補ごとに上位タイプを取り直す（`spMinFor`）。トレーナー・あさり等の「全SPレッスン率」持ちアシストは全タイプの 1 枚として数える（`ScoredCard.spTypes`） |
| 最低ステータス | 満たすと `MIN_STAT_WEIGHTS`（4000 万／200 万／10 万）の満額、途中は進み具合で半額まで。審査基準が高いタイプから優先。採用結果でも届かないときは「（採用・条件未達: 最低ステ○未達）」と表示 |
| 最高ステータス | 超えた分の価値を 5%（`MAX_STAT_EXCESS_WEIGHT`）に割り引き、他タイプの空きへ回せた分をさらに 5%（`MAX_STAT_ROOM_PENALTY`）減点する（`formation.ts` の `maxStatSearchPenalty`。これより重くすると超過分を捨てるだけで得をするので同じ値）。評価値そのものは削らない。**「最高ステ超過」と数えるのは、他のタイプの少なくとも1つにまだ空き（シナリオ上限の1%超）があるときだけ**（`maxStatOverTypes`。他の2タイプが上限ならあふれは仕方ないので条件を満たした扱い。2026-09-16 オーナー指定）。授業の寄せ（`applyClassPreference`）も同じ値で比べ、閾値は最高ステで頭打ち（以前は合計だけで比べて、最高ステのタイプへ授業を積んでいた） |
| サポカ編成のタイプ割合（6 枠の割り振り） | 合計 6 なら構成を固定、6 未満なら最低枚数（`typeConstraintFromRatio`）。**必須条件**として全段階で守る（`typeRatioShortfall` × `RATIO_PENALTY`＝40 億点。ビームの枝刈り・シード・山登り・詰め直しも同じ判定）。アシスト（トレーナー）はどのタイプにも数えない＝自由枠に入る |
| 今の編成が条件を満たすか（`CalcPage.tsx` の `currentMeetsConditions`） | プラン・BAN・ステージアイテム・SP率持ち枚数・タイプ割合に加えて、最低ステ／最高ステも今の最終ステで判定。満たしていれば探索結果が今の評価値を下回るとき置き換えない。満たしていなければ下がっても置き換える |
| 取得回数の制限（前イベ取得枚数・後イベ枚数） | 探索中は超過分を比例で目減り（`eventBudgetScales`）、最後に残すカードを組み合わせの実評価で決める（`allocateEvents`）。数えるのは前イベ／後イベを持つカード全部。結果は探索が終わった時点で計算ページのイベント設定へそのまま反映（`applyEventOps`）。制限なしのときは探索のたびに全部発動へ戻す |
| 試験補助を強める | アイテム評価（`強さ` 列）×80、ドリンク獲得 1 本 80、SP率持ち 60 を探索の目的関数だけに加点（表示の評価値には入れない）。アイテムの `おすすめプラン` がセットのプランに合うときだけ |
| 選抜の点数配分設定をそのままにするかどうかの確認を挟む（H.I.F。`examConfirm`。既定ON。確認の「次回以降表示しない」で OFF になり、選んだほうが `examKeepManual`＝確認を挟まないときの扱い（true＝手で変えた配分のまま固定／false＝探索が決め直す）に入る） | 探索の中身には効かない。ON で、手で変えた点数配分（`useSchedule` の `examTouched`＝`examBaseline` が残っている）があるとき探索の前に確認モーダルを出す。「このまま」なら `examPolicy: "fixed"` で探索。OFF なら聞かずに `examKeepManual` に従う（既定は探索が決め直す） |
| 選抜試験の点数を全て1つのタイプに分配する（H.I.F。`examAllIn`。既定OFF） | `examPolicy: "single"`。選抜ごとに1タイプへ全部振った配分だけを試す。今の点数配分が極振りでないときは「条件を満たしていない」扱い（`ConditionInput.examSingle`。チップ「選抜は1タイプに分配」）で、結果が低くても置き換える。点数配分を固定して探索したときはこの条件を見ない |
| ステージアイテムを編成しない | `前イベ` 列が「ステージ用アイテム」または「スキル」のカード（`isStageCard`）を候補から外す（固定は貫通）。**今の編成の候補（`runFullOptimize` の currentCand）にも同じ条件を掛け**、目的関数でも `stageItemShortfall × RATIO_PENALTY` で弾く（2026-09-16 まで、今の編成に入っていた除外カードが候補経由でそのまま結果に戻っていた） |
| 固定／BAN／レンタルNG（サポカ設定ページ） | 固定は必ず採用（プラン違いは除く）、BAN は候補から除外、レンタルNG はレンタル枠の候補から除外 |

---

## 4. スプシを変えたときにどこを直すか

### 4-0. まず、スプシのタブと列の対応（現状）

| タブ | 読むスクリプト | 列（見出し） |
|---|---|---|
| `supMaster` | `generateSupportCards.mjs` → `supportCardsDb.ts` | `id` `サポカ名` `レアリティ` `タイプ` `プラン` `1タイプ`〜`6タイプ` `1アビ`〜`6アビ` `前イベ` `後イベ` `ステイベ` `前イベ名` `強さ` `おすすめプラン` `前イベ起動タグ` `最大発動回数` `パラメータ` `スキル獲得` `Aスキル獲得` `Mスキル獲得` `好調スキル獲得` `集中スキル獲得` `好印象スキル獲得` `やる気スキル獲得` `強気スキル獲得` `温存スキル獲得` `全力スキル獲得` `元気スキル獲得` `SSRスキル獲得` `任意スキル獲得` `スキル強化` `Aスキル強化` `Mスキル強化` `任意スキル強化` `スキル削除` `Aスキル削除` `Mスキル削除` `任意スキル削除` `チェンジ` `ドリンク獲得` `Pアイテム獲得` `Pポイント` `回復` `検索ワード` |
| `abilityValues` | `generateAbilityPerf.mjs` | `name` `rarity`（SSR／配布SSR／SR／R） `level1`〜`level5` `trigger_tag` |
| `abilityEvolutions` | `generateAbilityPerf.mjs` | `レアリティ` `アビリティ`（ability1〜6） `0凸`〜`4凸`（ティア番号 1〜5） |
| `abilityCountsHIF` / `abilityCountsNIA` / `abilityCountsHajime` | `generateAbilityCounts.mjs` → `abilityCounts.ts` | 1 行目: プラン行（左上は空）、2 行目: 左端が `アビリティ`、右にセット名、以降: アビリティ名＋回数。**お出かけ・相談・活動支給・差し入れ・特別指導・休むの行はテンプレでは使わない**（スケジュールタブから数える。食い違うと gen:counts がお知らせを出す） |
| `scheduleHIF` / `scheduleNIA` / `scheduleHajime` | 同上 → `TEMPLATE_CHOICES` | 開発側が決めるテンプレの踏み方（2026-09-18 にオーナーが作成）。1 行目: プラン行、2 行目: 左端が `スケジュール`、次が `選べる行動`（人が見るだけ。コードは読み飛ばす）、右に発動回数タブと**同じ並びの**プロデュース名（同名の列が並ぶので、プラン行＋名前で突き合わせる）。以降: A 列が週（日）の名前（`選抜1日目` `本戦3日目` `3週目`）、セルは `お出かけ` `相談` `差し入れ`（初は `活動支給`）`特別指導` `休む`／空欄。読み込み時に週の行idが今のスケジュール定義と噛み合わなければそのテンプレは使わない（`registerChoices`。gen:counts を回し忘れると全部「休む」になるのを防ぐ） |
| `pidleName` | `generatePIdols.mjs` | `固有スキル名` `名前` `カード名` `レアリティ` `プラン` `おすすめ効果` `名前カード名` `成長タグ` |
| `pidleStatus` | `generatePIdols.mjs` | `成長タグ` `段階` `体力` `Vo初期値` `Da初期値` `Vi初期値` `Voパラボ` `Daパラボ` `Viパラボ` `VoSP率` `DaSP率` `ViSP率` |
| `idleTypes` | `generatePIdols.mjs` | `名前` `Vocal` `Dance` `Visual`（審査基準 1〜3） `型`（バランス／特化） |

見出しは **先頭行**が使われ、空の見出し列は捨てられ、全部空の行は無視されます（`worker/lib/sync.js` の `rowsToRecords`）。
`supMaster` の `サポカ名` が「固定用」の行はダミーとして飛ばします（`supportCardsDb.ts` の `convert`）。

### 4-1. ケース別の手順

#### A. 数値だけ変える（効果量・回数・Pアイドルの数値・強さ・おすすめプランなど）

- スプシ側: 値を書き換えるだけ。
- コード側: **不要。**
- 反映: `update-all.cmd`（または `npm run gen:all` → `npm run release`）。

#### B. 列を増やす（supMaster に新しい列を足す）

- スプシ側: 見出しを 1 行目に書き、値を入れる。
- コード側: 現状のプログラムは **知っている列しか読みません**。新しい列は JSON（`generated/supportCards.json`）には入りますが、
  計算・表示には使われません。使いたいときは `src/data/supportCardsDb.ts` で
  1. `HEADER_ALIASES` に「日本語の見出し → 内部名」を 1 行足す
  2. `convert()` の中で、その内部名の値を `SupportCardData` の項目（または `extras`）に載せる
  3. 使う側（`sheetScore.ts` や画面）でその項目を参照する
  を行います。
- 反映: コード修正後に `update-all.cmd`。

#### C. 列名を変える（見出しの文字を変える）

- 変えた瞬間、その列を読んでいたプログラムは「列が無い」と見なして空扱いになります（エラーは出ません）。
- 直す場所:
  - `supMaster` → `src/data/supportCardsDb.ts` の `HEADER_ALIASES`（`1アビ`〜`6アビ`・`1タイプ`〜`6タイプ` だけは `normalizeRow` の中）。
    さらに `scripts/generateAbilityPerf.mjs`（`レアリティ`・`{n}アビ`）、`scripts/generateCardSprite.mjs`（`サポカ名`）、
    `scripts/generatePreEventImages.mjs`（`前イベ名`）も同じ見出しを直接読んでいます。
  - `abilityValues` → `scripts/generateAbilityPerf.mjs`（`name` `rarity` `level1〜5` `trigger_tag`）
  - `abilityEvolutions` → 同上（`レアリティ` `アビリティ` `0凸`〜`4凸`、`RARITY_MAP`）
  - 発動回数タブ → `scripts/generateAbilityCounts.mjs`（左端の見出し `アビリティ` = `KEY_COL`）
  - `pidleName` / `pidleStatus` / `idleTypes` → `scripts/generatePIdols.mjs`（`masters` の組み立て、`COLS`、`idolRanks`）
- 反映: コード修正後に `update-all.cmd`。
- おすすめ: 列名は変えず、値だけ変える運用が安全です。

#### C-2. アビリティ名・前イベ起動タグ・発動回数タブの行名の「文字」を変える（改名）

例: 2026-09 に「基本チェンジ（3回まで）」→「基本スキルチェンジ（3回まで）」、「試験・オーディション」→「試験・オーディション終了」
（起動タグ・「（2回まで）」・「回復」の付くものすべて）に改名した。

- 仕組み: スプシの名前は、コード側の正式名一覧 `src/data/constants.ts` の `ABILITY_NAMES`（内部キー → 日本語名）と
  **文字で照合**しています（全角/半角の括弧・空白の違いは無視）。スプシ側だけ変えると照合に失敗し、
  **そのアビリティは点数 0・発動回数 0 として静かに扱われます**（画面にエラーは出ません）。
  `update-all.cmd` の最後の `check:labels` がこれを見つけて止め、未登録の名前を一覧します。
- 直す場所は **1 か所だけ**: `ABILITY_NAMES` の該当行の日本語名を新しい文字に書き換える。
  点数（`abilityValues` の名前）・発動回数タブの行名・前イベ起動タグ・固定回数（`fixedAbilityCounts.ts`）・
  回復/Pポイントの集計（`sheetScore.ts`）は全部ここから名前を引くので、他は触らなくてよい。
  ```ts
  // 例: 「基本チェンジ(3回まで)」→「基本スキルチェンジ(3回まで)」
  basic_change_ut3: "基本スキルチェンジ(3回まで)",
  ```
- **内部キー（`basic_change_ut3` のような英語）は変えない。** 利用者の保存データ（発動回数の差分など）は内部キーで
  保存されているので、日本語名を変えても利用者側は何も壊れません。
- 「チェンジ」「特別指導」のように **括弧なし**の起動タグは、「その名前（N回まで）」という正式名がちょうど 1 つあれば
  自動でそれに結び付きます（追記不要）。「スキル削除」のように括弧なしの正式名が別にあるときはそちらが優先。
- 手順: ①スプシを改名 → ②`ABILITY_NAMES` の日本語名を書き換え → ③`update-all.cmd`。
  `check:labels` が「✓ …すべてコードに登録済み」なら OK。「✗ コードに登録されていない名前」と出たら、
  その名前を②で直してもう一度。
- 確認: 点数表ページでそのアビリティを持つカードの点数が 0 になっていないか、計算ページで前イベの回数が
  「0/3」のようになっていないか。

#### D. 新しいアビリティ名を足す（カードの `nアビ` に新しい名前が登場した）

やること（順番どおり）:
1. スプシ `abilityValues` に行を足す: `name`（カードの `nアビ` と同じ文字）、`rarity`、`level1〜5`、`trigger_tag`（どの回数を参照するか。
   既存の名前、例 `スキル強化` `お出かけ` `レッスン`。名前に「（N回まで）」があるときも `trigger_tag` は基準名でよい）。
   → これだけで **点数は計算されます**（回数の参照先が既存の名前なら）。
2. コード `src/data/constants.ts` の `ABILITY_NAMES` に「内部キー: 日本語名」を 1 行足す（表記ゆれを受けたいなら `ABILITY_LABEL_ALIASES` にも）。
   足さないと、開発モードで「未知のアビリティ名があります」と警告が出て、所持状況ページの絞り込み・プロデュース設定ページ・セーブの発動回数に
   そのアビリティが出ません。
3. **発動回数を利用者が変えられるアビリティ**（スキル獲得系・強化削除系・スケジュール系・その他）なら、
   `src/data/abilityCounts.ts` の `ABILITY_CATEGORIES` のどれかの分類に内部キーを足す（プロデュース設定ページの表に行が出る）。
   発動回数タブにも行を足す（4-1 F）。
4. 「◯◯(N回まで)」の派生で、発動回数タブに独立行を作らない場合は `abilityCounts.ts` の `DERIVED_CAPS` に
   `{ key: 新キー, base: 基のキー, cap: N }` を足す（点数計算だけなら `sheetScore.ts` の `buildCountResolver` が自動で N で頭打ちにするので不要）。
5. 値の意味が今までと違う（Pポイント・回復・最大体力に数える等）なら `src/lib/sheetScore.ts` の `cardResources` の上にある
   `P_FLAT_LABELS` `RECOVER_LABELS` `MAX_HP_LABELS` に**内部キー**を足す（日本語名ではなくキー。名前は `ABILITY_NAMES` から自動で引く）。
   「○○イベント率」のような率は `eventValue()` が「イベント名＋率」で自動対応づけする。
6. 反映: `update-all.cmd`。`gen:perf` の出力に「カードが使うが abilityValues に無いアビリティ」の警告が出ていないか確認。

参考: 2026-09 の「もうすぐ本番ですね」では `basic_change_ut3`（基本スキルチェンジ(3回まで)）と
`stage_finish_15plus_ut5`（15枚以上試験・オーディション終了(5回まで)）を `constants.ts` と `abilityCounts.ts` に足しました。

#### E. 新しい前イベ・後イベ・ステイベの種類を足す

現状の語彙:
- `前イベ` 列: `スキル` ／ `ステージ用アイテム` ／ `プロデュース用アイテム` ／ `パラメータイベント`（空 = 何もなし）
- `後イベ` 列: `スキル強化` `選択スキル強化` `選択スキル削除` `スキル削除` `チェンジ` `トラブル削除` `Pポイントイベント` `Pポイント`
- `ステイベ` 列: `パラメータイベント` ／ `Pポイントイベント` ／ `回復イベント`（空 = 何もなし）

直す場所:
1. `src/data/supportCardsDb.ts`
   - 前イベの種類判定: `convert()` の `preKind`（`isSkill` / `isStageItem` / `isItem` / `preEventType`）
   - 後イベ: `LATER_EVENT_MAP`（スプシの文字 → アプリの語彙 `強化` `スキル削除` `チェンジ` `トラブル削除` `Pポイント`）
   - ステイベ: `STAT_EVENT_TYPES_ARRAY`
   - 前イベで増える回数の列: `NUMERIC_ACTION_MAP`（数値列）と `SKILL_FLAG_MAP`（0/1 の分類列）、表示順 `PRE_EVENT_ACTION_KEYS`
2. `src/lib/sheetScore.ts`
   - 後イベ → 回数キー: `POST_EVENT_KEY` と `eventCountContributionSplit` の後イベ部分
   - 前イベの数値アクション一覧: `NUMERIC_ACTION_KEYS`、分類フラグ: `SKILL_FLAG_KEYS`
   - ステイベの点数化: `sheetScore` / `sheetScoreBreakdown` の「ステイベ」部分、Pポイント・回復は `cardResources`
   - 「どの後イベがステに効くか」: `postEventStatRelevant` / `postEventToggleable`
3. `src/components/EventControls.tsx`: 画面の部品（`AcquireToggle` = 取得トグル、`PreAssign` = A/M 割り振りと任意獲得の分類、
   `PostEventButtons` = M/A/✕ または 〇/✕、`StatEventToggle` = ステイベ 〇/✕）
4. `src/components/database/DatabasePage.tsx`: データベースの「前イベ」「トリガー」「最大回数」「発動内容」「後イベ」列の表示（`preEventDetail`）
5. 反映: `update-all.cmd`。

#### F. 発動回数タブ（abilityCounts*）の行や列を足す

- 行（アビリティ）を足す: 左端の名前が `constants.ts` の `ABILITY_NAMES` の日本語名と一致（括弧の全角半角・空白は無視）していれば
  そのまま通ります。違う表記なら `ABILITY_LABEL_ALIASES` に追記。一致しない行は開発モードで「発動回数タブの未知ラベル」と警告され、無視されます。
  （現状は「Pドリンク獲得」「Pドリンク交換」だけ `ALIASES` で受けています。カード側は「ドリンク獲得」「ドリンク交換」なので、
  発動回数タブの行名もそろえれば `ALIASES` は不要になります。名前を「変えた」ときは `ALIASES` ではなく 4-1 C-2。）
- 列（セット）を足す: 2 行目にセット名、1 行目に対応するプラン（センス／ロジック／アノマリー／好調／集中／好印象／やる気／強気／全力）を書けば
  自動で反映されます（`abilityCounts.ts` の `DEFAULT_SETS` 等はスプシから作られる）。セットの ID は「プラン＋セット名」なので、
  **名前やプランを変えると利用者が保存していた差分・選択は別物扱いになります**（旧セットの差分は残るが使われない）。
- 利用者が変更した回数は「テンプレとの差分」だけ保存されるので、スプシの既定値を変えれば **利用者が触っていない項目は自動で新しい値** になります。
- 反映: `update-all.cmd`。

#### G. 新カードを足す

1. スプシ `supMaster` に行を足す（`id` は空でもよい。保存キーは名前ベース `card:<サポカ名>`）。
2. 新しいアビリティ名があれば 4-1 D。`gen:perf` の警告で抜けが分かります。
3. 画像: ドライブのサポカ用フォルダに `<サポカ名>.png`（または jpg）を置く。**名前はスプシの `サポカ名` と完全一致**（全角半角・記号・スペースも）。
4. 前イベの画像があれば、前イベ用フォルダに `<前イベ名>.png` を置き、スプシの `前イベ名` 列（または `検索ワード` に半角カンマ区切り）にその名前を書く。
5. `update-all.cmd`（`sync:images` → `gen:all` → `release`）。`gen:sprite` が「R2 に画像が無いカード」を一覧で出すので確認。
6. 任意: `src/data/cardReadings.json` に「カード名: ひらがな」を足すと、ひらがな検索が効きます（無くても名前・検索ワードで引けます）。

利用者側の見え方: 既存利用者の所持データに無い新カードは **完凸所持として扱われます**（`useOwnedLevels.ts`。未所持にしたい人は自分で変更）。
所持状況の保存データには保存時の枚数が入っているので、読み込み時に「保存後に実装されたカード = 完凸」「保存時に存在した = 未所持」と振り分けます。

#### H. 新 P アイドル・新アイドルを足す

1. `pidleName` に行（`名前カード名` が一意キー。`成長タグ` で `pidleStatus` とつながる）。
2. `pidleStatus` に `成長タグ` ごとの段階行。認識する段階名は `初期` `初` `NIA` `HIF` `親愛度22` `親愛度25`（無条件で合算）、
   `特訓1` `特訓2` `特訓4` `特訓5` `特訓6`、`才能開花1` `才能開花3` `才能開花4`。それ以外は `gen:pidols` が「未対応の段階」と警告して無視します
   （新しい段階名を使うなら `scripts/generatePIdols.mjs` の `UNCONDITIONAL_STAGES` / `STAGE_TO_BLOCK` と `src/lib/pIdol.ts` の `computePIdolStats` を直す）。
3. 新しいアイドルなら `idleTypes` にも行（審査基準 1〜3 と 型）。無いアイドルは Vo>Da>Vi・バランス扱いになります（`useCalcResult.ts` の `typeRanksOf`）。
   計算ページのアイドル一覧は `pidleName` の `名前` から自動で作られるので、コードの `IDLE_NAMES`（`constants.ts`）は直さなくて動きます。
4. 固有スキル画像はドライブの Pアイドル用フォルダに `<固有スキル名>.png`。`sync:images` だけで反映（gen 不要。URL は名前から組み立てる）。
5. `update-all.cmd`。
6. 利用者側: 所持データに無い P アイドルは **未所持扱い**（初回利用者だけ全員「特訓 6・開花 4」で初期化）。

#### I. 画像だけ足す・差し替える

| 種類 | R2 の置き場所（自動） | 名前の一致先 | gen が必要か |
|---|---|---|---|
| サポカ | 直下 `<サポカ名>.webp` | `supMaster` の `サポカ名` | `gen:sprite`（キャプチャ読み取り用の一覧画像を更新） |
| 前イベ | `preEvent/<前イベ名>.webp` | `supMaster` の `前イベ名`（または `検索ワード`） | `gen:preevents`（存在する画像の一覧を更新） |
| P アイドル固有スキル | `skill/<固有スキル名>.webp` | `pidleName` の `固有スキル名` | 不要 |

- **ドライブに置いただけでは何も起きません。** `sync:images`（`update-all.cmd` の 1 段目）を回して初めて R2 に上がります。
- 既に R2 にある名前は飛ばすので、差し替えは `npm run sync:images -- --force`（全件上書き。時間がかかる）。
- ブラウザの表示 URL は `.env.local` の `VITE_IMAGE_BASE_URL`（現在 `https://img.hoppepan.com`）＋ファイル名です。
  ビルド時に焼き込まれるので、変えたら `release`。

#### J. 同期するタブを増やす・減らす

1. `wrangler.toml` の `SHEET_TABS` にタブ名を足す（カンマ区切り）。表のまま保存したい（1 行目が見出しでない）タブは `worker/lib/sync.js` の `GRID_TABS` にも。
   足したタブが R2 に入るのは**その Worker を本番に出したあと**だが、gen スクリプトはローカルの `service-account.json` で直接読むので（`scripts/_sheetDirect.mjs`）、本番反映前でも `update-all.cmd` は通る。
2. 読む側のスクリプトを `scripts/` に用意し、`package.json` の `gen:all` に加える。
3. **順番に注意**: 同期は Worker の中で動くので、先に `release.cmd`（Worker を更新）→ その後 `update-all.cmd`。
   `update-all.cmd` だけだと 2 段目の `gen:all` が古い Worker に同期を頼むことになり、新タブが取れません。

---

## 5. 保存データ（利用者のブラウザに残るもの）

すべて **localStorage**（ブラウザの中の保存領域）に入ります。サーバーには送られないため、
別の端末・別のブラウザ・シークレットモードでは引き継がれず、ブラウザのデータ削除で消えます。
大事なデータは「セーブデータ」「所持状況の名前つき保存」「CSV 書き出し」で控えを取るよう、ホーム画面にも注意書きがあります。
壊れたデータは読めなかった時点で無視し、初期値に戻ります（消えたように見える原因の 1 つ）。

| キー名 | 中身 | 定義ファイル |
|---|---|---|
| `gakumas:calcSettings:v1` | 計算ページの今の設定（アイドル、Pアイドル、探索の条件、本戦点数、ユーザー名など。`CalcSettings`） | `src/lib/useCalcSettings.ts` |
| `gakumas:ownership:visited:v1` | 所持状況ページを開いたことがある印（"1"。無ければ計算ページで「所持状況が未入力」扱い） | `src/lib/ownershipAck.ts` |
| `gakumas:setup:ownershipAck:v1` | 初回の探索前の確認で「このまま求める（全完凸）」を選んだ印（"1"） | `src/lib/ownershipAck.ts` |
| `gakumas:ownedSaves:active:v1` | 「使う所持状況」のID。無い・消えたIDは既定 `builtin-all4`（全サポカ完凸。読み込み専用）。既定のまま凸などを変えると今の内容から「自分の所持状況」が自動で作られて使用中になり（`ensureEditableSlot`）、以後の変更は随時そこへ保存される | `src/lib/useOwnedSaves.ts` |
| `gakumas:calc:statsBreakdown:v1` | 育成後のステータスの「内訳の数字」を開いているか（"1"／"0"。無ければ開く） | `src/components/calc/StatsCard.tsx` |
| `gakumas:calc:everRun:v1` | 探索を一度でも押した印（"1"。無ければ、前提がそろったときボタンの上に動く矢印を出す） | `src/components/calc/CalcPage.tsx` |
| `gakumas:setup:ownershipAck:v1` | 「完凸のままでOK」（所持状況を入力せず全完凸で探索する）を押した印。計算ページの所持状況のステップと初回の確認モーダルが出なくなる | `src/lib/ownershipAck.ts` |
| `gakumas:calc:memoryPathsDone:v1` | 廃止（メモリー選択のA/Bの枠をやめた。残っていても使わない） | — |
| `gakumas:calcSaves:v1` | セーブデータ一覧。各件に「その育成の全状態」（シナリオ・3 シナリオ分の踏み方・メモリー実体・発動回数・編成・イベント設定・所持状況・保存時の評価値） | 同上、`src/lib/calcSaveIO.ts` |
| `gakumas:schedule:v1` | H.I.F の踏み方（レッスン 8 回のメイン／サブ／SP、授業 6 回、選抜 3 回のタイプ別スコア、選抜ごとの上昇ステの直接入力 `examStats`。null はスコアから分配式。直接入力の選抜はスター性だけスコアから計算する。探索はこの選抜も動かしてよく、スコアを置き換えたら null（スコア入力）に戻す。編集画面ではゲームのログに出る上昇幅（パラボ込み）を入れると、今の編成のパラボ%で元のステに逆算して保存する。スコア欄はスター性用。ステ入力の合計が選抜の上昇基準値（140／440／520）を超えると編集画面に注意を出す。`examBaseline`＝選抜の入力を手で変える前の点数配分の控え（最後に探索が書いた配分か初期値。null＝手で変えていない。元の値に戻すか、探索が点数配分を書くと null。探索の前の確認に使う。旧データには無い＝null）） | `src/lib/useSchedule.ts` |
| `gakumas:niaSchedule:v1` | N.I.A の踏み方（自主レッスン、営業、1 次・2 次オーディションの素点と投票数、最終スコア、最終の素点入力 finalStats） | `src/lib/useNiaSchedule.ts` |
| `gakumas:pIdols:count:v1` | Pアイドルの所持状況を最後に保存したときのPアイドル数（これ以降に追加された新しいPアイドルは特訓6・開花4で持っている扱い。所持状況の保存・セーブデータにも `pIdolCount` として入る） | `src/lib/useOwnedPIdols.ts` |
| `gakumas:calc:sideTabsSeen:v1` | 左端タブの案内（初めて探索したあとの吹き出し）を見たか | `src/components/calc/CalcPage.tsx` |
| `gakumas:hatsuSchedule:v1` | 初の踏み方（レッスン、授業、中間／最終の順位とスコア） | `src/lib/useHatsuSchedule.ts` |
| `gakumas:scenario:v1` | 選択中のシナリオ（`hif` / `niaMaster` / `hatsuLegend` の文字列） | `src/lib/useScenario.ts` |
| `gakumas:memories:v1` | 保存したメモリー（テンプレは含まない） | `src/lib/useMemoryStore.ts` |
| `gakumas:memorySlots:v2` | スロット 4 枠の中身（`SlotMemory`。空枠は null。保存していないメモリーもそのまま入る） | 同上 |
| `gakumas:memorySelection:v1` | 旧形式（スロットのメモリー ID の配列）。v2 が無いときだけ読んで中身に展開する | 同上 |
| `gakumas:memorySets:v1` | メモリーセット（4 枠の中身 `memories`。旧 `memoryIds` は読み込み時に展開。セーブデータ由来のものは `saveId` 付き） | 同上 |
| `gakumas:abilityCountOverrides:v1` | 発動回数の「テンプレとの差分」（セット ID → アビリティ → 回数） | `src/lib/useAbilityCounts.ts` |
| `gakumas:abilityUserSets:v1` | 利用者が追加した発動回数セット（名前・プラン。セーブ由来は `saveId` 付き） | 同上 |
| `gakumas:abilitySelectedSet:v1` | 計算ページで使うセット（プロデュース）の ID | 同上 |
| `gakumas:calc:countAdjust:v1` | 計算ページでの「この育成だけ」の回数調整（セット ID → アビリティ → 回数。デフォルトより優先。セーブ用セットに固めたら消える） | 同上 |
| `gakumas:scheduleChoices:v1` | スケジュールの選択（セット ID → シナリオ → 週の行 id → お出かけ／相談／活動支給／特別指導。null＝休む）。プロデュースごとのデフォルト。**一度も選んでいないテンプレはスプシのスケジュールタブの値を使う**（保存はしない） | 同上 |
| `gakumas:calc:scheduleChoiceAdjust:v1` | 計算ページでの「この育成だけ」のスケジュールの選択（同じ形。「上書き保存」でデフォルトへ移る） | 同上 |
| `gakumas:calc:scenarioSetMemory:v1` | シナリオを切り替えたときに外したプロデュース（シナリオ → セット ID）。探索を押す前に元のシナリオへ戻したら選び直す（この育成だけの変更はセットごとに残っているので一緒に戻る）。探索を押したら消す | `src/lib/scenarioSetMemory.ts` |
| `gakumas:eventCounts:v1` | サポカ設定ページ・点数表で使う前イベ／後イベ／ステイベの手動設定 | `src/lib/useEventCounts.ts` |
| `gakumas:calcEventCounts:v1` | 計算ページ専用の同じ設定（サポカ設定と混ざらないよう別キー） | 同上 |
| `gakumas:ownedLevels:v1` | サポカの所持凸（`card:<名前>` → -1 未所持／0〜4 凸。初回は全カード 4） | `src/lib/useOwnedLevels.ts` |
| `gakumas:pIdols:v1` | P アイドルの所持（`名前カード名` → 特訓・開花。初回は全員 6／4） | `src/lib/useOwnedPIdols.ts` |
| `gakumas:ownedSaves:v1` | 名前つきの所持状況の一覧（保存時のカード枚数つき。セーブデータ用は `saveId` 付き）。所持状況ページのプルダウンで切り替え、「管理・CSV」で新規・名前・複製・削除 | `src/lib/useOwnedSaves.ts` |
| `gakumas:selectedSupports:v1` | 計算ページの選択サポカ 6 枠（ID とレンタルかどうか） | `src/lib/useSelectedSupports.ts` |
| `gakumas:cardFlags:v1` | BAN／固定／レンタルNG | `src/lib/useCardFlags.ts` |
| `gakumas:cardScoreSort:v1` | サポカ点数表の並べ替え状態 | `src/components/card-scores/CardScoreTable.tsx` |
| `gakumas:cardImportRegion:v1` | キャプチャ所持入力で指定した画面範囲 | `src/components/card-import/CardImportPage.tsx` |
| `gakumas:eventCounterRegion:v1` | イベントカウンターの画面範囲 | `src/components/event-counter/EventCounterPage.tsx` |
| `gakumas:eventCounterTeams:v1` | イベントカウンターの編成（サポカ 6 枚の指紋・サムネ・名前） | `src/lib/eventCounter/store.ts` |
| `gakumas:eventCounterRuns:v1` | イベントカウンターの育成記録（最大 1000 件。古いものから消す） | 同上 |
| `gakumas:eventCounterTeam:v1` | イベントカウンターの現在の編成 ID | 同上 |
| `gakumas:eventCounterCards:v1` | 旧バージョンの保存（読み込み後に自動削除） | `EventCounterPage.tsx` |

補足:
- ID の付け方: サポカは `card:<名前>` なので、**スプシでカード名を変えると所持データ・編成・BAN などが別カード扱い**になります。
  発動回数のテンプレセットは `set:<プラン><セット名>`（NIA は `nia:`、初は `hajime:`）。
- `gakumas:store` はイベント名で、保存データではありません（`src/lib/storeSync.ts`）。

---

## 6. よくあるトラブルと見方

### 6-1. 発動回数を変えても点数が変わらない

1. **アビリティが結びついていない**: カードの `nアビ` の名前と `abilityValues` の `name` が違う（括弧・空白以外の 1 文字違いでも別物）。
   `gen:perf` の警告「カードが使うが abilityValues に無いアビリティ」を確認。
2. **回数の参照先が違う**: `abilityValues` の `trigger_tag` が発動回数タブの行名と対応していない。`trigger_tag` が空だと「回数なし＝点数 0」です。
3. **枠 3 は点数に入らない**（レッスンサポート率など）。仕様です。内訳モーダルでは「対象外」と出ます。
4. **参照セットが未選択**: プロデュース設定ページでセットにチェックが無いと、手動系の回数はすべて 0 になります（計算ページは評価値を出しません）。
5. **上限で頭打ち**: 「(N回まで)」の N、またはスケジュール上の回数（お出かけ 5 回など。`abilityCounts.ts` の `abilityMax`）を超えた分は切り捨て。
6. **名前が違う**: 発動回数タブの行名・カードのアビリティ名がコードの正式名（`ABILITY_NAMES`）と違うと無視されます。
   `update-all.cmd` の最後の `check:labels` が未登録の名前を一覧するので、4-1 C-2 の手順で直す。
7. 開発モード（`npm run dev`）でブラウザのコンソールに「未知のアビリティ名」「未知ラベル」の警告が出ます。本番サイトでは出ません。

### 6-2. 画像が出ない

- ドライブに置いただけ → `sync:images` を回す（`update-all.cmd` の 1 段目。`.env.local` にフォルダ ID が無いと飛ばされる）。
- **名前不一致** → スプシの `サポカ名` ／ `前イベ名` ／ `固有スキル名` とファイル名（拡張子を除く）が完全一致しているか。全角「！」と半角「!」、
  スペースの有無、「〜」と「～」などが典型。
- **アップ直後に「無い」と出る** → Cloudflare が「404（無い）」も数分覚えます。スクリプトは毎回一意な問い合わせで回避していますが、
  ブラウザで見て無いときは数分待つかスーパーリロード（Ctrl+F5）。
- 前イベ画像だけ出ない → `gen:preevents` を回したか（`preEventImages.json` に載った名前しか使わない）。`前イベ名` 列にその名前があるか。
- キャプチャ読み取りで新カードが認識されない → `gen:sprite` を回したか（`sprite.png` に無いカードは照合対象外）。
- 全部の画像が出ない → `.env.local` の `VITE_IMAGE_BASE_URL` が無い／間違い。`release` し直す。
- サービスアカウントがフォルダに共有されていない／Drive API 未有効 → `sync:images` が 403 で失敗（`README.md` の初回設定）。

### 6-3. 探索（理想編成）の結果がおかしい

- まず **デバッグページ（/debug）の「診断ログをコピー」** で JSON をコピーして Claude に貼ってください（2026-09-16 に計算ページから移動）。
  「探索を実行」を先に押しておくと、その探索結果も一緒に入ります（`src/lib/diagLog.ts`）。
  設定・踏み方・メモリー・発動回数・所持状況・押す前の評価値・探索結果（編成、踏み方、寄せ方の比較、フェーズ別スコア、取得制限の提案）が入っています。
  コピーできない環境では本文が画面に表示されるので、全選択してコピーします。
- 「探索結果が今の評価値を下回ったため、変更しませんでした」→ 今の編成が条件を満たしていて、探索がそれを超えられなかったとき。仕様です。
- 「SPレッスン率の条件をあと N 枚分満たせませんでした」→ 所持カードに SP率持ちが足りない。条件設定を緩めるか所持状況を確認。
- 「寄せ方の比較」で高い評価値の軸が採用されていない → 括弧内に条件未達（SP率持ち不足・最低ステ未達・最高ステ超過）が出ています。
- 結果が毎回少し違う → 探索は乱数を使いませんが時間制限（約 7 秒）があります。**PC で重い処理（ビルドなど）を同時に動かすと結果が変わる**ことがあります。
- `/debug` ページで、下見した配分の推定点、フェーズ別の到達点、候補プールと採用 6 枚のシナジーを確認できます。
- ボタンが押せない → 「↑の設定で ○○ を選ぶと押せます」の項目（シナリオ・アイドル・Pアイドル・発動回数セット・メモリー）を埋める。

### 6-4. `update-all.cmd` / `release.cmd` が失敗する

黒い窓の「*** FAILED ***」の上に出たメッセージを見ます（分からなければそのまま Claude に貼る）。

| 表示 | 意味と対処 |
|---|---|
| `SYNC_SECRET が未設定のため同期をスキップします` | `.env.local` に `SYNC_SECRET` が無い。スプシ直後の変更は R2 に入らず、毎日 3 時の同期待ちになる |
| `同期に失敗 (403)` | 合言葉が Worker の設定と違う（`wrangler secret put SYNC_SECRET` で設定した値） |
| `Sheets API に失敗 (403)` | スプシをサービスアカウント（`…@….iam.gserviceaccount.com`）に「閲覧者」で共有していない |
| `スキップ: ○○(データ行がない／取得できない)` | そのタブが空か、タブ名が `wrangler.toml` の `SHEET_TABS` と違う。R2 の古いデータが残る |
| `スプシタブ取得に失敗: ○○ (404)` | R2 にそのタブが無い（一度も同期されていない）。上の同期を先に通す |
| `ヘッダー行（先頭セル「アビリティ」）が見つかりません` | 発動回数タブの 2 行目左端が `アビリティ` になっていない |
| `正規化キー衝突` | `abilityValues` に「レアリティ＋名前」が同じ行が 2 つある（括弧・空白違いも同一視） |
| `✗ コードに登録されていない名前が N 件あります` | スプシのアビリティ名・起動タグ・行名がコードに未登録（改名または新アビリティ）。表示された名前を 4-1 C-2（改名）／4-1 D（新規）の手順で直し、`update-all.cmd` をもう一度。JSON の生成は済んでいるので、急ぎなら `release.cmd` で先に出せる（その名前だけ点数 0 のまま） |
| `未対応の段階（無視した）` | `pidleStatus` の `段階` が認識できない名前（4-1 H） |
| `tsc` / `error TS…` | プログラムの型エラー。コードを直したときに出る。Claude に貼る |
| `image sync failed or not configured - continuing` | 画像同期だけ失敗（フォルダ ID 未設定など）。リリース自体は続く |

### 6-5. デプロイしたのにサイトが変わらない

- ブラウザのキャッシュ。スーパーリロード（Ctrl+F5）か、しばらく待つ。
- `release.cmd` は **スプシを取り込みません**。データを変えたなら `update-all.cmd`。
- 同期はしたが `gen:all` の前だった／`SYNC_SECRET` 未設定で古い R2 を読んだ → もう一度 `update-all.cmd`。

### 6-6. 利用者から「データが消えた」と言われた

- localStorage の性質上、ブラウザのデータ削除・別ブラウザ・シークレットモードで消えます（5 章）。復元はできません。
- 保存データが壊れていた場合も初期値に戻ります（サポカ全完凸・P アイドル全員特訓 6 開花 4・メインパラボ 60 点×4）。
- カード名をスプシで変えると、旧名の所持・編成・BAN は別カード扱いになります（5 章の補足）。

### 6-7. 新カードが「勝手に完凸で所持」になっている

仕様です（`useOwnedLevels.ts`: 所持データに無いカードは完凸扱い）。理論値を見たい利用者が多い前提で、未所持にしたい人が自分で変える運用です。

---

## 付録 A. コマンド早見表（`package.json`）

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://localhost:5173）。`/api/*` は動かない |
| `npm run build` | 型チェック（`tsc --noEmit`）＋ `dist/` 生成 |
| `npm run release` | `build` → `wrangler deploy`（= `release.cmd`） |
| `npm run gen:all` | `sync:master` → `gen:cards` → `gen:perf` → `gen:counts` → `gen:pidols` → `gen:sprite` → `gen:preevents` → `check:labels` |
| `npm run check:labels` | スプシの名前がコードに登録済みかの確認だけ（`gen:all` の最後に自動で走る。Node 22.18 以上） |
| `npm run gen:cards` など | 個別の gen（2-2 参照） |
| `npm run sync:master` | スプシ → R2 の同期を今すぐ実行 |
| `npm run sync:images` | ドライブ → R2 の画像同期（`-- --force` で全上書き） |
| `npx wrangler dev` | Worker をローカルで再現（`.dev.vars` に secret を書く） |

## 付録 B. 用語

- **R2**: Cloudflare のファイル置き場。`gakumas-master`（スプシの JSON）と `gakumas-image`（画像）の 2 つ。
- **Worker**: Cloudflare 上で動く小さなサーバー。ここでは「ファイルを配る」「スプシを R2 に写す」だけ。
- **gen（ジェネレート）**: R2 の JSON をアプリが読みやすい形に整えて `src/data/generated/` に書き出すこと。
- **ビルド**: プログラムとデータをまとめて配信用ファイル（`dist/`）にすること。この時点のデータが固定される。
- **デプロイ**: `dist/` を Cloudflare にアップロードして公開すること。
- **localStorage**: ブラウザの中の保存領域。サーバーとは無関係。
- **ティア（Ⅰ〜Ⅴ）**: 凸数で上がるアビリティの段階。`abilityEvolutions` で決まる。
- **回数キー**: 「どの発動回数を参照するか」の名前（`メイン1レッスン` `スキル強化` など）。`trigger_tag` で決まる。
- **踏み方**: レッスン・授業（営業）・選抜（オーディション／試験）でどのタイプを選ぶかの組み合わせ。
- **軸（寄せ方）**: レッスンを多く踏む 2 タイプ（VoDa／DaVi／VoVi）。探索は 3 軸すべてを必ず試す。
- **シナジー（イベント相互作用）**: 前イベ・後イベで増えた発動回数が、編成の他のカードのアビリティにも効く分。
