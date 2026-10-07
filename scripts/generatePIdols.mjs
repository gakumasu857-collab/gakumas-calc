/**
 * 現行スプシの pidleName / pidleStatus / idleTypes（R2経由）から
 * src/data/generated/pIdols.json を生成する。
 *
 * 出力:
 * {
 *   masters: [{ url, idol, cardName, skillName, rarity, plan, effect, key, growthTag, sheetId }],
 *     ※ sheetId はスプシ pidleName の id 列（2026-10-07 追加）。あればその順に並べる（保存キーは key のまま）
 *   growth: { 成長タグ: { base:[10], kunren1:[10], kunren2:[10], kunren4:[10], kunren5:[10],
 *                        kunren6:[10], kaika1:[10], kaika3:[10], kaika4:[10] } },
 *     ※ 配列は [体力, Vo初期値, Da初期値, Vi初期値, Voパラボ, Daパラボ, Viパラボ, VoSP率, DaSP率, ViSP率]
 *     ※ パラボ・SP率はスプシの小数表記のまま（0.11 = 11%）。%変換は pIdol.ts 側で行う
 *     ※ 無条件で加算する段階（初期・初・NIA・HIF）は base に合算済み
 *     ※ 親愛度の段階（親愛度22・親愛度25＝最大体力）は取り込まない。親愛度は計算機側の設定で
 *        扱う（src/data/affection.ts）ので、スプシに行が残っていても無視する
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
  sheetId: num(r["id"]),
}));
// スプシの id 列（2026-10-07 追加）が全行にあれば、その順に並べる（行の順に頼らない）
if (masters.length > 0 && masters.every((m) => m.sheetId > 0)) {
  masters.sort((a, b) => a.sheetId - b.sheetId);
}

// ---- growth（段階行→ブロック）----
// 段階のうち 初期・初・NIA・HIF は所持状況によらず常に効く（無条件加算）ので base に合算する。
// 特訓・才能開花は段階条件つきの個別ブロック。
const UNCONDITIONAL_STAGES = new Set(["初期", "初", "NIA", "HIF"]);
// 親愛度は計算機側の設定（src/data/affection.ts）で扱うので、スプシに行が残っていても取り込まない
const IGNORED_STAGES = new Set(["親愛度22", "親愛度25"]);
const STAGE_TO_BLOCK = {
  特訓1: "kunren1",
  特訓2: "kunren2",
  特訓4: "kunren4",
  特訓5: "kunren5",
  特訓6: "kunren6",
  才能開花1: "kaika1",
  才能開花3: "kaika3",
  才能開花4: "kaika4",
};
const COLS = [
  "体力",
  "Vo初期値",
  "Da初期値",
  "Vi初期値",
  "Voパラボ",
  "Daパラボ",
  "Viパラボ",
  "VoSP率",
  "DaSP率",
  "ViSP率",
];
const round4 = (v) => Math.round(v * 10000) / 10000; // 小数合算の浮動小数ノイズ除去
const growth = {};
const unknownStages = new Set();
for (const r of pidleStatus) {
  const tag = r["成長タグ"];
  if (!tag) continue;
  const stage = r["段階"];
  if (IGNORED_STAGES.has(stage)) continue;
  const block = UNCONDITIONAL_STAGES.has(stage)
    ? "base"
    : STAGE_TO_BLOCK[stage];
  if (!block) {
    if (stage) unknownStages.add(stage);
    continue;
  }
  const entry = (growth[tag] ??= {});
  const target = (entry[block] ??= new Array(COLS.length).fill(0));
  COLS.forEach((col, i) => {
    target[i] = round4(target[i] + num(r[col]));
  });
}
// 欠けている段階は 0 埋め（タグにより存在しない段階があるため）
const ZERO = new Array(COLS.length).fill(0);
const ALL_BLOCKS = ["base", ...Object.values(STAGE_TO_BLOCK)];
for (const entry of Object.values(growth)) {
  for (const block of ALL_BLOCKS) entry[block] ??= [...ZERO];
}
if (unknownStages.size > 0) {
  console.warn(`⚠ 未対応の段階（無視した）: ${[...unknownStages].join(", ")}`);
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
