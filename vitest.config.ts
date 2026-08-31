import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Load .env/.env.local so live tests (live-import.test.ts) can use the
    // real provider keys, matching Next.js behavior.
    env: loadEnv("test", __dirname, ""),
  },
});
