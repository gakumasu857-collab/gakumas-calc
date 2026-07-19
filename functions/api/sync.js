/**
 * 保護された同期トリガー。
 * POST /api/sync に x-sync-token: <SYNC_SECRET> を付けて叩くと、
 * スプレッドシート → R2 の同期(syncMasters)を実行する。
 * Cron Worker からもこのエンドポイントを叩く。
 */
import { syncMasters } from "../_lib/sync.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  // SYNC_SECRET 未設定時は誰も叩けない（空文字一致で素通りさせない）
  const token = request.headers.get("x-sync-token");
  if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await syncMasters(env);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 },
    );
  }
}
