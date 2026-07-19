// xlsx → シートごとの {セル: {v: 値, f: 数式}} JSON（自己終了セル対応版）
const fs = require("fs");

const unescape = (s) =>
  s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const ssXml = fs.readFileSync("xl/sharedStrings.xml", "utf8");
const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))
);

const wb = fs.readFileSync("xl/workbook.xml", "utf8");
const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
  name: (m[0].match(/name="([^"]+)"/) || [])[1],
  rid: (m[0].match(/r:id="rId(\d+)"/) || [])[1],
}));
const rels = fs.readFileSync("xl/_rels/workbook.xml.rels", "utf8");
const relMap = {};
for (const m of rels.matchAll(/Id="rId(\d+)"[^>]*Target="([^"]*worksheets\/[^"]+)"/g))
  relMap[m[1]] = m[2];

fs.mkdirSync("json", { recursive: true });
for (const s of sheets) {
  const xml = fs.readFileSync("xl/" + relMap[s.rid], "utf8");
  const cells = {};
  // <c .../>（自己終了）と <c ...>本体</c> を厳密に区別する
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
    if (!ref) continue;
    const type = (attrs.match(/t="([a-z]+)"/) || [])[1];
    const fMatch = body.match(/<f[^>]*>([\s\S]*?)<\/f>/);
    const vMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
    let v = vMatch ? unescape(vMatch[1]) : undefined;
    if (type === "s" && v !== undefined) v = shared[Number(v)];
    else if (type === "b" && v !== undefined) v = v === "1";
    else if (v !== undefined && type !== "str" && v !== "" && !isNaN(Number(v))) v = Number(v);
    const cell = {};
    if (v !== undefined) cell.v = v;
    if (fMatch) cell.f = unescape(fMatch[1]);
    if (Object.keys(cell).length) cells[ref] = cell;
  }
  const safe = s.name.replace(/[\/:*?"<>|]/g, "_");
  fs.writeFileSync(`json/${safe}.json`, JSON.stringify(cells));
  console.log(s.name, Object.keys(cells).length, "cells");
}
