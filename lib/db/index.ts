import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

/**
 * Database factory.
 *  - DATABASE_URL set  → hosted Postgres (Neon in production) via postgres.js
 *  - else (local dev)  → embedded PGlite persisted to .pglite/ (gitignored)
 * Production must provide DATABASE_URL; schema is identical in both modes.
 */

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

declare global {
  var __mrCareerDb: Db | undefined;
}

function createDb(): Db {
  if (process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    return drizzlePg(client, { schema }) as unknown as Db;
  }
  if (process.env.K_SERVICE) {
    throw new Error("Cloud Run requires DATABASE_URL database configuration.");
  }
  const dataDir =
    process.env.PGLITE_DATA_DIR ??
    `${process.cwd()}/.pglite`;
  const client = new PGlite(dataDir);
  return drizzlePglite(client, { schema }) as unknown as Db;
}

/** Reuse the connection across hot reloads / route invocations. */
export function getDb(): Db {
  if (!globalThis.__mrCareerDb) {
    globalThis.__mrCareerDb = createDb();
  }
  return globalThis.__mrCareerDb;
}
