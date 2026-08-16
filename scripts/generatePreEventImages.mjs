/**
 * 前イベ画像フォルダ（R2の preEvent/ と同じ内容のローカルミラー）から
 * src/data/generated/preEventImages.json（画像名のカタログ）を生成する。
 *
 * カードとの対応づけはビルド時に supportCardsDb が
 * 「Search_word（半角カンマ区切り）∩ このカタログ」で解決する。
 *
 * 使い方: npm run gen:preevents
 *   フォルダは環境変数 GAKUMAS_PRE_EVENT_DIR で上書きできる。
 *   新しい前イベ画像は ①このフォルダに <前イベ名>.webp を置く
 *   ②R2 gakumas-image の preEvent/<前イベ名>.webp にアップ ③これを実行、で反映される。
 */
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR =
  process.env.GAKUMAS_PRE_EVENT_DIR ??
  "C:/Users/micta/Downloads/redketchup (1)/サポカ前イベ";

const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".webp"))
  .map((f) => f.replace(/\.webp$/, ""))
  .sort((a, b) => a.localeCompare(b, "ja"));

writeFileSync(
  resolve(root, "src/data/generated/preEventImages.json"),
  JSON.stringify(names),
  "utf8",
);
console.log(`✓ 前イベ画像カタログ ${names.length}件 → preEventImages.json`);
