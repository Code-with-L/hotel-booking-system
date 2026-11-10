import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The React Router frontend keeps its screens in src/pages/*.jsx (Vite-style).
   * Restricting page extensions to TS/TSX stops Next.js from treating those
   * JSX modules as Pages Router routes. Routing is handled by React Router.
   */
  pageExtensions: ["tsx", "ts"],
};

export default nextConfig;
