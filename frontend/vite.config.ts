import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const protocol = fileURLToPath(new URL("../runner/src/protocol", import.meta.url));

// UI は backend（Kotlin）が静的配信する（D16）。
// dev 時は vite dev サーバから backend の API へプロキシする。
const BACKEND = process.env.KW_BACKEND_URL ?? "http://localhost:4646";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": src, "@kw/protocol": protocol } },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
});
