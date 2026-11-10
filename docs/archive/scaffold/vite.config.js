// Handoff config for a standalone Vite build of this frontend.
// (Not used by the Next.js preview shell.) Requires: npm i -D vite @vitejs/plugin-react
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
