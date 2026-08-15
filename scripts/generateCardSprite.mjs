/**
 * サポカ画像フォルダ（R2ミラー）から、画面キャプチャ所持入力用のスプライトを生成する。
 *
 * 出力:
 * - public/card-import/sprite.png … 全カードのサムネイル（80x45）をタイル状に並べたもの
 * - src/data/generated/cardSprite.json … { cellW, cellH, cols, names[] }（namesは拡張子なし）
 *
 * 使い方: node scripts/generateCardSprite.mjs
 *   画像フォルダは環境変数 GAKUMAS_IMG_DIR で上書きできる。
 *   新カードが増えたら R2 と同じフォルダに webp を足して再実行する。
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMG_DIR =
  process.env.GAKUMAS_IMG_DIR ?? "C:/Users/micta/OneDrive/画像/学マスサポカ画像";
const CELL_W = 80;
const CELL_H = 45;
const COLS = 14;

const files = readdirSync(IMG_DIR)
  .filter((f) => f.endsWith(".webp"))
  .sort((a, b) => a.localeCompare(b, "ja"));
if (files.length === 0) {
  throw new Error(`画像が見つかりません: ${IMG_DIR}`);
}

const rows = Math.ceil(files.length / COLS);
const cells = [];
for (let i = 0; i < files.length; i++) {
  const buf = await sharp(`${IMG_DIR}/${files[i]}`)
    .resize(CELL_W, CELL_H, { fit: "fill" })
    .removeAlpha()
    .png()
    .toBuffer();
  cells.push({
    input: buf,
    left: (i % COLS) * CELL_W,
    top: Math.floor(i / COLS) * CELL_H,
  });
}

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
  .composite(cells)
  .png({ compressionLevel: 9 })
  .toFile(resolve(outDir, "sprite.png"));

const names = files.map((f) => f.replace(/\.webp$/, ""));
writeFileSync(
  resolve(root, "src/data/generated/cardSprite.json"),
  JSON.stringify({ cellW: CELL_W, cellH: CELL_H, cols: COLS, names }),
  "utf8",
);
console.log(
  `✓ sprite ${files.length}枚 (${COLS * CELL_W}x${rows * CELL_H}) → public/card-import/sprite.png`,
);
