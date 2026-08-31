import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Local dev: embedded PGlite at .pglite/ (no DATABASE_URL needed).
 * Production: set DATABASE_URL (Neon/Postgres) and the same push/migrate applies.
 */
export default defineConfig(
  process.env.DATABASE_URL
    ? {
        dialect: "postgresql",
        schema: "./lib/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.DATABASE_URL },
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./lib/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? "./.pglite" },
      },
);
