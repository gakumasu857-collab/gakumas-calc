/**
 * R2のサポカ画像から、画面キャプチャ所持入力用のスプライトを生成する。
 *
 * 画像はローカルフォルダではなく R2 の公開URLから直接取得する
 * （対象キーは supportCards.json のカード名 = R2直下の `<カード名>.webp`）。
 * → 新カードはスプシに行を足して R2 に webp を上げれば、ローカルに置く必要はない。
 *    ※ 事前に gen:cards を実行して supportCards.json を最新にしておくこと。
 *
 * 出力:
 * - public/card-import/sprite.png … 全カードのサムネイル（80x45）をタイル状に並べたもの
 * - src/data/generated/cardSprite.json … { cellW, cellH, cols, names[] }
 *
 * 使い方: npm run gen:sprite
 *   取得元は環境変数 GAKUMAS_IMAGE_BASE（既定はR2の公開URL）で上書きできる。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_BASE =
  process.env.GAKUMAS_IMAGE_BASE ??
  "https://pub-682e5459d444420f987d43ca384a3b0a.r2.dev";
const CELL_W = 80;
const CELL_H = 45;
const COLS = 14;
const CONCURRENCY = 12;

const cards = JSON.parse(
  readFileSync(resolve(root, "src/data/generated/supportCards.json"), "utf8"),
);
const names = [...new Set(cards.map((c) => String(c.name)))].sort((a, b) =>
  a.localeCompare(b, "ja"),
);

/** 1枚取得してサムネイル化（404等は null） */
async function fetchCell(name) {
  const url = `${IMAGE_BASE}/${encodeURIComponent(`${name}.webp`)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf)
    .resize(CELL_W, CELL_H, { fit: "fill" })
    .removeAlpha()
    .png()
    .toBuffer();
}

const cells = new Array(names.length).fill(null);
const missing = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < names.length) {
      const i = cursor++;
      const cell = await fetchCell(names[i]);
      if (cell) cells[i] = cell;
      else missing.push(names[i]);
    }
  }),
);

// 画像が無いカードはスプライトから除外（照合対象外になるだけ）
const entries = names
  .map((name, i) => ({ name, cell: cells[i] }))
  .filter((e) => e.cell !== null);
const rows = Math.ceil(entries.length / COLS);

const outDir = resolve(root, "public/card-import");
mkdirSync(outDir, { recursive: true });
await sharp({
  create: {
    width: COLS * CELL_W,
    height: rows * CELL_H,
    channels: 3,
    background: { r: 0, g: 0, b: 0 },
  },
})
  .composite(
    entries.map((e, i) => ({
      input: e.cell,
      left: (i % COLS) * CELL_W,
      top: Math.floor(i / COLS) * CELL_H,
    })),
  )
  .png({ compressionLevel: 9 })
  .toFile(resolve(outDir, "sprite.png"));

writeFileSync(
  resolve(root, "src/data/generated/cardSprite.json"),
  JSON.stringify({
    cellW: CELL_W,
    cellH: CELL_H,
    cols: COLS,
    names: entries.map((e) => e.name),
  }),
  "utf8",
);
console.log(
  `✓ sprite ${entries.length}枚 (${COLS * CELL_W}x${rows * CELL_H}) → public/card-import/sprite.png`,
);
if (missing.length > 0) {
  console.warn(`⚠ R2に画像が無いカード ${missing.length}件: ${missing.join("、")}`);
}
