import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiTarget = `${env.VITE_DEV_API_TARGET || env.VITE_API_BASE || "http://localhost:3000"}`.trim();
  const normalizedDevApiTarget = devApiTarget.replace(/\/+$/, "");

  return {
    plugins: [vue()],
    define: {
      "import.meta.env.VERCEL_ENV": JSON.stringify(process.env.VERCEL_ENV || "development")
    },
    server: {
      proxy: {
        "/api": {
          target: normalizedDevApiTarget,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    }
  };
});
