/**
 * スプレッドシートのタブをローカルから直接読む（配信元＝R2 にまだ無いタブ用の保険）。
 *
 * 同期するタブを増やしたときは、その Worker を本番に出すまで R2 に新しいタブが入らない。
 * その間 gen スクリプトが止まらないよう、_sheet.mjs はここから直接読みにくる。
 * 認証は service-account.json（プロジェクト直下・gitignore済み）か
 * .env.local の GS_CLIENT_EMAIL / GS_PRIVATE_KEY。
 *
 * 形（生グリッド or オブジェクト配列）は R2 経由と同じになるよう、
 * worker/lib/sync.js の GRID_TABS / rowsToRecords をそのまま使う。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAccessToken } from "../worker/lib/google-auth.js";
import { GRID_TABS, rowsToRecords } from "../worker/lib/sync.js";
import "./_env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** スプシのID（URLに出る値。秘密ではないので wrangler.toml の vars にある） */
function sheetId() {
  if (process.env.SHEET_ID) return process.env.SHEET_ID;
  const toml = readFileSync(resolve(root, "wrangler.toml"), "utf8");
  const m = toml.match(/^\s*SHEET_ID\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("wrangler.toml に SHEET_ID がありません");
  return m[1];
}

/** サービスアカウント（worker/lib/google-auth.js が読む形で返す） */
function credentials() {
  const jsonPath = resolve(root, "service-account.json");
  if (existsSync(jsonPath)) {
    const j = JSON.parse(readFileSync(jsonPath, "utf8"));
    return { GS_CLIENT_EMAIL: j.client_email, GS_PRIVATE_KEY: j.private_key };
  }
  const { GS_CLIENT_EMAIL, GS_PRIVATE_KEY } = process.env;
  if (GS_CLIENT_EMAIL && GS_PRIVATE_KEY) return { GS_CLIENT_EMAIL, GS_PRIVATE_KEY };
  throw new Error(
    "service-account.json も .env.local の GS_CLIENT_EMAIL/GS_PRIVATE_KEY も無いため、直接は読めません",
  );
}

/** タブ名を指定してスプシから直接読む（R2 経由の fetchTab と同じ形を返す） */
export async function fetchTabDirect(name) {
  const token = await getAccessToken(credentials());
  const range = encodeURIComponent(`'${name}'`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}` +
      "?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Sheets API に失敗 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const rows = (await res.json()).values ?? [];
  if (rows.length < 2) throw new Error(`タブ「${name}」にデータ行がありません`);
  return GRID_TABS.has(name)
    ? rows.filter((row) => row.some((cell) => String(cell).trim() !== ""))
    : rowsToRecords(rows);
}
