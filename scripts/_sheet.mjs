/**
 * 現行スプシのマスタを R2（Worker /api/master）から取得する共通ヘルパ。
 * データ源は「スプシ→Worker（gen:all 前の同期 or 毎日3時の cron）→R2」。gen スクリプトはここから引く。
 * 別エンドポイントを使うときは環境変数 SHEET_API で上書き。
 *
 * R2 にまだ無いタブ（同期の対象に足したばかりで、その Worker をまだ本番に出していないタブ）は、
 * ローカルのサービスアカウントでスプシから直接読む（_sheetDirect.mjs）。
 * これが無いと「タブを足す → 本番に出す → もう一度 update-all」の順でしか新しいタブを使えない。
 */
const BASE = process.env.SHEET_API ?? "https://gkapps.hoppepan.com";

/** タブ名を指定して現行スプシのタブ（オブジェクト配列 or 生グリッド）を取得する */
export async function fetchTab(name) {
  const res = await fetch(`${BASE}/api/master?name=${encodeURIComponent(name)}`);
  if (res.ok) return res.json();
  if (res.status !== 404) {
    throw new Error(`スプシタブ取得に失敗: ${name} (${res.status})`);
  }
  // 配信元にまだ無いタブ。ローカルのサービスアカウントでスプシから直接読む
  try {
    const { fetchTabDirect } = await import("./_sheetDirect.mjs");
    const rows = await fetchTabDirect(name);
    console.log(`  ↳ ${name} は配信元にまだ無いので、スプレッドシートから直接読みました（次回の本番反映後は配信元から読みます）`);
    return rows;
  } catch (e) {
    throw new Error(
      `スプシタブ取得に失敗: ${name}（配信元に無く、直接も読めませんでした: ${e instanceof Error ? e.message : e}）`,
    );
  }
}

/** "" や null を 0 に、数値文字列を数値にする（スプシの空セル対策） */
export function num(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
