import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "API_");
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@medikiosk/i18n": fileURLToPath(
          new URL("../../packages/i18n/src/index.ts", import.meta.url),
        ),
      },
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
