/**
 * sheet-source/json/アビリティ性能.json から、検証済み点数エンジン用の
 * src/data/generated/abilityPerf.json を生成する。
 *
 * 出力:
 * {
 *   perf: { "SSRレッスン": { tiers:[3,4,6,null,null], main1:"メイン1レッスン", main2:..., sub:... }, ... },
 *   fixedCounts: { "初期値": {normal:1, hatsu:1, hif:1}, "レッスン": "auto", ... }
 * }
 * 検算(sheet-source/verify.js)と同じ解釈。シート更新時は再実行する。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cells = JSON.parse(
  readFileSync(resolve(root, "sheet-source/json/アビリティ性能.json"), "utf8"),
);

const get = (col, row) => cells[`${col}${row}`]?.v;

const perf = {};
const fixedCounts = {};
for (let r = 2; r <= 300; r++) {
  const key = get("C", r);
  if (key) {
    perf[key] = {
      tiers: ["D", "E", "F", "G", "H"].map((c) => {
        const v = get(c, r);
        return typeof v === "number" ? v : null;
      }),
      main1: get("I", r) ?? null,
      main2: get("J", r) ?? null,
      sub: get("K", r) ?? null,
    };
  }
  // M/N/O/P: 回数変更なしアビリティの固定回数（"a"はスケジュール自動集計の意味）
  const fixedName = get("M", r);
  if (fixedName) {
    const n = get("N", r);
    fixedCounts[fixedName] =
      n === "a"
        ? "auto"
        : { normal: get("N", r) ?? 0, hatsu: get("O", r) ?? 0, hif: get("P", r) ?? 0 };
  }
}

const out = { perf, fixedCounts };
writeFileSync(
  resolve(root, "src/data/generated/abilityPerf.json"),
  JSON.stringify(out, null, 1),
  "utf8",
);
console.log(
  `✓ perf ${Object.keys(perf).length}件 / fixedCounts ${Object.keys(fixedCounts).length}件 を書き出しました`,
);
