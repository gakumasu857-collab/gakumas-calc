/**
 * sheet-source/json の 所持Pアイドルステ・Pアイドル成長 から
 * src/data/generated/pIdols.json を生成する。
 *
 * 出力:
 * {
 *   masters: [{ url, idol, cardName, rarity, plan, effect, key, growthTag }],
 *   growth: { 成長タグ: { base:[7], kunren1:[7], kunren4:[7], kunren5:[7], kaika3:[7], kaika4:[7] } },
 *     ※ 配列は [体力, Vo固定, Da固定, Vi固定, Voパラボ, Daパラボ, Viパラボ]
 *   idolRanks: { アイドル名: { vocal, dance, visual, tag } }  // 審査基準ランクとバランス/特化
 * }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) =>
  JSON.parse(readFileSync(resolve(root, `sheet-source/json/${name}.json`), "utf8"));

const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// ---- masters（所持Pアイドルステ A..H列）----
const ste = load("所持Pアイドルステ");
const masters = [];
for (let r = 2; r <= 1000; r++) {
  const key = ste[`G${r}`]?.v;
  if (!key) continue;
  masters.push({
    url: ste[`A${r}`]?.v ?? "",
    idol: ste[`B${r}`]?.v ?? "",
    cardName: ste[`C${r}`]?.v ?? "",
    rarity: ste[`D${r}`]?.v ?? "",
    plan: ste[`E${r}`]?.v ?? "",
    effect: ste[`F${r}`]?.v ?? "",
    key,
    growthTag: ste[`H${r}`]?.v ?? "",
  });
}

// ---- growth（Pアイドル成長）----
const g = load("Pアイドル成長");
const BLOCKS = {
  base: "B", // 初期
  kunren1: "J", // 特訓1（特訓段階>=1）
  kunren4: "R", // 特訓4（>=4）
  kunren5: "Z", // 特訓5（>=5）
  kaika3: "AH", // 才能開花3（>=3）
  kaika4: "AP", // 才能開花4（>=4）
};
const growth = {};
for (let r = 3; r <= 1000; r++) {
  const tag = g[`A${r}`]?.v;
  if (!tag) continue;
  const entry = {};
  for (const [name, startCol] of Object.entries(BLOCKS)) {
    const start = colNum(startCol);
    entry[name] = Array.from({ length: 7 }, (_, i) => {
      const v = g[`${colName(start + i)}${r}`]?.v;
      return typeof v === "number" ? v : 0;
    });
  }
  growth[tag] = entry;
}

// ---- idolRanks（AX..BB列: 名前, Vocal, Dance, Visual, タグ）----
const idolRanks = {};
for (let r = 2; r <= 100; r++) {
  const name = g[`AX${r}`]?.v;
  if (!name) continue;
  idolRanks[name] = {
    vocal: g[`AY${r}`]?.v ?? 0,
    dance: g[`AZ${r}`]?.v ?? 0,
    visual: g[`BA${r}`]?.v ?? 0,
    tag: g[`BB${r}`]?.v ?? "",
  };
}

writeFileSync(
  resolve(root, "src/data/generated/pIdols.json"),
  JSON.stringify({ masters, growth, idolRanks }, null, 1),
  "utf8",
);
console.log(
  `✓ masters ${masters.length}件 / growth ${Object.keys(growth).length}タグ / idolRanks ${Object.keys(idolRanks).length}人`,
);
