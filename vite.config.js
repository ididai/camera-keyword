import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const LOCAL_API_TARGET = "http://127.0.0.1:3000";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = String(env.VITE_LOCAL_API_TARGET || LOCAL_API_TARGET).trim() || LOCAL_API_TARGET;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
