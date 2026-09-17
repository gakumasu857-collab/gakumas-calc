/**
 * 現行スプシの発動回数タブ・スケジュールタブ（R2経由）から
 * src/data/generated/abilityCounts.json を生成する。
 *
 * 出力: { hif: {setNames:[...], plans:[...], rows:{ラベル:[...]}, choices:[{行id:行動|null}, ...]}, nia: {...}, hajime: {...} }
 * - setNames = 各タブの列（「アビリティ」以外）＝発動回数セット名。
 * - plans    = セットごとのプラン/スタイルのタグ（スプシのプラン行。無ければ""）。
 * - rows     = アビリティの日本語ラベル → セット順の回数配列。
 * - choices  = セット順の「週（日）ごとに何を踏むか」（scheduleXXX タブ）。
 *              お出かけ・相談・差し入れ（活動支給）・特別指導・休む の回数はここから決まる。
 * - ラベル→アプリのキー変換は abilityCounts.ts 側で abilityKeyFromLabel を使う
 *   （英語キー体系との対応は constants に集約するため、この .mjs は日本語ラベルのまま出す）。
 *
 * タブは生グリッド（行列）で同期される（worker/lib/sync.js の GRID_TABS）:
 *   1行目: プランのタグ行（左上セルは空。無いタブもある）
 *   次の行: 「アビリティ」/「スケジュール」＋セット名
 *   以降  : アビリティ名（または週・日の名前）＋値
 * 新アビリティ/新セット/プランはスプシに行・列を足せばそのまま反映される（自己完結）。
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchTab, num } from "./_sheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "src/data/generated/abilityCounts.json");

// スケジュールの週（日）の並びはアプリと同じ定義を使う（Node 22.18+ の型除去でそのまま読める）
const { scheduleChoiceRows, SCENARIO_CALENDARS, supplyLabel, CALENDAR_EVENT_LABELS } =
  await import(pathToFileURL(resolve(root, "src/data/scheduleCalendar.ts")).href);

const TABS = {
  hif: { counts: "abilityCountsHIF", schedule: "scheduleHIF", scenario: "hif" },
  nia: { counts: "abilityCountsNIA", schedule: "scheduleNIA", scenario: "niaMaster" },
  hajime: { counts: "abilityCountsHajime", schedule: "scheduleHajime", scenario: "hatsuLegend" },
};
const KEY_COL = "アビリティ";
const SCHEDULE_KEY_COL = "スケジュール";

/** スケジュールタブのセルの書き方 → 行動（「休む」と空欄は「何も踏まない」＝null） */
const CELL_TO_EVENT = {
  お出かけ: "date",
  おでかけ: "date",
  相談: "meeting",
  差し入れ: "supply",
  活動支給: "supply",
  "活動支給・差し入れ": "supply",
  特別指導: "lecture",
  休む: null,
  "": null,
  "-": null,
  なし: null,
};

/** スケジュールタブの、プロデュースではない列（人が見るためだけの列。コードは読み飛ばす） */
const NOTE_COLUMNS = new Set([SCHEDULE_KEY_COL, "選べる行動"]);

/** 生グリッド（配列の配列）→ { setNames, plans, rows }。keyCol は左上の見出し */
function gridToTable(grid, keyCol, tab) {
  const cell = (row, c) => String(row?.[c] ?? "").trim();
  // keyCol で始まる行がヘッダー（その上にあればプラン行）
  const headerIndex = grid.findIndex((row) => cell(row, 0) === keyCol);
  if (headerIndex < 0) {
    throw new Error(`${tab}: ヘッダー行（先頭セル「${keyCol}」）が見つかりません`);
  }
  const headerRow = grid[headerIndex];
  const cols = [];
  for (let c = 1; c < headerRow.length; c++) {
    if (cell(headerRow, c) && !NOTE_COLUMNS.has(cell(headerRow, c))) cols.push(c);
  }
  const setNames = cols.map((c) => cell(headerRow, c));
  const planRow = headerIndex > 0 ? grid[headerIndex - 1] : null;
  const plans = cols.map((c) => (planRow ? cell(planRow, c) : ""));
  const rows = {};
  const order = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const label = cell(row, 0);
    if (!label) continue;
    order.push(label);
    rows[label] = cols.map((c) => row[c]);
  }
  return { setNames, plans, rows, order };
}

/** その週（日）の見出し（A列の書き方）。例: 「選抜1日目」「3週目」 */
function rowLabelOf(scenario, row) {
  const unit = SCENARIO_CALENDARS[scenario].unit;
  return `${row.sectionTitle ?? ""}${row.label}${unit}目`;
}

/**
 * スケジュールタブ → セットごとの選択（{行id: 行動 or null}）。
 * 週の名前・選べる行動はアプリのスケジュール定義と突き合わせ、食い違いはここで止める
 * （黙って無視すると「回数が合わないプロデュース」が静かに出来てしまうため）。
 */
