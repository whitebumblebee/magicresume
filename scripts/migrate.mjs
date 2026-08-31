import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL before running migrations.");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("MR database migrations completed.");
} finally {
  await client.end();
}
