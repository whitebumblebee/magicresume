import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  accounts,
  careerFacts,
  careerPreferences,
  factSources,
  feedbackEvents,
  users,
} from "@/lib/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeDb() {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db;
}

describe("db: career memory and tenant isolation", () => {
  let db: Awaited<ReturnType<typeof makeDb>>;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    db = await makeDb();
    const rows = await db
      .insert(users)
      .values([
        { email: "first@example.com" },
        { email: "second@example.com" },
      ])
      .returning({ id: users.id });
    [firstUserId, secondUserId] = rows.map((row) => row.id);
  });

  it("stores Auth.js OAuth expiry as Unix seconds", async () => {
    const expiresAt = 1_800_000_000;
    await db.insert(accounts).values({
      userId: firstUserId,
      type: "oauth",
      provider: "google",
      providerAccountId: "google-test-account",
      expires_at: expiresAt,
    });

    const [account] = await db
      .select({ expiresAt: accounts.expires_at })
      .from(accounts)
      .where(eq(accounts.providerAccountId, "google-test-account"));
    expect(account.expiresAt).toBe(expiresAt);
  });

  it("keeps same-looking facts isolated by authenticated user", async () => {
    await db.insert(careerFacts).values([
      {
        userId: firstUserId,
        kind: "experience",
        title: "Protocol work",
        description: "First user's private evidence.",
        state: "confirmed",
      },
      {
        userId: secondUserId,
        kind: "experience",
        title: "Protocol work",
        description: "Second user's private evidence.",
        state: "confirmed",
      },
    ]);

    const firstUserFacts = await db
      .select()
      .from(careerFacts)
      .where(eq(careerFacts.userId, firstUserId));
    expect(firstUserFacts).toHaveLength(1);
    expect(firstUserFacts[0].description).toBe(
      "First user's private evidence.",
    );
  });

  it("keeps provenance user-scoped and cascades with its fact", async () => {
    const [fact] = await db
      .insert(careerFacts)
      .values({
        userId: firstUserId,
        kind: "project",
        title: "Measured project",
        description: "Reduced latency by 35%.",
        metrics: ["35%"],
      })
      .returning({ id: careerFacts.id });
    await db.insert(factSources).values({
      factId: fact.id,
      userId: firstUserId,
      sourceType: "conversation",
      excerpt: "I measured a 35% latency reduction.",
    });

    const crossUserRead = await db
      .select()
      .from(factSources)
      .where(
        and(
          eq(factSources.factId, fact.id),
          eq(factSources.userId, secondUserId),
        ),
      );
    expect(crossUserRead).toHaveLength(0);

    await db.delete(careerFacts).where(eq(careerFacts.id, fact.id));
    const remaining = await db
      .select()
      .from(factSources)
      .where(eq(factSources.factId, fact.id));
    expect(remaining).toHaveLength(0);
  });

  it("persists explicit feedback as a reusable preference", async () => {
    await db.insert(feedbackEvents).values({
      userId: firstUserId,
      type: "application-style",
      subject: "Bullet was too long.",
      decision: "corrected",
      preferencePatch: { key: "concise_bullets", value: true },
    });
    await db
      .insert(careerPreferences)
      .values({
        userId: firstUserId,
        category: "content",
        key: "concise_bullets",
        value: true,
        learnedFrom: "Rejected verbose bullet",
      })
      .onConflictDoUpdate({
        target: [
          careerPreferences.userId,
          careerPreferences.category,
          careerPreferences.key,
        ],
        set: { value: true, updatedAt: new Date() },
      });

    const preferences = await db
      .select()
      .from(careerPreferences)
      .where(eq(careerPreferences.userId, firstUserId));
    expect(preferences).toHaveLength(1);
    expect(preferences[0].value).toBe(true);
  });
});
