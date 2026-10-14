/**
 * スプシ由来の生成JSON（supportCards / abilityCounts / abilityPerf）に出てくる
 * アビリティ名・前イベ起動タグ・発動回数タブの行名・trigger_tag のうち、コード側の正式名一覧
 * （src/data/constants.ts の MANUAL_ABILITY_NAMES / ABILITY_LABEL_ALIASES）に無いものを
 * src/data/generated/autoAbilities.json に書き出す＝自動で登録する（2026-10-14〜。以前は止めていた）。
 * gen:all の最後に走る（npm run check:labels 単体でも可）。
 *
 * 自動で登録したアビリティの回数（src/data/abilityCounts.ts）:
 *   1. 発動回数タブに行があれば、その回数（プロデュース設定で変えられる）
 *   2. 「◯◯（N回まで）」で ◯◯ が登録済みなら、◯◯の回数をNで頭打ち（スキル削除（4回まで）と同じ）
 *   3. どちらも無ければ 0 回（プロデュース設定の「その他」に行が出るので、そこで入れられる）
 * 特別なルール（踏み方から決まる・足し算・連動・固定回数）があるものや、名前の変更（改名）は自動では分からないので、
 * そのときは constants.ts に手で書く（docs/ARCHITECTURE.md 4-1 C-2 / D）。
 *
 * constants.ts（TypeScript）をそのまま import している（Node 22.18 以上の型除去機能）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { manualAbilityKeyFromLabel, isAttrSkillEnhanceLabel, normalizeAbilityLabel } = await import(
  pathToFileURL(resolve(root, "src/data/constants.ts")).href
);
const readJson = (rel) => JSON.parse(readFileSync(resolve(root, rel), "utf8"));
const cards = readJson("src/data/generated/supportCards.json");
const counts = readJson("src/data/generated/abilityCounts.json");
const perf = readJson("src/data/generated/abilityPerf.json").perf;
const AUTO_PATH = "src/data/generated/autoAbilities.json";

/** 空欄扱いの表記（supportCardsDb.ts の EMPTY_LABELS と同じ） */
const EMPTY = new Set(["", "何もなし", "なし", "-"]);
/** レッスン系の回数キー（スケジュールから自動集計。constants には無い） */
const LESSON_RE = /^(Vocal|Dance|Visual|メイン1|メイン2|サブ)?(SPレッスン|通常レッスン|レッスン)$/;
const known = (label) =>
  EMPTY.has(label) || LESSON_RE.test(label) || manualAbilityKeyFromLabel(label) !== undefined;

/** 自動で登録する名前（正規化した名前 → { label, count, where[] }） */
const autos = new Map();
const note = (label, count, where) => {
  if (known(label)) return;
  const norm = normalizeAbilityLabel(label);
  const cur = autos.get(norm) ?? { label, count: false, where: [] };
  cur.count = cur.count || count;
  if (!cur.where.includes(where)) cur.where.push(where);
  autos.set(norm, cur);
};

let cardCount = 0;
for (const c of cards) {
  const name = String(c["サポカ名"] ?? "").trim();
  if (!name || name === "固定用") continue;
  cardCount++;
  for (let i = 1; i <= 6; i++) {
    const label = String(c[`${i}アビ`] ?? "").trim();
    note(label, false, `「${name}」の ${i}アビ`);
  }
  const tag = String(c["前イベ起動タグ"] ?? "").trim();
  note(tag, true, `「${name}」の前イベ起動タグ`);
}
/**
 * 発動回数タブにある、今は使っていない行（知らせるだけ）。
 * 属性つきのスキル強化（「温存スキル強化」など）は「スキル強化」の回数で判定するので、行があっても回数は使わない。
 */
const unusedRows = [];
let rowCount = 0;
for (const [tab, table] of Object.entries(counts)) {
  for (const label of Object.keys(table.rows ?? {})) {
    rowCount++;
    if (isAttrSkillEnhanceLabel(label)) unusedRows.push(`発動回数タブ（${tab}）の「${label}」`);
    note(label, true, `発動回数タブ（${tab}）`);
  }
}
let perfCount = 0;
for (const [key, entry] of Object.entries(perf)) {
  perfCount++;
  for (const field of ["main1", "main2", "sub"]) {
    const tag = entry[field];
    if (tag == null) continue;
    note(String(tag), true, `abilityValues「${key}」の trigger_tag`);
  }
}

// 書き出し（名前順。中身が同じなら書かない＝差分を出さない）
const list = [...autos.values()]
  .map(({ label, count }) => ({ label, count }))
  .sort((a, b) => a.label.localeCompare(b.label, "ja"));
const next = JSON.stringify({ abilities: list }, null, 2) + "\n";
let prev = "";
try {
  prev = readFileSync(resolve(root, AUTO_PATH), "utf8");
} catch {
  // 初回は無い
}
if (prev !== next) writeFileSync(resolve(root, AUTO_PATH), next, "utf8");

console.log(
  `✓ アビリティ名チェック（カード ${cardCount}枚 / 発動回数 ${rowCount}行 / abilityValues ${perfCount}件）`,
);
if (list.length > 0) {
  console.log(`  コードに無い名前 ${list.length}件を自動で登録しました${prev !== next ? "（今回、一覧が変わりました）" : ""}:`);
  for (const a of autos.values()) {
    console.log(`   ・「${a.label}」  例: ${a.where[0]}${a.count ? "" : "（回数としては使われていない名前）"}`);
  }
  console.log("  回数: 発動回数タブに行があればその回数、「◯◯（N回まで）」なら◯◯の回数をNで頭打ち、どちらも無ければ0回");
  console.log("  （0回のものはプロデュース設定の「その他」で入れられます）。");
  console.log("  名前を変えただけ（改名）のときや、特別な数え方があるときは、この画面の文字を Claude に貼ってください。");
}
if (unusedRows.length > 0) {
  console.log(
    `  ※ 今は使っていない行: ${unusedRows.join("、")}` +
      `（属性つきのスキル強化は「スキル強化」の回数で判定します。行は消しても残しても結果は同じです）`,
  );
}
