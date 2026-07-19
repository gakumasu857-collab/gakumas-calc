// シートを表形式で表示: node view.js <sheet> <rowFrom> <rowTo> [colFrom] [colTo] [--f]
const fs = require("fs");
const [sheet, r1, r2, c1 = "A", c2 = "Z", flag] = process.argv.slice(2);
const cells = JSON.parse(fs.readFileSync(`json/${sheet}.json`, "utf8"));
const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => { let s = ""; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };
for (let r = Number(r1); r <= Number(r2); r++) {
  const row = [];
  for (let c = colNum(c1); c <= colNum(c2); c++) {
    const cell = cells[`${colName(c)}${r}`];
    if (!cell) { row.push(""); continue; }
    row.push(flag === "--f" && cell.f ? `={${cell.f.slice(0, 60)}}` : String(cell.v ?? "").slice(0, 24));
  }
  if (row.some(Boolean)) console.log(r + "\t" + row.join(" | "));
}
