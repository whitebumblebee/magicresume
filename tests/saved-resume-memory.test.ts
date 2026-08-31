import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db";
import {
  removeSavedResumeFacts,
  savedResumeSourceRef,
  syncSavedResumeFacts,
} from "@/lib/career/saved-resume";
import { listCareerFacts, setCareerFactState } from "@/lib/career/repository";
import { validateArtifactIntegrity } from "@/lib/career/schema";
import { careerFacts, factSources, users } from "@/lib/db/schema";
import { DEFAULT_THEME } from "@/lib/resume/defaults";
import type { ResumeDoc } from "@/lib/resume/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeDb() {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db;
}

function resumeDoc(
  args: {
    bullet?: string;
    includeSkills?: boolean;
  } = {},
): ResumeDoc {
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
        id: "experience",
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: "experience-1",
            heading: "Platform Engineer",
            subheading: "Example Co",
            dateRange: "2024 – Present",
            location: "",
            bullets: [
              args.bullet ??
                "Built a deployment platform that reduced release time by 30%.",
            ],
          },
        ],
      },
      ...(args.includeSkills === false
        ? []
        : [
            {
              id: "skills",
              type: "skills" as const,
              title: "Skills",
              entries: [
                {
                  id: "skills-1",
                  heading: "",
                  subheading: "",
                  dateRange: "",
                  location: "",
                  bullets: ["TypeScript, PostgreSQL, Kubernetes"],
                },
              ],
            },
          ]),
    ],
  };
}

