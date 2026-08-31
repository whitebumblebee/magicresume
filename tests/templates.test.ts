import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { resumeTemplates, users } from "@/lib/db/schema";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import { applyResumeDesign, extractResumeDesign } from "@/lib/templates/design";
import { designFingerprint } from "@/lib/templates/fingerprint";
import {
  listTemplates,
  setTemplateVisibility,
  upsertPrivateTemplate,
} from "@/lib/templates/repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db as unknown as Db;
}

describe("resume template designs", () => {
  it("extracts no candidate content and remaps slots onto current sections", () => {
    const source = structuredClone(SAMPLE_RESUME);
    source.layout = createLayoutPreset(source, "sidebar-left");
    const design = extractResumeDesign(source);
    const serialized = JSON.stringify(design);

    expect(serialized).not.toContain(source.contact.name);
    expect(serialized).not.toContain(source.contact.email);
    expect(serialized).not.toContain(source.sections[0].entries[0].bullets[0]);
    expect(serialized).not.toContain(source.sections[0].id);

    const target = structuredClone(SAMPLE_RESUME);
    target.contact.name = "Different Candidate";
    target.contact.email = "different@example.com";
    target.sections.forEach((section) => {
      section.id = `target-${section.id}`;
    });
    const beforeContent = {
      contact: structuredClone(target.contact),
      summary: target.summary,
      sections: structuredClone(target.sections),
    };
    const applied = applyResumeDesign(target, design);

    expect(applied.contact).toEqual(beforeContent.contact);
    expect(applied.summary).toEqual(beforeContent.summary);
    expect(applied.sections).toEqual(beforeContent.sections);
    expect(
      applied.layout?.placements
        .filter((placement) => placement.kind === "section")
        .map((placement) => placement.sectionId)
        .sort(),
    ).toEqual(target.sections.map((section) => section.id).sort());
  });

  it("fingerprints design only, independent of candidate content", () => {
    const first = structuredClone(SAMPLE_RESUME);
    first.layout = createLayoutPreset(first, "two-column");
    const second = structuredClone(first);
    second.contact.name = "Someone Else";
    second.summary = "Completely different content";
    second.sections[0].entries[0].bullets = ["Different bullet"];

    const firstDesign = extractResumeDesign(first);
    const secondDesign = extractResumeDesign(second);
    expect(designFingerprint(firstDesign)).toBe(
      designFingerprint(secondDesign),
    );

    secondDesign.layout.columnGap += 1;
    expect(designFingerprint(firstDesign)).not.toBe(
      designFingerprint(secondDesign),
    );
  });
});

describe("template repository", () => {
  let db: Db;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    db = await makeDb();
    const inserted = await db
      .insert(users)
      .values([
        { email: "template-owner@example.com" },
        { email: "template-other@example.com" },
      ])
      .returning({ id: users.id });
    [ownerId, otherId] = inserted.map((row) => row.id);
  });

  it("deduplicates private designs per owner", async () => {
    const doc = structuredClone(SAMPLE_RESUME);
    doc.layout = createLayoutPreset(doc, "sidebar-right");
    const first = await upsertPrivateTemplate({ userId: ownerId, doc, db });
    const second = await upsertPrivateTemplate({ userId: ownerId, doc, db });

    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(resumeTemplates)
      .where(eq(resumeTemplates.userId, ownerId));
    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("private");
  });

  it("shows private templates only to owners and public templates to others", async () => {
    const otherDoc = structuredClone(SAMPLE_RESUME);
    otherDoc.layout = createLayoutPreset(otherDoc, "three-column");
    await upsertPrivateTemplate({ userId: otherId, doc: otherDoc, db });

    const ownerPrivate = (await listTemplates(ownerId, db)).find(
      (item) => item.source === "private",
    )!;
    const beforePublish = await listTemplates(otherId, db);
    expect(beforePublish.some((item) => item.id === ownerPrivate.id)).toBe(
      false,
    );

    const wrongOwner = await setTemplateVisibility({
      userId: otherId,
      id: ownerPrivate.id,
      visibility: "public",
      db,
    });
    expect(wrongOwner).toBeUndefined();

    await setTemplateVisibility({
      userId: ownerId,
      id: ownerPrivate.id,
      visibility: "public",
      db,
    });
    const afterPublish = await listTemplates(otherId, db);
    const shared = afterPublish.find((item) => item.id === ownerPrivate.id);
    expect(shared).toMatchObject({
      source: "public",
      owned: false,
      visibility: "public",
    });
  });
});
