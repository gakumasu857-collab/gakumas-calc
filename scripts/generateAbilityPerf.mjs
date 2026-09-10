/**
 * 現行スプシの abilityValues / abilityEvolutions（R2経由）から
 * src/data/generated/abilityPerf.json を生成する。
 *
 * 出力: { perf: {"SSRレッスン":{tiers,main1,main2,sub}}, slotTier:{SSR,EventSSR,SR}, fixedCounts }
 *
 * 設計方針（新アビリティ追加を前提に自己完結）:
 * - 旧 abilityPerf.json は一切読まない。スプシ＋このスクリプト内の明示ルールだけで決定的に生成する。
 * - tiers      = abilityValues.level1..5（新＝リベース済み）。
 * - perfキー   = 正規化名（全角括弧→半角・空白除去）。sheetScore.perfOf も同じ正規化で引く。
 * - main1/main2/sub（回数キー）はスプシの trigger_tag 列から導出:
 *     ・レッスン系（trigger_tag ∈ LESSON_TAGS）→ ロール別 `メイン1/2/サブ{tag}`
 *     ・trigger_tag あり → trigger_tag そのもの。ただしアビリティ名に「（N回まで）」が
 *       付くときは回数キーにも付加する（参照は基準回数・上限は名前のN。
 *       例: 活動支給・差し入れ（2回まで）+ tag 活動支給・差し入れ → 活動支給・差し入れ（2回まで））
 *     ・trigger_tag 空 → 発動参照なし＝非スコア（null。内訳モーダルで—表示）。
 *       例外: EMPTY_TAG_FIXED（初期値等、アプリ側の固定回数1で採点するもの）は名前で引く。
 *   → スプシに行を足すときは trigger_tag に基準名を書けばそのまま動く。
 * - slotTier   = abilityEvolutions の 凸→レベル番号(1..5) を index(0..4)。tiers とペアで使う。
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/abilityPerf.json");
const cardsPath = resolve(root, "src/data/generated/supportCards.json");

/** 全角括弧→半角・空白除去（perfキー・オーバーライドキーの正規化） */
const norm = (s) => (s ?? "").replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, "");
const numOrNull = (v) => (typeof v === "number" ? v : v === "" || v == null ? null : Number(v));

/** ロール別回数キーになるレッスン系タグ（スケジュールから回数を引く） */
const LESSON_TAGS = new Set(["レッスン", "SPレッスン", "通常レッスン"]);

/**
 * trigger_tag が空でも採点するアビリティ（アプリ側 FIXED_ABILITY_COUNTS が固定回数で解決）。
 * パラメータボーナスは専用の%変換で回数キーを使わないため列挙不要。
 */
const EMPTY_TAG_FIXED = new Set(["初期値", "パラメータイベント"]);

// 回数固定アビリティの発動回数は src/data/fixedAbilityCounts.ts に移設（アプリが直接参照）

/** アビリティ名末尾の「（N回まで）」（全角/半角どちらでも） */
const CAP_SUFFIX_RE = /[（(]\d+回まで[)）]\s*$/;

/** 1アビリティ行 → 回数キー3種（main1/main2/sub）。null は「回数キー無し＝非スコア」 */
function countKeys(name, tag) {
  if (LESSON_TAGS.has(tag)) {
    return { main1: `メイン1${tag}`, main2: `メイン2${tag}`, sub: `サブ${tag}` };
  }
  let key;
  if (!tag) {
    key = EMPTY_TAG_FIXED.has(name) ? name : null;
  } else {
    // 参照は trigger_tag。名前に（N回まで）があれば上限として回数キーに付加する
    const cap = name.match(CAP_SUFFIX_RE)?.[0];
    key = cap && !CAP_SUFFIX_RE.test(tag) ? `${tag}${cap}` : tag;
  }
  return { main1: key, main2: key, sub: key };
}

const [abilityValues, abilityEvolutions] = await Promise.all([
  fetchTab("abilityValues"),
  fetchTab("abilityEvolutions"),
]);

// ---- perf（正規化キー）----
const perf = {};
let dup = 0;
for (const row of abilityValues) {
  const name = (row.name ?? "").trim();
  const rarity = (row.rarity ?? "").trim();
  if (!name || !rarity) continue;
  const key = norm(`${rarity}${name}`);
  if (key in perf) dup++;
  const tiers = [1, 2, 3, 4, 5].map((i) => numOrNull(row[`level${i}`]));
  const tag = (row.trigger_tag ?? "").trim();
  perf[key] = { tiers, ...countKeys(name, tag) };
}

// ---- slotTier（凸→ティアindex）----
const RARITY_MAP = { SSR: "SSR", 配布SSR: "EventSSR", SR: "SR", R: "R" };
const slotTier = { SSR: [], EventSSR: [], SR: [], R: [] };
for (const [sheetR, appR] of Object.entries(RARITY_MAP)) {
  for (let slot = 0; slot < 6; slot++) {
    const e = abilityEvolutions.find(
      (x) => x["レアリティ"] === sheetR && x["アビリティ"] === `ability${slot + 1}`,
    );
    slotTier[appR][slot] = e
      ? [0, 1, 2, 3, 4].map((k) => Number(e[`${k}凸`]) - 1)
      : [0, 0, 0, 0, 0];
  }
}

// ---- カードが使うアビリティで perf に無いもの（＝スプシ側のアビリティ追加漏れ）を警告 ----
// 点数には影響しない（未登録枠は 0 として飛ばす）が、新カード追加時の抜けを可視化する。
let missing = [];
try {
  const cards = JSON.parse(readFileSync(cardsPath, "utf8"));
  const RA = { SSR: "SSR", SR: "SR", 配布SSR: "配布SSR", R: "R" };
  const seen = new Set();
  for (const c of cards) {
    const rarity = c["レアリティ"];
    for (let i = 1; i <= 6; i++) {
      const label = String(c[`${i}アビ`] ?? "").trim();
      if (!label) continue;
      const k = norm(`${RA[rarity] ?? rarity}${label}`);
      if (!(k in perf) && !seen.has(k)) {
        seen.add(k);
        missing.push(`${rarity} ${label}`);
      }
    }
  }
} catch {
  /* supportCards.json 未生成なら警告スキップ */
}

const out = { perf, slotTier };
writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
console.log(
  `✓ perf ${Object.keys(perf).length}件 / slotTier ${Object.keys(slotTier).length}レア` +
    (dup ? `（正規化キー衝突 ${dup}件！ 括弧・空白の表記を確認）` : ""),
);
if (missing.length) {
  console.warn(
    `⚠ カードが使うが abilityValues に無いアビリティ ${missing.length}種（非スコア扱い・要スプシ追加確認）:\n  ` +
      missing.join("\n  "),
  );
}
