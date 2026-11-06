# 自動更新（GitHub）の使い方

スプシと画像を直したら、何もしなくても毎日 **4:00（日本時間）** に本番へ反映されます。
中身は update-all.cmd と同じです（ドライブの画像 → スプシ → ビルド → 公開）。
仕組みはリポジトリの `.github/workflows/auto-update.yml`。

## すぐ反映したいとき

1. https://github.com/gakumasu857-collab/gakumas-calc/actions を開く
2. 左の「自動更新（スプシ・画像 → 本番）」を押す
3. 右の「Run workflow」→ 緑の「Run workflow」を押す（スマホのブラウザからも押せます）
4. 2〜5分で、一覧の行が緑のチェックになれば反映済み。赤の × なら失敗（下の「失敗したとき」）

## 最初に1回だけやること（鍵の登録）

鍵は GitHub の「Secrets」に入れます。入れた中身は登録した本人も見られず、ログにも伏せ字で出ます。
リポジトリは公開ですが、Secrets は外から見えません。

### 1. Cloudflare の鍵を作る

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. 「Create Token」→「Edit Cloudflare Workers」の「Use template」
3. 「Permissions」に **Account ／ Workers R2 Storage ／ Edit** が無ければ「+ Add more」で足す
4. 「Account Resources」は自分のアカウント、「Zone Resources」は **Specific zone → hoppepan.com**
5. 「Continue to summary」→「Create Token」。出てきた長い文字列をコピー（この画面でしか見られません）

### 2. GitHub に3つ登録する

https://github.com/gakumasu857-collab/gakumas-calc/settings/secrets/actions を開き、
「New repository secret」で次の3つを1つずつ登録します（Name は大文字・下線までそのまま）。

| Name | Secret に貼るもの |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 1 でコピーした文字列 |
| `ENV_LOCAL` | `C:\Users\micta\hopemasu\.env.local` をメモ帳で開いて、中身を全部コピー |
| `GCP_SERVICE_ACCOUNT_JSON` | `C:\Users\micta\hopemasu\service-account.json` をメモ帳で開いて、中身を全部コピー |

### 3. 試しに1回動かす

上の「すぐ反映したいとき」の手順で Run workflow を押し、緑のチェックになるのを確かめます。

## 失敗したとき

- 失敗すると GitHub からメールが届きます。本番は前の状態のまま（壊れたものは出ません）。
- Actions の赤い × の行を開くと、どの段階で止まったか分かります。その画面のURLか文字を Claude に貼ってください。
- 「鍵がまだ登録されていません」と出たら、2 の登録が足りていません。

## 知っておくこと

- **公開されるのは GitHub に上がっているコード**です。Claude が手元で作業中の変更は、GitHub に上げるまで出ません。
  「本番に出して」と言われたら、Claude が GitHub に上げます（上げると自動で公開されます）。
- スプシを直している途中の時間（4:00）に当たると、書きかけの内容が出ます。夜中に作業するときは気をつけてください。
- 名前を変えたとき・特別な数え方のアビリティを足したときは、今まで通り Claude の作業が要ります。
- 公開リポジトリは、**60日間 コードの更新が無いと毎日の自動実行を GitHub が止めます**（止まる前にメールが来ます）。
  止まったら Actions 画面の「Enable workflow」を押せば戻ります。
- 手元の update-all.cmd も今まで通り使えます。ただし手元のフォルダの中身をそのまま公開するので、
  手元に GitHub より古い（または新しい）コードがあると、それが出ます。普段は GitHub の自動更新に任せてください。
- GitHub Actions は公開リポジトリなら無料です。
