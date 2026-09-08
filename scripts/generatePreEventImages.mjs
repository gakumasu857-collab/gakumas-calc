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
  "https://img.hoppepan.com";
const CONCURRENCY = 20;

// item_name（前イベで得るアイテム/スキルの正式名）を第一候補に、
// 旧データ用に Search_word の全語（半角カンマ区切り）も候補にする
const rows = await fetchTab("supMaster");
const candidates = new Set();
for (const r of rows) {
  // 2026-08 ヘッダー日本語化: 前イベ名(旧item_name)・検索ワード(旧Search_word)
  const itemName = String(r["前イベ名"] ?? r.item_name ?? "").trim();
  if (itemName) candidates.add(itemName);
  for (const word of String(r["検索ワード"] ?? r.Search_word ?? "").split(",")) {
    const w = word.trim();
    if (w) candidates.add(w);
  }
}

const NOCACHE = Date.now();
const list = [...candidates];
const found = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < list.length) {
      const name = list[cursor++];
      // 404の否定キャッシュを避けるため一意なクエリを付ける（gen:sprite と同じ理由）
      const url = `${IMAGE_BASE}/preEvent/${encodeURIComponent(name)}.webp?v=${NOCACHE}`;
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
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
