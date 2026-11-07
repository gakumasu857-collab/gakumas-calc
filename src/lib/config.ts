/**
 * サポカ画像の配信元ベースURL。
 *
 * R2 の「S3 API エンドポイント（*.r2.cloudflarestorage.com）」は
 * 認証が必要でブラウザから直接読めないため、ここには使えません。
 * 代わりに次のどちらかの「公開URL」を .env.local に設定してください:
 *   - R2 の公開URL: https://pub-xxxxxxxx.r2.dev
 *   - カスタムドメイン: https://img.あなたのドメイン
 *
 * 例) .env.local
 *   VITE_IMAGE_BASE_URL=https://pub-xxxxxxxx.r2.dev
 *
 * 未設定なら本番の画像置き場（https://img.hoppepan.com）を使う。2026-11-08: .env.local の無い場所でビルドされた版
 * （GitHub に上げた直後に Cloudflare が自動で作って公開した版）で、画像が全部出なくなったため。
 */
export const IMAGE_BASE_URL = (
  (import.meta.env?.VITE_IMAGE_BASE_URL as string | undefined) || "https://img.hoppepan.com"
).replace(/\/$/, "");

/** サポカのファイル名（またはフルURL）から表示用URLを組み立てる。 */
export function imageUrl(file: string): string {
  if (!file) return "";
  // すでにフルURLならそのまま
  if (/^https?:\/\//.test(file)) return file;
  // ベースURL未設定なら空を返し、呼び出し側でプレースホルダを表示する
  if (!IMAGE_BASE_URL) return "";
  // 日本語ファイル名（「あったかいね.webp」等）をURLエンコードする
  const encoded = file
    .replace(/^\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${IMAGE_BASE_URL}/${encoded}`;
}
