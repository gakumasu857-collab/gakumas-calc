/**
 * スプシ→R2 の同期を手動でトリガーする（POST /api/sync）。
 * gen:all の先頭で実行され、genスクリプトが常に最新のスプシを読めるようにする。
 *
 * SYNC_SECRET は .env.local に書いておく（wrangler secret put で設定したものと同じ値）:
 *   SYNC_SECRET=xxxxx
 * 未設定なら警告してスキップする（R2には定期cronの同期結果が残っているため致命的ではない）。
 */
import "./_env.mjs";

const BASE = process.env.SHEET_API ?? "https://gkapps.hoppepan.com";
const secret = process.env.SYNC_SECRET;

if (!secret) {
  console.warn(
    "⚠ SYNC_SECRET が未設定のため同期をスキップします（.env.local に SYNC_SECRET=… を書くと、gen前にスプシ→R2同期を実行できます）",
  );
  process.exit(0);
}

const res = await fetch(`${BASE}/api/sync`, {
  method: "POST",
  headers: { "x-sync-token": secret },
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✗ 同期に失敗 (${res.status}): ${JSON.stringify(body)}`);
  process.exit(1);
}
const synced = (body.synced ?? []).map((s) => s.tab).join(", ");
const skipped = (body.skipped ?? []).map((s) => `${s.tab}(${s.reason})`).join(", ");
console.log(`✓ スプシ→R2同期: ${synced || "なし"}${skipped ? ` / スキップ: ${skipped}` : ""}`);
