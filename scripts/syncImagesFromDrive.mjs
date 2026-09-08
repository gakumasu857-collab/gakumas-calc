/**
 * Googleドライブの画像フォルダ → R2 gakumas-image の同期。
 * ドライブにPNG/JPGを置くだけで、webp変換とR2アップロードをまとめてやる
 * （画像変換サイトでの手動webp化は不要になる）。
 *
 * 使い方:
 *   npm run sync:images
 *
 * 事前準備（1回だけ）:
 * 1. スプシ同期に使っているサービスアカウントのJSON鍵を service-account.json として
 *    プロジェクト直下に置く（gitignore済み）。または .env.local に
 *    GS_CLIENT_EMAIL=… / GS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…" を書く。
 * 2. ドライブの各画像フォルダを、そのサービスアカウントのメールに「閲覧者」で共有する。
 * 3. .env.local にフォルダIDを書く（URLの /folders/ 以降）。同期したいものだけでよい:
 *      DRIVE_FOLDER_CARDS=…      → R2直下（サポカ画像 <カード名>.webp）
 *      DRIVE_FOLDER_PREEVENTS=…  → preEvent/（前イベ画像）
 *      DRIVE_FOLDER_SKILLS=…     → skill/（Pアイドル固有スキル画像）
 *
 * 動作: フォルダ内の png/jpg/webp を列挙し、R2に同名の .webp が無いものだけ
 * ダウンロード→webp変換（sharp）→アップロードする。--force で全件上書き。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";
import sharp from "sharp";
import "./_env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_BASE =
  process.env.GAKUMAS_IMAGE_BASE ??
  "https://img.hoppepan.com";
const BUCKET = "gakumas-image";
const FORCE = process.argv.includes("--force");
// 「R2にあるか」の照会はCDNの否定キャッシュ（404を数分覚える）を素通りさせる
const NOCACHE = `?v=${Date.now()}`;

/** 同期対象: .env.local のフォルダID → R2プレフィックス */
const TARGETS = [
  { env: "DRIVE_FOLDER_CARDS", prefix: "", label: "サポカ画像" },
  { env: "DRIVE_FOLDER_PREEVENTS", prefix: "preEvent/", label: "前イベ画像" },
  { env: "DRIVE_FOLDER_SKILLS", prefix: "skill/", label: "Pアイドル画像" },
].filter((t) => process.env[t.env]);

if (TARGETS.length === 0) {
  console.error(
    "✗ フォルダIDが未設定です。.env.local に DRIVE_FOLDER_CARDS / DRIVE_FOLDER_PREEVENTS / DRIVE_FOLDER_SKILLS のいずれかを書いてください。",
  );
  process.exit(1);
}

// ---- サービスアカウント認証（drive.readonly） ----
function credentials() {
  const jsonPath = resolve(root, "service-account.json");
  if (existsSync(jsonPath)) {
    const j = JSON.parse(readFileSync(jsonPath, "utf8"));
    return { email: j.client_email, key: j.private_key };
  }
  const email = process.env.GS_CLIENT_EMAIL;
  const key = process.env.GS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (email && key) return { email, key };
  throw new Error(
    "サービスアカウントが見つかりません（service-account.json か .env.local の GS_CLIENT_EMAIL/GS_PRIVATE_KEY）",
  );
}

async function accessToken() {
  const { email, key } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const b64url = (s) => Buffer.from(s).toString("base64url");
  const unsigned =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key);
  const jwt = `${unsigned}.${signature.toString("base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`トークン取得に失敗 (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

/** フォルダ内のファイル一覧（画像のみ） */
async function listImages(token, folderId) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`一覧取得に失敗 (${res.status}): ${await res.text()}`);
    const body = await res.json();
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
}

const token = await accessToken();
const tmp = mkdtempSync(join(tmpdir(), "gakumas-sync-"));
let uploaded = 0;
let skipped = 0;
const failed = [];

try {
  for (const target of TARGETS) {
    const folderId = process.env[target.env];
    const files = await listImages(token, folderId);
    console.log(`── ${target.label}: ドライブに${files.length}枚`);
    for (const file of files) {
      const base = file.name.replace(/\.(png|jpe?g|webp)$/i, "");
      const key = `${target.prefix}${base}.webp`;
      if (!FORCE) {
        const head = await fetch(
          `${IMAGE_BASE}/${key.split("/").map(encodeURIComponent).join("/")}${NOCACHE}`,
          { method: "HEAD", cache: "no-store" },
        );
        if (head.ok) {
          skipped++;
          continue; // すでにR2にある
        }
      }
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`ダウンロード失敗 (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        const out = join(tmp, `${uploaded}.webp`);
        writeFileSync(out, await sharp(buf).webp({ quality: 90 }).toBuffer());
        // shell:true は引数をクォートせず空白で連結するため、空白や記号を含む引数
        // （cache-control値・カード名）は自前で二重引用符に包む
        const q = (a) => (/[\s&()^"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a);
        execFileSync(
          "npx",
          [
            "wrangler",
            "r2",
            "object",
            "put",
            `${BUCKET}/${key}`,
            "--file",
            out,
            "--content-type",
            "image/webp",
            // カード画像は不変（差し替えは --force 前提）なので長期キャッシュさせる
            "--cache-control",
            "public, max-age=31536000, immutable",
            "--remote",
          ].map(q),
          { cwd: root, stdio: "pipe", shell: true },
        );
        uploaded++;
        console.log(`  ↑ ${key}`);
      } catch (e) {
        failed.push(`${key}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `✓ 完了: アップロード${uploaded}枚 / 既存スキップ${skipped}枚${FORCE ? "（--force）" : ""}`,
);
if (failed.length > 0) {
  console.error(`✗ 失敗 ${failed.length}件:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
if (uploaded > 0) {
  console.log(
    "→ 新カード/前イベを足した場合は npm run gen:all → npm run release で反映してください（skill/ はgen不要）。",
  );
}
