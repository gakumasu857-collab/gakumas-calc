/**
 * マスタ同期の Cron Trigger 本体（Pages とは別のWorker）。
 * 定期的に Pages Functions の /api/sync を叩いて同期を起動する。
 *
 * 必要な secret:
 * - SYNC_ENDPOINT: https://<プロジェクト>.pages.dev/api/sync
 * - SYNC_SECRET  : Pages 側と同じ値
 */

async function triggerSync(env) {
  try {
    const res = await fetch(env.SYNC_ENDPOINT, {
      method: "POST",
      headers: { "x-sync-token": env.SYNC_SECRET },
    });
    const body = await res.text();
    console.log(`sync ${res.status}: ${body.slice(0, 500)}`);
    return { status: res.status, body };
  } catch (e) {
    // throw しない: 一時エラーは次の Cron で自然にリトライされる
    const message = String(e instanceof Error ? e.message : e);
    console.log(`sync failed: ${message}`);
    return { error: message };
  }
}

export default {
  /** Cron Trigger（wrangler.toml の triggers.crons）から呼ばれる */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(triggerSync(env));
  },

  /** 動作確認用: Worker の URL を直接開くと手動で同期を起動できる */
  async fetch(_request, env) {
    const result = await triggerSync(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};
