/**
 * ハイ元クロスポータル（https://halogen.hoppepan.com）から所持状況を受け取る。
 *
 * ポータルの「ほぺマスで開く」ボタンは、所持状況をアドレスの # の後ろに付けて
 * このサイトの /support を開く:  /support#halogen=z.<圧縮したデータ>
 * # の後ろはサーバーに送られないので、データがどこかに残ることはない。
 *
 * 中身は JSON { v:1, from:"名前", sup:"サポカのCSV", idol:"PアイドルのCSV" }。
 * CSV は「管理・CSV」の書き出しと同じ形なので、読み込みは ownershipCsv.ts をそのまま使う。
 * z. ＝ deflate-raw で圧縮してから base64url、b. ＝ 圧縮なしの base64url（古いブラウザ用）。
 */

const KEY = "halogen";
const MAX_BYTES = 200_000; // 想定は 15KB ほど。これより大きいものは読まない

export type PortalPayload = { from: string; sup: string; idol: string };

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** アドレスにポータルからのデータが付いているか */
export function hasPortalHash(): boolean {
  return new RegExp(`^#${KEY}=`).test(window.location.hash);
}

/** アドレスの # からデータを取り出す。形が違う・壊れているときは例外 */
export async function readPortalHash(): Promise<PortalPayload | null> {
  const m = window.location.hash.match(new RegExp(`^#${KEY}=([zb])\\.([A-Za-z0-9_-]+)$`));
  if (!m) return null;
  let bytes: Uint8Array<ArrayBuffer> = fromBase64Url(m[2]);
  if (m[1] === "z") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (bytes.length > MAX_BYTES) throw new Error("too large");
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PortalPayload> & { v?: number };
  if (data.v !== 1 || (typeof data.sup !== "string" && typeof data.idol !== "string")) {
    throw new Error("unknown format");
  }
  return {
    from: typeof data.from === "string" ? data.from.slice(0, 40) : "",
    sup: typeof data.sup === "string" ? data.sup : "",
    idol: typeof data.idol === "string" ? data.idol : "",
  };
}

/** 読み終わったら # を消す（再読み込みで二重に読まない・アドレスにデータを残さない） */
export function clearPortalHash() {
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
}
