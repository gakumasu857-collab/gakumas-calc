/**
 * gakumas-calc をまとめて配信する単一 Worker。
 * - SPA（dist/ の静的アセット）配信
 * - GET  /api/master(?name=xxx) : R2 のマスタJSONを返す（フロント向け）
 * - POST /api/sync              : x-sync-token 一致で同期を実行（手動トリガー）
 * - scheduled（cron）           : 同期をこの Worker 内で直接実行（別Worker不要）
 *
 * スプシ→R2 の同期本体・Google認証は worker/lib/ にある。
 * バインド: MASTER_BUCKET(R2) / ASSETS(静的アセット)
 * 変数: SHEET_ID, SHEET_TABS（vars）/ GS_CLIENT_EMAIL, GS_PRIVATE_KEY, SYNC_SECRET（secret）
 */
import { syncMasters } from "./lib/sync.js";

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

/** GET /api/master(?name=xxx) — R2 由来のマスタJSONを返す */
async function handleMaster(request, env) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const name = new URL(request.url).searchParams.get("name");
  if (name !== null && !NAME_PATTERN.test(name)) {
    return json({ error: "invalid name" }, 400); // パストラバーサル防止
  }
  const key = name ? `master/${name}.json` : "master/_index.json";
  const obj = await env.MASTER_BUCKET.get(key);
  if (!obj) return json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/** POST /api/sync — トークン一致で同期を実行（手動トリガー） */
async function handleSync(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const token = request.headers.get("x-sync-token");
  if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
    return json({ error: "forbidden" }, 403);
  }
  try {
    return json(await syncMasters(env));
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/master") return handleMaster(request, env);
    if (url.pathname === "/api/sync") return handleSync(request, env);
    // それ以外は静的アセット（SPAフォールバックは not_found_handling に従う）
    return env.ASSETS.fetch(request);
  },

  /** Cron Trigger: 同期をこの Worker 内で直接実行（HTTP自己呼び出しは不要） */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      syncMasters(env)
        .then((r) => console.log("sync ok:", JSON.stringify(r).slice(0, 400)))
        .catch((e) => console.log("sync failed:", String(e))),
    );
  },
};
