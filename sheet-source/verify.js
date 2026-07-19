/**
 * 点数計算ロジックの検算スクリプト。
 * メイン1DB!F2 のLET式をJSで再実装し、シートの計算済み値
 * （メイン1DB/メイン2DB/サブDB × 全カード × 0〜4凸）と突き合わせる。
 *
 * 使い方: node verify.js [--mode=I|scan]
 *   --mode=I    メイン1回数キーを厳密にI列から取る（式の字面どおり）
 *   --mode=scan メイン1回数キーをD..I列の最初の文字列セルから取る（データの実態）
 */
const fs = require("fs");

const load = (name) => JSON.parse(fs.readFileSync(`json/${name}.json`, "utf8"));
const colRef = (col, row) => `${col}${row}`;

const MODE = (process.argv.find((a) => a.startsWith("--mode=")) || "--mode=scan").split("=")[1];

// ---- アビリティ性能: 検索用結合 → ティア値 & 回数キー ----
const perfCells = load("アビリティ性能");
const perf = new Map();
for (let r = 2; r <= 200; r++) {
  const key = perfCells[colRef("C", r)]?.v;
  if (!key) continue;
  const tierCols = ["D", "E", "F", "G", "H"];
  const tiers = tierCols.map((c) => {
    const v = perfCells[colRef(c, r)]?.v;
    return typeof v === "number" ? v : undefined;
  });
  let main1Key;
  if (MODE === "I") {
    main1Key = perfCells[colRef("I", r)]?.v;
  } else {
    // D..I を走査して最初の文字列セル
    for (const c of ["D", "E", "F", "G", "H", "I"]) {
      const v = perfCells[colRef(c, r)]?.v;
      if (typeof v === "string") { main1Key = v; break; }
    }
  }
  perf.set(key, {
    tiers,
    keys: {
      main1: main1Key,
      main2: perfCells[colRef("J", r)]?.v,
      sub: perfCells[colRef("K", r)]?.v,
    },
  });
}

