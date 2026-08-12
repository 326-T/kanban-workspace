import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

// UI は kw-core（Kotlin）が静的配信する（D16）。
// dev 時は vite dev サーバから core の API へプロキシする。
const CORE = process.env.KW_CORE_URL ?? "http://localhost:4646";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": src } },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: CORE, changeOrigin: true },
    },
  },
});
