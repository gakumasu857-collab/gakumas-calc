/**
 * スプレッドシート → R2 の同期本体。
 *
 * SHEET_TABS の各タブを Sheets API values:batchGet で一括取得し、
 * 先頭行をヘッダーとしたオブジェクト配列 [{列名: 値}, ...] に変換して
 * R2 の master/<タブ名>.json へ書き出す。
 *
 * 安全策: 取得できなかった/空だったタブは R2 を上書きしない
 * （一時エラーで正常なデータを潰さない）。スキップは戻り値で報告する。
 */
import { getAccessToken } from "./google-auth.js";

const JSON_META = {
  httpMetadata: { contentType: "application/json; charset=utf-8" },
};

/** 行配列 → オブジェクト配列。空ヘッダー列は捨て、全セル空の行はスキップ */
function rowsToRecords(rows) {
  const header = rows[0].map((h) => String(h).trim());
  const records = [];
  for (const row of rows.slice(1)) {
    if (!row.some((cell) => String(cell).trim() !== "")) continue;
    const rec = {};
    header.forEach((name, c) => {
      if (name) rec[name] = row[c] ?? "";
    });
    records.push(rec);
  }
  return records;
}

/**
 * 全タブを同期する。
 * @returns {Promise<{synced: {tab: string, rows: number}[], skipped: {tab: string, reason: string}[], tabs: string[], updatedAt: string}>}
 */
export async function syncMasters(env) {
  if (!env.SHEET_ID) throw new Error("SHEET_ID が未設定です");
  const tabs = (env.SHEET_TABS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tabs.length === 0) throw new Error("SHEET_TABS が未設定です");

  // 全タブを1リクエストで取得（API呼び出し最小化）。
  // valueRenderOption=UNFORMATTED_VALUE で数値を数値のまま受け取る
  // （既定の FORMATTED_VALUE は表示書式の文字列になり、桁区切り等が混入しうる）。
  const token = await getAccessToken(env);
  const rangeParams = tabs
    .map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`)
    .join("&");
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values:batchGet` +
    `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&${rangeParams}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Sheets API に失敗 (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  const valueRanges = body.valueRanges || [];

  const synced = [];
  const skipped = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const rows = valueRanges[i]?.values;
    if (!rows || rows.length < 2) {
      skipped.push({ tab, reason: rows ? "データ行がない" : "取得できない" });
      continue;
    }
    const records = rowsToRecords(rows);
    if (records.length === 0) {
      skipped.push({ tab, reason: "有効な行がない" });
      continue;
    }
    await env.MASTER_BUCKET.put(
      `master/${tab}.json`,
      JSON.stringify(records),
      JSON_META,
    );
    synced.push({ tab, rows: records.length });
  }

  // 利用可能タブ一覧 = R2 に実在する master/*.json。
  // 今回スキップしたタブでも過去の正常データがあれば一覧に残り続ける。
  const listed = await env.MASTER_BUCKET.list({ prefix: "master/" });
  const available = listed.objects
    .map((o) => o.key.slice("master/".length).replace(/\.json$/, ""))
    .filter((n) => n && n !== "_index");
  const updatedAt = new Date().toISOString();
  await env.MASTER_BUCKET.put(
    "master/_index.json",
    JSON.stringify({ tabs: available, updatedAt }),
    JSON_META,
  );

  return { synced, skipped, tabs: available, updatedAt };
}