// ---- 強化段階: レアリティ+アビリティ枠 → 凸ごとのティア(Ⅰ..Ⅴ) ----
const kyoukaCells = load("強化段階");
const romanIndex = { "Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5 };
const slotTier = new Map();
for (let r = 2; r <= 19; r++) {
  const key = kyoukaCells[colRef("C", r)]?.v;
  if (!key) continue;
  slotTier.set(key, ["D", "E", "F", "G", "H"].map((c) => romanIndex[kyoukaCells[colRef(c, r)]?.v]));
}

// ---- 発動回数: 回数キー → 回数（シートの現在状態のキャッシュから再構成） ----
const COUNTS = {
  // 固定（アビ性能M→O）
  初期値: 1, パラメータボーナス: 1, パラメータイベント: 1, SPレッスン率: 1,
  何もなし: 0, "試験終了時（2回まで）": 2, "試験・オーディション": 2,
  // レッスン自動集計（シート現状: 全レッスンがメイン2×SP）
  メイン1レッスン: 0, メイン2レッスン: 8, サブレッスン: 0,
  メイン1SPレッスン: 0, メイン2SPレッスン: 8, サブSPレッスン: 0,
  メイン1通常レッスン: 0, メイン2通常レッスン: 0, サブ通常レッスン: 0,
  // 手動セット（シート現状のE列キャッシュ）
  スキル獲得: 25, Aスキル獲得: 5, Mスキル獲得: 10, 好調スキル獲得: 10,
  集中スキル獲得: 6, 好印象スキル獲得: 0, やる気スキル獲得: 0, 強気スキル獲得: 0,
  温存スキル獲得: 0, 全力スキル獲得: 0, 元気スキル獲得: 0, SSRスキル獲得: 12,
  スキル強化: 4, Aスキル強化: 4, Mスキル強化: 4, スキル削除: 6,
  "Aスキル削除（3回まで）": 3, "Mスキル削除（3回まで）": 3, "チェンジ（3回まで）": 3,
  "カスタマイズ（6回まで）": 6, "授業・営業": 6, お出かけ: 1, 休む: 0, 相談: 2,
  "活動支給・差し入れ": 5, "特別指導（3回まで）": 0, Pドリンク交換: 12, Pドリンク獲得: 40,
  "20枚以上SPレッスン（4回まで）": 4, "Pアイテム獲得（6回まで）": 6,
  "お出かけ(2回まで)": 1, "相談(2回まで)": 2, "活動支給・差し入れ(2回まで)": 2,
  // ↓シートの現在状態では未設定=0（発動回数表の末尾2行が空のため）
  "スキル削除(4回まで)": 0, "好印象8枚以上(4回まで)": 0,
};

// ---- パラボ参照用: 検索用結合(ロール+%値) → 最終前(I列) ----
const paraboCells = load("パラボ参照用");
const parabo = new Map();
for (let r = 3; r <= 200; r++) {
  const key = paraboCells[colRef("D", r)]?.v;
  const val = paraboCells[colRef("I", r)]?.v;
  if (key !== undefined && val !== undefined) parabo.set(String(key), val);
}

// ---- サポカDB: シートB列（名前）はスマートチップで値が抜けているため、
//      同じシートからエクスポートしたCSV由来の generated/supportCards.json を行順で使う。
//      CSVレコード index i ↔ メイン1DB/メイン2DB/サブDB の行 i+3（固定用がi=0）
const csvRows = JSON.parse(
  fs.readFileSync("../src/data/generated/supportCards.json", "utf8"),
);
const cards = csvRows.map((row) => ({
  name: row["サポカ名称"],
  rarity: row["レアリティ"] === "" ? undefined : row["レアリティ"],
  type: row["タイプ"],
  abilities: [1, 2, 3, 4, 5, 6].map((n) => row[`アビリティ${n}`]),
}));
console.log(`CSVカード: ${cards.length}件（固定用含む）`);

// ---- スコア計算（メイン1DB F2 のLET式を再現） ----
const ROLE_PREFIX = { main1: "メイン1", main2: "メイン2", sub: "サブ" };
function score(card, tsuki, role) {
  // アビリティ3(index2)は計算対象外
  let total = 0;
  for (const slotIndex of [0, 1, 3, 4, 5]) {
    const abiName = card.abilities[slotIndex];
    if (abiName === undefined) return { error: `アビ${slotIndex + 1}名なし` };
    const tierArr = slotTier.get(`${card.rarity}アビリティ${slotIndex + 1}`);
    if (!tierArr) return { error: `強化段階なし: ${card.rarity}` };
    const tier = tierArr[tsuki]; // 1..5
    const p = perf.get(`${card.rarity}${abiName}`);
    if (!p) return { error: `アビ性能なし: ${card.rarity}${abiName}` };
    const value = p.tiers[tier - 1]; // 数値 or undefined(空白)
    if (abiName === "パラメータボーナス") {
      const key = `${ROLE_PREFIX[role]}${value}`;
      const conv = parabo.get(key);
      if (conv === undefined) return { error: `パラボ参照なし: ${key}` };
      total += conv;
    } else {
      const countKey = p.keys[role];
      const count = countKey === undefined ? 0 : COUNTS[countKey];
      if (countKey !== undefined && count === undefined)
        return { error: `回数なし: ${countKey}` };
      total += (value ?? 0) * (count ?? 0);
    }
  }
  return { value: total };
}

// ---- 検算: 各DBのキャッシュ値と比較 ----
const DB_SHEETS = { main1: "メイン1DB", main2: "メイン2DB", sub: "サブDB" };
const TSUKI_COLS = ["F", "G", "H", "I", "J"]; // 0凸..4凸
let ok = 0, ng = 0, skip = 0;
const mismatches = [];
for (const [role, sheetName] of Object.entries(DB_SHEETS)) {
  const db = load(sheetName);
  cards.forEach((card, index) => {
    if (!card.name || card.name === "固定用" || !card.rarity) return;
    const r = index + 3; // CSV index → DB行
    const sheetName2 = db[colRef("B", r)]?.v;
    if (sheetName2 !== undefined && sheetName2 !== card.name) {
      if (mismatches.length < 25)
        mismatches.push(`行ズレ? 行${r}: CSV=${card.name} シート=${sheetName2}`);
    }
    for (let t = 0; t <= 4; t++) {
      const expected = db[colRef(TSUKI_COLS[t], r)]?.v;
      if (expected === undefined || expected === "") { skip++; continue; }
      const got = score(card, t, role);
      const gotVal = got.error ? `ERR(${got.error})` : got.value;
      if (typeof expected === "number" && !got.error && Math.abs(got.value - expected) < 1e-6) {
        ok++;
      } else {
        ng++;
        if (mismatches.length < 25)
          mismatches.push(`${sheetName} ${card.name} ${t}凸: 期待=${expected} 計算=${gotVal}`);
      }
    }
  });
}
console.log(`\nmode=${MODE}  一致: ${ok}  不一致: ${ng}  スキップ: ${skip}`);
for (const m of mismatches) console.log("  " + m);
