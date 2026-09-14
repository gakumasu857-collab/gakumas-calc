import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 静的サイト（SPA）として dist/ を書き出し、Cloudflare Workers の
// [assets]（wrangler.toml）で配信する。計算はすべてブラウザ側で完結する。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
