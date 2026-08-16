/**
 * 現行スプシの発動回数タブ（R2経由）から
 * src/data/generated/abilityCounts.json を生成する。
 *
 * 出力: { hif: {setNames:[...], plans:[...], rows:{ラベル:[...]}}, nia: {...}, hajime: {...} }
 * - setNames = 各タブの列（「アビリティ」以外）＝発動回数セット名。
 * - plans    = セットごとのプラン/スタイルのタグ（スプシのプラン行。無ければ""）。
 * - rows     = アビリティの日本語ラベル → セット順の回数配列。
 * - ラベル→アプリのキー変換は abilityCounts.ts 側で abilityKeyFromLabel を使う
 *   （英語キー体系との対応は constants に集約するため、この .mjs は日本語ラベルのまま出す）。
 *
 * タブは生グリッド（行列）で同期される（worker/lib/sync.js の GRID_TABS）:
 *   1行目: プランのタグ行（左上セルは空。無いタブもある）
 *   次の行: 「アビリティ」＋セット名
 *   以降  : アビリティ名＋回数
 * 旧形式（1行目がヘッダーのオブジェクト配列）が来た場合にも対応する。
 * 新アビリティ/新セット/プランはスプシに行・列を足せばそのまま反映される（自己完結）。
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab, num } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/abilityCounts.json");

const TABS = { hif: "abilityCountsHIF", nia: "abilityCountsNIA", hajime: "abilityCountsHajime" };
const KEY_COL = "アビリティ";

/** 生グリッド（配列の配列）→ { setNames, plans, rows } */
function gridToTable(grid) {
  const cell = (row, c) => String(row?.[c] ?? "").trim();
  // 「アビリティ」で始まる行がヘッダー（その上にあればプラン行）
  const headerIndex = grid.findIndex((row) => cell(row, 0) === KEY_COL);
  if (headerIndex < 0) {
    throw new Error(`ヘッダー行（先頭セル「${KEY_COL}」）が見つかりません`);
  }
  const headerRow = grid[headerIndex];
  const cols = [];
  for (let c = 1; c < headerRow.length; c++) {
    if (cell(headerRow, c)) cols.push(c);
  }
  const setNames = cols.map((c) => cell(headerRow, c));
  const planRow = headerIndex > 0 ? grid[headerIndex - 1] : null;
  const plans = cols.map((c) => (planRow ? cell(planRow, c) : ""));
  const rows = {};
  for (const row of grid.slice(headerIndex + 1)) {
    const label = cell(row, 0);
    if (!label) continue;
    rows[label] = cols.map((c) => num(row[c]));
  }
  return { setNames, plans, rows };
}

/** 旧形式（オブジェクト配列）→ { setNames, plans, rows }（プランなし） */
function recordsToTable(tabRows) {
  const setNames = Object.keys(tabRows[0] ?? {}).filter((k) => k !== KEY_COL);
  const rows = {};
  for (const r of tabRows) {
    const label = String(r[KEY_COL] ?? "").trim();
    if (!label) continue;
    rows[label] = setNames.map((s) => num(r[s]));
  }
  return { setNames, plans: setNames.map(() => ""), rows };
}

const out = {};
for (const [key, tab] of Object.entries(TABS)) {
  const rows = await fetchTab(tab);
  out[key] = Array.isArray(rows[0]) ? gridToTable(rows) : recordsToTable(rows);
}

writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
for (const [key, table] of Object.entries(out)) {
  console.log(
    `✓ ${key}: ${Object.keys(table.rows).length}行 / ${table.setNames.length}セット` +
      `（プラン: ${table.plans.filter(Boolean).join(",") || "なし"}）`,
  );
}
