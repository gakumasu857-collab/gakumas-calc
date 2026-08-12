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
 * - main1/main2/sub（回数キー）は下記ルールで導出:
 *     ・レッスン系（trigger_tag ∈ LESSON_TAGS）  → ロール別 `メイン1/2/サブ{tag}`
 *     ・それ以外                                → アビリティ名そのもの（回数キー = 名前）
 *     ・例外だけ COUNT_KEY_OVERRIDES で上書き（実行時リゾルバに合わせた括弧幅・非スコア化）
 *   → 新アビリティは基本この規則で自動的に正しい回数キーになる。特殊挙動のときだけ1行追加する。
 * - slotTier   = abilityEvolutions の 凸→レベル番号(1..5) を index(0..4)。tiers とペアで使う。
 * - fixedCounts= 回数固定アビリティの発動回数（スプシに無いアプリ側の設定）。ここで定義する。
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
 * 回数キーの例外表（キー = 正規化した "レアリティ+アビリティ名"）。
 * 既定は「回数キー = アビリティ名」。実行時リゾルバに合わせて上書きが要るものだけ列挙する。
 * - お出かけ/相談/活動支給/スキル削除(4回まで): スプシ名は全角括弧だがスケジュール解決は半角括弧。
 * - SPレッスン率: 点数計算では回数キー「何もなし」＝非スコア（率はパラボ計算側で使う）。
 * - SR活動支給・差し入れ(2回まで): 回数キー無し＝非スコア（null）。
 */
const COUNT_KEY_OVERRIDES = {
  "SSRお出かけ(2回まで)": "お出かけ(2回まで)",
  "SSR相談(2回まで)": "相談(2回まで)",
  "SSR活動支給・差し入れ(2回まで)": "活動支給・差し入れ(2回まで)",
  "SSRスキル削除(4回まで)": "スキル削除(4回まで)",
  "SRSPレッスン率": "何もなし",
  "SSRSPレッスン率": "何もなし",
  "配布SSRSPレッスン率": "何もなし",
  "SR活動支給・差し入れ(2回まで)": null,
};

/**
 * 回数固定アビリティの発動回数（試験・オーディションの回数がシナリオで変わる）。
 * スプシに無いアプリ固有の設定なのでここが源。"auto" はスケジュール自動集計。
 * 新しい固定回数アビリティを足すときはここに1行追加する。
 */
const fixedCounts = {
  レッスン: "auto",
  SPレッスン: "auto",
  通常レッスン: "auto",
  初期値: { normal: 1, hatsu: 1, hif: 1 },
  パラメータボーナス: { normal: 1, hatsu: 1, hif: 1 },
  パラメータイベント: { normal: 1, hatsu: 1, hif: 1 },
  SPレッスン率: { normal: 1, hatsu: 1, hif: 1 },
  何もなし: { normal: 0, hatsu: 0, hif: 0 },
  "試験終了時（2回まで）": { normal: 2, hatsu: 2, hif: 2 },
  "試験・オーディション": { normal: 3, hatsu: 2, hif: 5 },
};

/** 1アビリティ行 → 回数キー3種（main1/main2/sub）。null は「回数キー無し＝非スコア」 */
function countKeys(normKey, name, tag) {
  if (LESSON_TAGS.has(tag)) {
    return { main1: `メイン1${tag}`, main2: `メイン2${tag}`, sub: `サブ${tag}` };
  }
  // 既定は名前そのもの。例外表にあればそれ（null 含む）で上書き。
  const key = normKey in COUNT_KEY_OVERRIDES ? COUNT_KEY_OVERRIDES[normKey] : name;
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
  perf[key] = { tiers, ...countKeys(key, name, tag) };
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
    for (let i = 1; i <= 6; i++) {
      const label = (c[`ability${i}`] ?? "").trim();
      if (!label) continue;
      const k = norm(`${RA[c.rarity] ?? c.rarity}${label}`);
      if (!(k in perf) && !seen.has(k)) {
        seen.add(k);
        missing.push(`${c.rarity} ${label}`);
      }
    }
  }
} catch {
  /* supportCards.json 未生成なら警告スキップ */
}

const out = { perf, slotTier, fixedCounts };
writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
console.log(
  `✓ perf ${Object.keys(perf).length}件 / slotTier ${Object.keys(slotTier).length}レア / fixedCounts ${Object.keys(fixedCounts).length}件` +
    (dup ? `（正規化キー衝突 ${dup}件！ 括弧・空白の表記を確認）` : ""),
);
if (missing.length) {
  console.warn(
    `⚠ カードが使うが abilityValues に無いアビリティ ${missing.length}種（非スコア扱い・要スプシ追加確認）:\n  ` +
      missing.join("\n  "),
  );
}
