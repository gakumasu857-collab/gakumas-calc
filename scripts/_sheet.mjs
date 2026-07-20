/**
 * 現行スプシのマスタを R2（Worker /api/master）から取得する共通ヘルパ。
 * データ源は「スプシ→Worker(cron 5分)→R2」で常に最新。gen スクリプトはここから引く。
 * 別エンドポイントを使うときは環境変数 SHEET_API で上書き。
 */
const BASE = process.env.SHEET_API ?? "https://gakumas-calc.gakumasu857.workers.dev";

/** タブ名を指定して現行スプシのタブ（オブジェクト配列）を取得する */
export async function fetchTab(name) {
  const res = await fetch(`${BASE}/api/master?name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`スプシタブ取得に失敗: ${name} (${res.status})`);
  }
  return res.json();
}

/** "" や null を 0 に、数値文字列を数値にする（スプシの空セル対策） */
export function num(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
