/**
 * .env.local の簡易ローダー（依存なし）。
 * KEY=VALUE 行を process.env へ読み込む（既に設定済みの環境変数は上書きしない）。
 * genスクリプト群が SYNC_SECRET や画像ベースURL等を使うためのもの。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    // 値の前後の引用符は剥がす
    const value = rawValue.replace(/^(["'])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

loadEnvLocal();
