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
 * パースは廃止。画像は今後まとめて R2 に上げる予定のため、ここでは url を空の仮置きにする
 * （表示側 imageUrl() は空なら何も出さない）。R2 反映時は url をR2内のファイル名にするか、
 * サポカ同様の名前一致カタログで解決する。
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab, num } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/pIdols.json");

const [pidleName, pidleStatus, idleTypes] = await Promise.all([
  fetchTab("pidleName"),
  fetchTab("pidleStatus"),
  fetchTab("idleTypes"),
]);

// ---- masters ----
const masters = pidleName.map((r) => ({
  // 画像は R2 の skill/<固有スキル名>.webp（固有スキル画像で識別する）
  url: r["固有スキル名"] ? `skill/${r["固有スキル名"]}.webp` : "",
  idol: r["名前"] ?? "",
  cardName: r["カード名"] ?? "",
  skillName: r["固有スキル名"] ?? "",
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
const withImage = masters.filter((m) => m.url).length;
console.log(
  `✓ masters ${masters.length}件 / growth ${Object.keys(growth).length}タグ / idolRanks ${Object.keys(idolRanks).length}人 / 画像(skill/) ${withImage}件`,
);
