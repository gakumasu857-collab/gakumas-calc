/**
 * 現行スプシの supMaster（R2経由）を src/data/generated/supportCards.json に書き出す。
 * 列名はスプシの日本語ヘッダーのまま。内部キーへの写しと派生は
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
/**
 * id 列（保存キー card:<id> の元）の確認。2026-11-11 に supMaster の A1 が「id」から「2」に変わっていて、
 * 全カードが id 無し（＝保存キーがカード名）で公開され、みんなの所持状況が効かなくなった。
 * - 見出しが「id」でなくても、見出しが数字か空で、中身が全部ちがう正の整数の列があれば、それを id として扱う（警告を出す）
 * - それも無ければ止める（このまま公開すると所持状況・BAN・編成が全部はずれるため）
 */
const isPosInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== "";
if (!rows.every((r) => isPosInt(r.id))) {
  const headers = Object.keys(rows[0] ?? {});
  const candidate = headers.find(
    (h) =>
      h !== "id" &&
      (/^\d*$/.test(h.trim()) || /^id$/i.test(h.trim())) &&
      rows.every((r) => isPosInt(r[h])) &&
      new Set(rows.map((r) => Number(r[h]))).size === rows.length,
  );
  if (candidate === undefined) {
    console.error("✗ supMaster に id 列（全行ちがう番号）がありません。A列の見出しを「id」に戻してください。");
    console.error("  id が無いまま公開すると、所持状況・BAN・編成の保存がカードと結び付かなくなるので、ここで止めます。");
    process.exit(1);
  }
  console.warn(`⚠ supMaster の id 列の見出しが「${candidate}」になっています。id として読みましたが、スプシの A1 を「id」に戻してください。`);
  for (let i = 0; i < rows.length; i++) {
    const { [candidate]: idValue, ...rest } = rows[i];
    rows[i] = { id: Number(idValue), ...rest };
  }
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(rows, null, 1), "utf8");
console.log(`✓ ${rows.length}件を書き出しました → ${outputPath}`);
