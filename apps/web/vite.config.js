// Vite config for The Stillhouse web app. Dev + preview proxy /api -> Express on :4000.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const proxy = {
  "/api": {
    target: "http://localhost:4000",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    // Split stable vendor code from app code for better caching/loading (build-time only, no design change)
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          gsap: ["gsap"],
        },
      },
    },
  },
});
