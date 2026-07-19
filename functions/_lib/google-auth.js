/**
 * Google サービスアカウント認証（外部ライブラリ不使用）。
 * Web Crypto API (crypto.subtle) で RS256 の JWT を自前署名し、
 * OAuth2 トークンエンドポイントで access_token に交換する。
 *
 * 必要な環境変数:
 * - GS_CLIENT_EMAIL: サービスアカウントのメールアドレス
 * - GS_PRIVATE_KEY : サービスアカウントの秘密鍵（PEM。改行が "\n" 文字列でも可）
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** 文字列 → base64url */
function base64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** バイト列 → base64url */
function base64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * PEM の秘密鍵を CryptoKey に変換する。
 * 環境変数経由だと改行が "\n" という2文字で入るケースが最頻の詰まりポイントなので、
 * 必ず実改行へ戻してからヘッダー・フッターを剥がす。
 */
async function importPrivateKey(pem) {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * サービスアカウントで Sheets API 読み取り用の access_token を取得する。
 * トークンは1時間有効だが、呼び出しごとに取り直すシンプルな実装
 * （同期は数分〜数十分おきなので十分）。
 */
export async function getAccessToken(env) {
  if (!env.GS_CLIENT_EMAIL) throw new Error("GS_CLIENT_EMAIL が未設定です");
  if (!env.GS_PRIVATE_KEY) throw new Error("GS_PRIVATE_KEY が未設定です");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.GS_CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(
    JSON.stringify(claims),
  )}`;

  const key = await importPrivateKey(env.GS_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64urlBytes(new Uint8Array(signature))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`トークン取得に失敗 (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`access_token が返ってこない: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}
