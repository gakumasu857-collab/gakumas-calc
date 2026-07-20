/**
 * 現行スプシの発動回数タブ（R2経由）から
 * src/data/generated/abilityCounts.json を生成する。
 *
 * 出力: { hif: {setNames:[...], rows:{ラベル:[...]}}, nia: {...}, hajime: {...} }
 * - setNames = 各タブの列（「アビリティ」以外）＝発動回数セット名。
 * - rows     = アビリティの日本語ラベル → セット順の回数配列。
 * - ラベル→アプリのキー変換は abilityCounts.ts 側で abilityKeyFromLabel を使う
 *   （英語キー体系との対応は constants に集約するため、この .mjs は日本語ラベルのまま出す）。
 *
 * 新アビリティ/新セットはスプシに行・列を足せばそのまま反映される（自己完結）。
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab, num } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/abilityCounts.json");

const TABS = { hif: "abilityCountsHIF", nia: "abilityCountsNIA", hajime: "abilityCountsHajime" };
const KEY_COL = "アビリティ";

/** 1タブ → { setNames, rows } */
function toTable(tabRows) {
  const setNames = Object.keys(tabRows[0] ?? {}).filter((k) => k !== KEY_COL);
  const rows = {};
  for (const r of tabRows) {
    const label = (r[KEY_COL] ?? "").trim();
    if (!label) continue;
    rows[label] = setNames.map((s) => num(r[s]));
  }
  return { setNames, rows };
}

const out = {};
for (const [key, tab] of Object.entries(TABS)) {
  const rows = await fetchTab(tab);
  out[key] = toTable(rows);
}

writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
console.log(
  `✓ 発動回数 → hif ${Object.keys(out.hif.rows).length}行/${out.hif.setNames.length}セット` +
    ` / nia ${Object.keys(out.nia.rows).length}行/${out.nia.setNames.length}セット` +
    ` / hajime ${Object.keys(out.hajime.rows).length}行/${out.hajime.setNames.length}セット`,
);