describe("saved resume career-memory reconciliation", () => {
  let db: Awaited<ReturnType<typeof makeDb>>;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    db = await makeDb();
    globalThis.__mrCareerDb = db as unknown as Db;
    const rows = await db
      .insert(users)
      .values([
        // Career memory only accepts a resume matching the account name.
        { email: "saved-resume-first@example.test", name: "Demo Candidate" },
        { email: "saved-resume-second@example.test", name: "Demo Candidate" },
      ])
      .returning({ id: users.id });
    [firstUserId, secondUserId] = rows.map((row) => row.id);
  });

  it("creates inferred facts with keyed provenance and is idempotent", async () => {
    const resumeId = randomUUID();
    const first = await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc(),
      db: db as unknown as Db,
    });
    expect(first).toEqual({
      created: 2,
      reused: 0,
      updated: 0,
      removed: 0,
      preserved: 0,
    });

    const facts = await listCareerFacts(firstUserId);
    const resumeFacts = facts.filter((fact) =>
      fact.sources.some(
        (source) => source.reference === savedResumeSourceRef(resumeId),
      ),
    );
    expect(resumeFacts).toHaveLength(2);
    expect(resumeFacts.every((fact) => fact.state === "inferred")).toBe(true);
    expect(resumeFacts.some((fact) => fact.metrics.includes("30%"))).toBe(true);
    expect(resumeFacts.some((fact) => fact.skills.includes("Kubernetes"))).toBe(
      true,
    );
    expect(
      resumeFacts.every((fact) =>
        fact.sources.some(
          (source) =>
            source.type === "saved_resume" &&
            source.key &&
            source.metadata.active === true,
        ),
      ),
    ).toBe(true);

    const repeated = await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc(),
      db: db as unknown as Db,
    });
    expect(repeated).toEqual({
      created: 0,
      reused: 2,
      updated: 0,
      removed: 0,
      preserved: 0,
    });
    const rows = await db
      .select()
      .from(factSources)
      .where(
        and(
          eq(factSources.userId, firstUserId),
          eq(factSources.sourceRef, savedResumeSourceRef(resumeId)),
        ),
      );
    expect(rows).toHaveLength(2);
  });

  it("updates and removes inferred evidence but preserves reviewed facts", async () => {
    const resumeId = randomUUID();
    await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc(),
      db: db as unknown as Db,
    });

    const changed = await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc({
        bullet: "Built a deployment platform that reduced release time by 35%.",
        includeSkills: false,
      }),
      db: db as unknown as Db,
    });
    expect(changed).toEqual({
      created: 1,
      reused: 0,
      updated: 0,
      removed: 1,
      preserved: 0,
    });

    const [inferred] = await db
      .select()
      .from(careerFacts)
      .where(
        and(
          eq(careerFacts.userId, firstUserId),
          eq(
            careerFacts.description,
            "Built a deployment platform that reduced release time by 35%.",
          ),
        ),
      );
    await setCareerFactState(firstUserId, inferred.id, "confirmed");

    const reviewedChange = await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc({
        bullet: "Built a deployment platform that reduced release time by 40%.",
        includeSkills: false,
      }),
      db: db as unknown as Db,
    });
    expect(reviewedChange).toEqual({
      created: 1,
      reused: 0,
      updated: 0,
      removed: 0,
      preserved: 1,
    });

    const beforeDelete = await listCareerFacts(firstUserId, [
      "confirmed",
      "inferred",
    ]);
    const related = beforeDelete.filter((fact) =>
      fact.sources.some(
        (source) => source.reference === savedResumeSourceRef(resumeId),
      ),
    );
    expect(related.map((fact) => fact.state).sort()).toEqual([
      "confirmed",
      "inferred",
    ]);
    expect(
      related.find((fact) => fact.state === "confirmed")?.description,
    ).toContain("35%");
    expect(
      related.find((fact) => fact.state === "inferred")?.description,
    ).toContain("40%");

    const removed = await removeSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      db: db as unknown as Db,
    });
    expect(removed).toEqual({
      created: 0,
      reused: 0,
      updated: 0,
      removed: 1,
      preserved: 0,
    });
    const afterDelete = await listCareerFacts(firstUserId, [
      "confirmed",
      "inferred",
    ]);
    const remaining = afterDelete.filter((fact) =>
      fact.sources.some(
        (source) => source.reference === savedResumeSourceRef(resumeId),
      ),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].state).toBe("confirmed");
    expect(remaining[0].sources[0].metadata.active).toBe(false);
  });

  it("scopes identical resume sources to the authenticated tenant", async () => {
    const resumeId = randomUUID();
    await syncSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      doc: resumeDoc({ includeSkills: false }),
      db: db as unknown as Db,
    });
    await syncSavedResumeFacts({
      userId: secondUserId,
      resumeId,
      doc: resumeDoc({
        bullet: "Built a private tenant platform for 10 users.",
        includeSkills: false,
      }),
      db: db as unknown as Db,
    });

    await removeSavedResumeFacts({
      userId: firstUserId,
      resumeId,
      db: db as unknown as Db,
    });
    const secondUserFacts = await listCareerFacts(secondUserId);
    expect(secondUserFacts).toHaveLength(1);
    expect(secondUserFacts[0].description).toContain("private tenant");
    expect(secondUserFacts[0].sources[0].metadata.active).toBe(true);
  });

  it("trusts user-supplied saved-resume facts but still blocks aspirational ones", async () => {
    const resumeId = randomUUID();
    const doc = resumeDoc({ includeSkills: false });
    await syncSavedResumeFacts({
      userId: secondUserId,
      resumeId,
      doc,
      db: db as unknown as Db,
    });
    const [fact] = (await listCareerFacts(secondUserId)).filter((item) =>
      item.sources.some(
        (source) => source.reference === savedResumeSourceRef(resumeId),
      ),
    );
    const result = validateArtifactIntegrity(
      {
        kind: "application",
        doc,
        exportable: true,
        claims: [
          {
            path: "sections.0.entries.0.heading",
            text: "Platform Engineer",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.subheading",
            text: "Example Co",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.dateRange",
            text: "2024 – Present",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.bullets.0",
            text: "Built a deployment platform that reduced release time by 30%.",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
        ],
      },
      [fact],
    );
    // The product does not verify employment history, so a fact the user
    // supplied is usable in an application even before they click confirm.
    expect(fact.state).toBe("inferred");
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);

    // The boundary that remains: work the user has NOT done yet stays out of an
    // exportable application and belongs only in the target preview.
    const aspirational = validateArtifactIntegrity(
      {
        kind: "application",
        doc,
        exportable: true,
        claims: [
          {
            path: "sections.0.entries.0.heading",
            text: "Platform Engineer",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.subheading",
            text: "Example Co",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.dateRange",
            text: "2024 – Present",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
          {
            path: "sections.0.entries.0.bullets.0",
            text: "Built a deployment platform that reduced release time by 30%.",
            sourceFactIds: [fact.id],
            mode: "confirmed",
          },
        ],
      },
      [{ ...fact, state: "aspirational" }],
    );
    expect(aspirational.ok).toBe(false);
    expect(aspirational.issues).toContain(
      `Application claim "sections.0.entries.0.heading" references aspirational fact ${fact.id}.`,
    );
  });
});
