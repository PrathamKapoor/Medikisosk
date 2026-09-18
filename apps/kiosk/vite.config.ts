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
        // The compiled CJS bundles re-export through tsc's __exportStar, which Rollup cannot
        // statically analyse for named exports. Resolve the whole clinical stack to its ESM
        // source so the kiosk consumes the same single source of truth as the API (and the
        // chief-complaint starter codes stay in one file).
        "@medikiosk/clinical-schema": fileURLToPath(
          new URL(
            "../../packages/clinical-schema/src/index.ts",
            import.meta.url,
          ),
        ),
        "@medikiosk/shared-types": fileURLToPath(
          new URL("../../packages/shared-types/src/index.ts", import.meta.url),
        ),
        "@medikiosk/ai": fileURLToPath(
          new URL("../../packages/ai/src/index.ts", import.meta.url),
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
    preview: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
