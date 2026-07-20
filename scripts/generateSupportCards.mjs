/**
 * 現行スプシの supMaster（R2経由）を src/data/generated/supportCards.json に書き出す。
 * 列は英語（name/type/ability1..6/plan/param/*_ac 等）。英日変換・派生は
 * src/data/supportCardsDb.ts が引き受ける（このスクリプトは素通し）。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTab } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "src/data/generated/supportCards.json");

const rows = await fetchTab("supMaster");
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("✗ supMaster が取得できませんでした");
  process.exit(1);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(rows, null, 1), "utf8");
console.log(`✓ ${rows.length}件を書き出しました → ${outputPath}`);
