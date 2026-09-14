import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * 開発サーバー限定: ヘルプページ用のスクリーンショットを保存する口。
 * ブラウザ側で modern-screenshot（画像に出力と同じライブラリ）で作った画像を
 * POST /__shot {name, dataUrl} で受け取り、public/help/<name>.webp に書き出す。
 * 本番ビルドには含まれない（configureServer は dev のみ）。
 */
function devShotSaver(): Plugin {
  return {
    name: "dev-shot-saver",
    configureServer(server) {
      // 撮影用: 画像CDN（img.hoppepan.com）は localhost からの読み取りを CORS で許していないので、
      // 同一オリジンに見せる中継。/__img?u=<画像URL>
      server.middlewares.use("/__img", async (req, res) => {
        try {
          const u = new URL(req.url ?? "", "http://localhost").searchParams.get("u") ?? "";
          if (!/^https:\/\/img\.hoppepan\.com\//.test(u)) throw new Error("bad url");
          const r = await fetch(u);
          if (!r.ok) throw new Error(String(r.status));
          res.setHeader("Content-Type", r.headers.get("content-type") ?? "image/webp");
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
      server.middlewares.use("/__shot", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name: string; dataUrl: string };
            if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("bad name");
            const m = /^data:image\/(png|webp|jpeg);base64,(.+)$/.exec(dataUrl);
            if (!m) throw new Error("bad dataUrl");
            const dir = fileURLToPath(new URL("./public/help", import.meta.url));
            mkdirSync(dir, { recursive: true });
            const ext = m[1] === "jpeg" ? "jpg" : m[1];
            const file = `${dir}/${name}.${ext}`;
            writeFileSync(file, Buffer.from(m[2], "base64"));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, file, bytes: m[2].length }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// 静的サイト（SPA）として dist/ を書き出し、Cloudflare Workers の
// [assets]（wrangler.toml）で配信する。計算はすべてブラウザ側で完結する。
export default defineConfig({
  plugins: [react(), tailwindcss(), devShotSaver()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
