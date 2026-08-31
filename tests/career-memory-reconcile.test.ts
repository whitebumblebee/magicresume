import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  listCareerFacts,
  setCareerFactState,
  syncImportedResumeFacts,
} from "@/lib/career/repository";
import { syncSavedResumeFacts } from "@/lib/career/saved-resume";
import { DEFAULT_THEME } from "@/lib/resume/defaults";
import type { ResumeDoc } from "@/lib/resume/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db as unknown as Db;
}

function importedDoc(): ResumeDoc {
  return {
    page: { size: "A4" },
    theme: structuredClone(DEFAULT_THEME),
    contact: {
      name: "Demo Candidate",
      email: "candidate@example.test",
      phone: "",
      location: "",
      links: [],
    },
    summary: "",
    sections: [
      {
        id: "generated-section-id",
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: "generated-entry-id",
            heading: "Platform Engineer",
            subheading: "Example Co",
            dateRange: "2024 – Present",
            location: "",
            bullets: ["Reduced release time by 30%."],
          },
        ],
      },
    ],
  };
}

describe("cross-source career-memory reconciliation", () => {
  let db: Db;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    db = await makeDb();
    const rows = await db
      .insert(users)
      .values([
        // Career memory only accepts a resume matching the account name.
        { email: "reconcile-first@example.test", name: "Demo Candidate" },
        { email: "reconcile-second@example.test", name: "Demo Candidate" },
      ])
      .returning({ id: users.id });
    [firstUserId, secondUserId] = rows.map((row) => row.id);
  });

  it("reuses a stable document and entry identity on repeated import", async () => {
    const first = await syncImportedResumeFacts({
      userId: firstUserId,
      doc: importedDoc(),
      db,
    });
    const repeatedDoc = importedDoc();
    repeatedDoc.sections[0].id = "different-generated-section-id";
    repeatedDoc.sections[0].entries[0].id = "different-generated-entry-id";
    const repeated = await syncImportedResumeFacts({
      userId: firstUserId,
      doc: repeatedDoc,
      db,
    });

    expect(first.created).toBe(1);
    expect(first.reused).toBe(0);
    expect(repeated.sourceRef).toBe(first.sourceRef);
    expect(repeated.created).toBe(0);
    expect(repeated.reused).toBe(1);
    expect(repeated.summary).toMatchObject({
      total: 1,
      confirmed: 0,
      needsReview: 1,
    });
    expect(repeated.facts[0].sources).toHaveLength(1);
  });

  it("adopts a saved-resume source without duplicating or demoting a reviewed fact", async () => {
    const [fact] = await listCareerFacts(firstUserId, ["inferred"], db);
    await setCareerFactState(firstUserId, fact.id, "confirmed", db);
    const saved = await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId: randomUUID(),
      doc: importedDoc(),
      db,
    });
    const facts = await listCareerFacts(
      firstUserId,
      ["confirmed", "inferred", "aspirational", "rejected"],
      db,
    );

    expect(saved).toMatchObject({ created: 0, reused: 1 });
    expect(facts).toHaveLength(1);
    expect(facts[0].state).toBe("confirmed");
    expect(facts[0].sources.map((source) => source.type).sort()).toEqual([
      "resume_pdf",
      "saved_resume",
    ]);
  });

  it("never reuses another tenant's equivalent evidence", async () => {
    const second = await syncImportedResumeFacts({
      userId: secondUserId,
      doc: importedDoc(),
      db,
    });
    expect(second.created).toBe(1);
    expect(second.reused).toBe(0);
    expect(second.facts).toHaveLength(1);
    expect(second.facts[0].state).toBe("inferred");
  });
});
