/**
 * フロント向けマスタ読み取り API。
 * - GET /api/master           → master/_index.json（利用可能タブ一覧 {tabs, updatedAt}）
 * - GET /api/master?name=xxx  → master/xxx.json（タブのオブジェクト配列）
 *
 * R2 は非公開バケットのまま、Pages Functions のバインディング(MASTER_BUCKET)経由で読む。
 */

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const name = new URL(request.url).searchParams.get("name");
  if (name !== null && !NAME_PATTERN.test(name)) {
    // パストラバーサル防止（英数・アンダースコア・ハイフンのみ許可）
    return Response.json({ error: "invalid name" }, { status: 400 });
  }

  const key = name ? `master/${name}.json` : "master/_index.json";
  const obj = await env.MASTER_BUCKET.get(key);
  if (!obj) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return new Response(obj.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