function scheduleToChoices(table, { scenario, schedule: tab, counts: countsTab }, countsTable) {
  const problems = [];
  // 同じ名前のプロデュースが並ぶタブなので、名前だけでなくプラン行も一緒に突き合わせる
  // （名前だけだと、同名の列が入れ替わっていても気づけず、別のプロデュースの踏み方になってしまう）
  const columns = (t) => t.setNames.map((name, i) => `${t.plans?.[i] ?? ""}${name}`);
  if (columns(table).join(" / ") !== columns(countsTable).join(" / ")) {
    problems.push(
      `プロデュースの列（プラン＋名前）が ${countsTab} と違います\n` +
        `      ${tab}: ${columns(table).join(" / ")}\n` +
        `      ${countsTab}: ${columns(countsTable).join(" / ")}`,
    );
  }
  /** その週（日）に選べる行動の日本語名（エラー文用） */
  const optionNames = (row) =>
    row.options
      .map((e) => (e === "supply" ? supplyLabel(scenario) : CALENDAR_EVENT_LABELS[e]))
      .join("／");
  const rows = scheduleChoiceRows(scenario);
  const wanted = new Map(rows.map((r) => [rowLabelOf(scenario, r), r]));
  for (const label of table.order) {
    if (!wanted.has(label)) {
      problems.push(`「${label}」という週（日）はこのシナリオにありません（A列）`);
    }
  }
  const choices = table.setNames.map(() => ({}));
  for (const [label, row] of wanted) {
    const values = table.rows[label];
    if (!values) {
      problems.push(`「${label}」の行がありません（選べる行動: ${optionNames(row)}）`);
      continue;
    }
    table.setNames.forEach((setName, i) => {
      const raw = String(values[i] ?? "").trim();
      if (!(raw in CELL_TO_EVENT)) {
        problems.push(
          `「${label}」×「${setName}」の「${raw}」は読めません（お出かけ／相談／差し入れ／活動支給／特別指導／休む／空欄）`,
        );
        return;
      }
      const event = CELL_TO_EVENT[raw];
      if (event && !row.options.includes(event)) {
        problems.push(
          `「${label}」×「${setName}」の「${raw}」は、その週（日）に選べません（選べる行動: ${optionNames(row)}）`,
        );
        return;
      }
      choices[i][row.id] = event;
    });
  }
  if (problems.length > 0) {
    throw new Error(
      `${tab} の中身を直してください:\n  ・${problems.join("\n  ・")}\n` +
        "  （セルに書けるのは お出かけ／相談／差し入れ（初は活動支給）／特別指導／休む／空欄 です）",
    );
  }
  return choices;
}

const out = {};
for (const [key, tab] of Object.entries(TABS)) {
  const grid = await fetchTab(tab.counts);
  if (!Array.isArray(grid[0])) {
    throw new Error(`${tab.counts}: グリッド形式（worker/lib/sync.js の GRID_TABS）で同期されていません`);
  }
  const { order: _order, ...table } = gridToTable(grid, KEY_COL, tab.counts);
  // 回数は数値として出す（スケジュールタブは文字なので、こちらだけ num で通す）
  for (const label of Object.keys(table.rows)) {
    table.rows[label] = table.rows[label].map(num);
  }

  const schedGrid = await fetchTab(tab.schedule);
  if (!Array.isArray(schedGrid[0])) {
    throw new Error(`${tab.schedule}: グリッド形式（worker/lib/sync.js の GRID_TABS）で同期されていません`);
  }
  const schedule = gridToTable(schedGrid, SCHEDULE_KEY_COL, tab.schedule);
  out[key] = { ...table, choices: scheduleToChoices(schedule, tab, table) };
}

/**
 * 発動回数タブの「お出かけ・相談・活動支給・差し入れ・特別指導・休む」は、
 * スケジュールのタブから数え直すので、テンプレの回数としては使わなくなった。
 * 食い違っていたら（＝古い値が残っていたら）知らせる（止めはしない）。
 */
function noticeStaleRows(out) {
  const ROWS = {
    date: "お出かけ",
    meeting: "相談",
    supply: "活動支給・差し入れ",
    lecture: "特別指導（3回まで）",
    rest: "休む",
  };
  const notices = [];
  for (const [key, tab] of Object.entries(TABS)) {
    const table = out[key];
    const rows = scheduleChoiceRows(tab.scenario);
    table.setNames.forEach((name, i) => {
      const got = { date: 0, meeting: 0, supply: 0, lecture: 0, rest: 0 };
      for (const r of rows) {
        const ev = table.choices[i][r.id] ?? null;
        if (ev) got[ev]++;
        else got.rest++;
      }
      for (const [ev, label] of Object.entries(ROWS)) {
        const sheet = table.rows[label]?.[i];
        if (sheet === undefined) continue;
        const mine = ev === "lecture" ? Math.min(got.lecture, 3) : got[ev];
        if (sheet !== mine) {
          notices.push(`${tab.counts} の「${label}」×「${table.plans[i]}${name}」: ${sheet} → ${mine}`);
        }
      }
    });
  }
  if (notices.length === 0) return;
  console.log(
    `\nお知らせ: お出かけ・相談・活動支給/差し入れ・特別指導・休むの回数は、スケジュールのタブから数えます。\n` +
      `発動回数タブの次の値は使われません（スケジュールのタブの方が正です）:\n  ・${notices.join("\n  ・")}\n`,
  );
}

noticeStaleRows(out);
writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
for (const [key, table] of Object.entries(out)) {
  const picked = table.choices.map((c) => Object.values(c).filter(Boolean).length);
  console.log(
    `✓ ${key}: ${Object.keys(table.rows).length}行 / ${table.setNames.length}セット` +
      `（プラン: ${table.plans.filter(Boolean).join(",") || "なし"}` +
      ` / スケジュールで踏む数: ${Math.min(...picked)}〜${Math.max(...picked)}）`,
  );
}
