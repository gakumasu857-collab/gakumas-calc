/**
 * 現行スプシの pidleName / pidleStatus / idleTypes（R2経由）から
 * src/data/generated/pIdols.json を生成する。
 *
 * 出力:
 * {
 *   masters: [{ url, idol, cardName, rarity, plan, effect, key, growthTag }],
 *   growth: { 成長タグ: { base:[7], kunren1:[7], kunren4:[7], kunren5:[7], kaika3:[7], kaika4:[7] } },
 *     ※ 配列は [体力, Vo初期値, Da初期値, Vi初期値, Voパラボ, Daパラボ, Viパラボ]
 *   idolRanks: { アイドル名: { vocal, dance, visual, tag } }
 * }
 *
 * 現行スプシは3タブとも tidy（1行=1レコード）。旧 sheet-source/hif.xlsx のセル番地
 * パースは廃止。画像URLは pidleName に列が無いため、版管理された scripts/idolImages.json
 * （名前カード名 → 画像URL）から引く。新アイドルは同ファイルに1行足すか、空のままでよい
 * （空なら画像なしで動く）。自分の前回出力には依存しない＝ゼロから再生成しても画像が消えない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab, num } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/pIdols.json");
const imagesPath = resolve(root, "scripts/idolImages.json");

// 画像URL（seesaawiki）を key で引く。ソースは版管理された idolImages.json。
const prevUrlByKey = new Map();
try {
  const images = JSON.parse(readFileSync(imagesPath, "utf8"));
  for (const [key, url] of Object.entries(images)) if (key && url) prevUrlByKey.set(key, url);
} catch {
  /* 画像マップが無ければ全 url 空（画像なしで動作） */
}

const [pidleName, pidleStatus, idleTypes] = await Promise.all([
  fetchTab("pidleName"),
  fetchTab("pidleStatus"),
  fetchTab("idleTypes"),
]);

// ---- masters ----
const masters = pidleName.map((r) => ({
  url: prevUrlByKey.get(r["名前カード名"]) ?? "",
  idol: r["名前"] ?? "",
  cardName: r["カード名"] ?? "",
  rarity: r["レアリティ"] ?? "",
  plan: r["プラン"] ?? "",
  effect: r["おすすめ効果"] ?? "",
  key: r["名前カード名"] ?? "",
  growthTag: r["成長タグ"] ?? "",
}));

// ---- growth（段階行→ブロック、[体力,Vo,Da,Vi,Voパラボ,Daパラボ,Viパラボ]）----
const STAGE_TO_BLOCK = {
  初期: "base",
  特訓1: "kunren1",
  特訓4: "kunren4",
  特訓5: "kunren5",
  才能開花3: "kaika3",
  才能開花4: "kaika4",
};
const growth = {};
for (const r of pidleStatus) {
  const tag = r["成長タグ"];
  const block = STAGE_TO_BLOCK[r["段階"]];
  if (!tag || !block) continue;
  (growth[tag] ??= {})[block] = [
    num(r["体力"]),
    num(r["Vo初期値"]),
    num(r["Da初期値"]),
    num(r["Vi初期値"]),
    num(r["Voパラボ"]),
    num(r["Daパラボ"]),
    num(r["Viパラボ"]),
  ];
}
// 欠けている段階は 0 埋め（全段階そろっている前提だが安全側で補完）
const ZERO = [0, 0, 0, 0, 0, 0, 0];
for (const entry of Object.values(growth)) {
  for (const block of Object.values(STAGE_TO_BLOCK)) entry[block] ??= [...ZERO];
}

// ---- idolRanks ----
const idolRanks = {};
for (const r of idleTypes) {
  const name = r["名前"];
  if (!name) continue;
  idolRanks[name] = {
    vocal: num(r["Vocal"]),
    dance: num(r["Dance"]),
    visual: num(r["Visual"]),
    tag: r["型"] ?? "",
  };
}

writeFileSync(outPath, JSON.stringify({ masters, growth, idolRanks }, null, 1), "utf8");
const noUrl = masters.filter((m) => !m.url);
console.log(
  `✓ masters ${masters.length}件 / growth ${Object.keys(growth).length}タグ / idolRanks ${Object.keys(idolRanks).length}人` +
    (noUrl.length ? `（画像未設定 ${noUrl.length}件: idolImages.json に追加可）` : ""),
);
if (noUrl.length) console.warn("  画像なし:", noUrl.map((m) => m.key).join(", "));
