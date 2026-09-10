/**
 * R2の前イベ画像（preEvent/<前イベ名>.webp）から
 * src/data/generated/preEventImages.json（画像名のカタログ）を生成する。
 *
 * ローカルフォルダは使わない。スプシ supMaster の「前イベ名」を候補にし、
 * R2の公開URLに存在するもの（HTTP 200）だけをカタログに載せる。
 * → 新しい前イベ画像は ①R2の preEvent/<前イベ名>.webp にアップ（ドライブなら sync:images）
 *    ②スプシの「前イベ名」と同じ名前にする ③これを実行、で反映される。
 *
 * カードとの対応づけはビルド時に supportCardsDb が「前イベ名 ∩ このカタログ」で解決する。
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

// 候補 = 「前イベ名」列（前イベで得るアイテム/スキルの正式名）
const rows = await fetchTab("supMaster");
const candidates = new Set();
for (const r of rows) {
  const itemName = String(r["前イベ名"] ?? "").trim();
  if (itemName) candidates.add(itemName);
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
