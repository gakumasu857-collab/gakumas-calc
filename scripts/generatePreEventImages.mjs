/**
 * R2の前イベ画像（preEvent/<前イベ名>.webp）から
 * src/data/generated/preEventImages.json（画像名のカタログ）を生成する。
 *
 * ローカルフォルダは使わない。スプシ supMaster の Search_word の全語を候補にし、
 * R2の公開URLに存在するもの（HTTP 200）だけをカタログに載せる。
 * → 新しい前イベ画像は ①R2の preEvent/<前イベ名>.webp にアップ
 *    ②スプシの Search_word に前イベ名（半角カンマ区切り）を追記 ③これを実行、で反映される。
 *
 * カードとの対応づけはビルド時に supportCardsDb が
 * 「Search_word ∩ このカタログ」で解決する。
 *
 * 使い方: npm run gen:preevents
 *   取得元は環境変数 GAKUMAS_IMAGE_BASE（既定はR2の公開URL）で上書きできる。
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_BASE =
  process.env.GAKUMAS_IMAGE_BASE ??
  "https://pub-682e5459d444420f987d43ca384a3b0a.r2.dev";
const CONCURRENCY = 20;

// Search_word の全語（半角カンマ区切り）を候補にする
const rows = await fetchTab("supMaster");
const candidates = new Set();
for (const r of rows) {
  for (const word of String(r.Search_word ?? "").split(",")) {
    const w = word.trim();
    if (w) candidates.add(w);
  }
}

const list = [...candidates];
const found = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < list.length) {
      const name = list[cursor++];
      const url = `${IMAGE_BASE}/preEvent/${encodeURIComponent(name)}.webp`;
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) found.push(name);
    }
  }),
);

found.sort((a, b) => a.localeCompare(b, "ja"));
writeFileSync(
  resolve(root, "src/data/generated/preEventImages.json"),
  JSON.stringify(found),
  "utf8",
);
console.log(
  `✓ 前イベ画像カタログ ${found.length}件（候補語 ${list.length}語をR2で照会）→ preEventImages.json`,
);
