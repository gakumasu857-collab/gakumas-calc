/**
 * サポカDBのCSVを JSON に変換するスクリプト。
 *
 * 使い方:
 *   1. スプレッドシートから「CSV(UTF-8)」でダウンロード
 *   2. src/data/csv/サポカDB.csv に置く（ファイル名は引数で変更可）
 *   3. npm run gen:cards
 *   → src/data/generated/supportCards.json が更新される
 *
 * 設計方針（改変に耐えるため）:
 * - 列は「位置」ではなく「1行目のヘッダー名」で読む。列の追加・並び替えはそのまま通る。
 * - このスクリプトは意味の解釈をしない（ただのCSV→JSON変換）。
 *   日本語ラベル→キーの変換やレアリティの正規化はアプリ側
 *   (src/data/supportCardsDb.ts) が一手に引き受ける。
 *   → 新しいアビリティ名が増えても、ここは触らなくてよい。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(root, process.argv[2] ?? "src/data/csv/サポカDB.csv");
const outputPath = resolve(root, "src/data/generated/supportCards.json");

/** 引用符・改行入りセルに対応した最小限のCSVパーサ */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

let text;
try {
  text = readFileSync(inputPath, "utf8");
} catch {
  console.error(`✗ CSVが見つかりません: ${inputPath}`);
  console.error(
    "  スプレッドシートからCSV(UTF-8)でダウンロードして上記パスに置いてください。",
  );
  process.exit(1);
}

// BOM除去
text = text.replace(/^﻿/, "");
// UTF-8をLatin-1として読んだ文字化け（ãµãã«...）の簡易検出
if (/[ãâä][-¿]/.test(text.slice(0, 2000))) {
  console.warn(
    "⚠ 文字化けの可能性があります。CSVはUTF-8で保存してください（ExcelではなくGoogleスプレッドシートからのダウンロード推奨）。",
  );
}

const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
if (rows.length < 2) {
  console.error("✗ データ行がありません");
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim());
const records = rows.slice(1).map((cells) => {
  const record = {};
  headers.forEach((header, i) => {
    if (!header) return; // 無名列はスキップ
    record[header] = (cells[i] ?? "").trim();
  });
  return record;
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(records, null, 1), "utf8");
console.log(`✓ ${records.length}件を書き出しました → ${outputPath}`);
console.log(`  列: ${headers.filter(Boolean).join(", ")}`);
