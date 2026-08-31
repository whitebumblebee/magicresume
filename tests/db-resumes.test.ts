import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { resumes, users } from "@/lib/db/schema";
import { SAMPLE_RESUME } from "@/lib/resume/sample";

/**
 * Exercises the real migration SQL against an in-memory Postgres (PGlite)
 * and covers the resumes CRUD shape the API routes perform.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeDb() {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db;
}

describe("db: schema + resumes CRUD", () => {
  let db: Awaited<ReturnType<typeof makeDb>>;
  let userId: string;

  beforeAll(async () => {
    db = await makeDb();
    const inserted = await db
      .insert(users)
      .values({ email: "test@example.com", name: "Test" })
      .returning({ id: users.id });
    userId = inserted[0].id;
  });

  it("creates and reads a resume with jsonb doc", async () => {
    const payload = { doc: SAMPLE_RESUME, fitConfig: null };
    const inserted = await db
      .insert(resumes)
      .values({ userId, title: "Test resume", doc: payload })
      .returning({ id: resumes.id, title: resumes.title });
    expect(inserted[0].title).toBe("Test resume");

    const rows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, inserted[0].id));
    expect(rows[0].doc).toEqual(payload);
    expect(rows[0].isPublic).toBe(false);
    expect(rows[0].shareSlug).toBeNull();
  });

  it("enforces unique share slugs", async () => {
    const slug = "testslug123";
    await db
      .insert(resumes)
      .values({ userId, title: "a", doc: {}, shareSlug: slug });
    await expect(
      db.insert(resumes).values({ userId, title: "b", doc: {}, shareSlug: slug }),
    ).rejects.toThrow();
  });

  it("cascades delete when the user is removed", async () => {
    const u = await db
      .insert(users)
      .values({ email: "gone@example.com" })
      .returning({ id: users.id });
    const r = await db
      .insert(resumes)
      .values({ userId: u[0].id, title: "orphan", doc: {} })
      .returning({ id: resumes.id });
    await db.delete(users).where(eq(users.id, u[0].id));
    const left = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, r[0].id));
    expect(left).toHaveLength(0);
  });

  it("toggles share state like the share route does", async () => {
    const r = await db
      .insert(resumes)
      .values({ userId, title: "share me", doc: {} })
      .returning({ id: resumes.id });
    await db
      .update(resumes)
      .set({ isPublic: true, shareSlug: "abc123xy" })
      .where(eq(resumes.id, r[0].id));
    const pub = await db
      .select({ isPublic: resumes.isPublic, slug: resumes.shareSlug })
      .from(resumes)
      .where(eq(resumes.id, r[0].id));
    expect(pub[0].isPublic).toBe(true);
    expect(pub[0].slug).toBe("abc123xy");
  });
});
