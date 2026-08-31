import { and, desc, eq, or } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { resumeTemplates } from "@/lib/db/schema";
import { DEFAULT_THEME, emptyResumeDoc } from "@/lib/resume/defaults";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import type { ResumeDoc, SectionType } from "@/lib/resume/schema";
import { extractResumeDesign } from "./design";
import { designFingerprint } from "./fingerprint";
import {
  resumeTemplateDesignSchema,
  type ResumeTemplateDesign,
  type TemplateVisibility,
} from "./schema";

export interface TemplateItem {
  id: string;
  title: string;
  source: "builtin" | "private" | "public";
  owned: boolean;
  visibility: TemplateVisibility | "builtin";
  design: ResumeTemplateDesign;
  updatedAt: string | null;
}

function templateFixture(): ResumeDoc {
  const doc = emptyResumeDoc();
  const types: SectionType[] = [
    "experience",
    "skills",
    "education",
    "projects",
    "certifications",
  ];
  doc.sections = types.map((type, index) => ({
    id: `slot-${type}-${index}`,
    type,
    title: type,
    entries: [],
  }));
  return doc;
}

export function builtInTemplates(): TemplateItem[] {
  const definitions = [
    ["builtin-single", "Classic single column", "single"],
    ["builtin-sidebar-left", "Modern left sidebar", "sidebar-left"],
    ["builtin-sidebar-right", "Modern right sidebar", "sidebar-right"],
    ["builtin-two-column", "Balanced two column", "two-column"],
    ["builtin-three-column", "Modular three column", "three-column"],
  ] as const;
  return definitions.map(([id, title, preset]) => {
    const doc = templateFixture();
    doc.theme = structuredClone(DEFAULT_THEME);
    doc.layout = createLayoutPreset(doc, preset);
    return {
      id,
      title,
      source: "builtin",
      owned: false,
      visibility: "builtin",
      design: extractResumeDesign(doc),
      updatedAt: null,
    };
  });
}

export async function listTemplates(
  userId?: string,
  db: Db = getDb(),
): Promise<TemplateItem[]> {
  const condition = userId
    ? or(
        eq(resumeTemplates.userId, userId),
        eq(resumeTemplates.visibility, "public"),
      )
    : eq(resumeTemplates.visibility, "public");
  const rows = await db
    .select()
    .from(resumeTemplates)
    .where(condition)
    .orderBy(desc(resumeTemplates.updatedAt))
    .limit(100);

  const stored = rows.flatMap<TemplateItem>((row) => {
    const parsed = resumeTemplateDesignSchema.safeParse(row.design);
    if (!parsed.success) return [];
    const owned = row.userId === userId;
    const visibility =
      row.visibility === "public" ? "public" : "private";
    return [
      {
        id: row.id,
        title: row.title,
        source: owned ? "private" : "public",
        owned,
        visibility,
        design: parsed.data,
        updatedAt: row.updatedAt.toISOString(),
      },
    ];
  });
  return [...builtInTemplates(), ...stored];
}

export async function upsertPrivateTemplate(args: {
  userId: string;
  doc: ResumeDoc;
  title?: string;
  sourceResumeId?: string;
  db?: Db;
}) {
  const db = args.db ?? getDb();
  const design = extractResumeDesign(args.doc);
  const fingerprint = designFingerprint(design);
  const title =
    args.title?.trim().slice(0, 120) ||
    `Imported ${design.layout.preset.replaceAll("-", " ")} design`;
  const [row] = await db
    .insert(resumeTemplates)
    .values({
      userId: args.userId,
      sourceResumeId: args.sourceResumeId,
      title,
      schemaVersion: design.version,
      design,
      designFingerprint: fingerprint,
      visibility: "private",
      previewMetadata: {
        preset: design.layout.preset,
        regions: design.layout.regions.length,
      },
    })
    .onConflictDoUpdate({
      target: [
        resumeTemplates.userId,
        resumeTemplates.designFingerprint,
      ],
      set: {
        title,
        sourceResumeId: args.sourceResumeId,
        design,
        previewMetadata: {
          preset: design.layout.preset,
          regions: design.layout.regions.length,
        },
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function setTemplateVisibility(args: {
  userId: string;
  id: string;
  visibility: TemplateVisibility;
  db?: Db;
}) {
  const db = args.db ?? getDb();
  const [row] = await db
    .update(resumeTemplates)
    .set({
      visibility: args.visibility,
      publishedAt: args.visibility === "public" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(resumeTemplates.id, args.id),
        eq(resumeTemplates.userId, args.userId),
      ),
    )
    .returning();
  return row;
}

export async function deleteTemplate(args: {
  userId: string;
  id: string;
  db?: Db;
}): Promise<boolean> {
  const db = args.db ?? getDb();
  const deleted = await db
    .delete(resumeTemplates)
    .where(
      and(
        eq(resumeTemplates.id, args.id),
        eq(resumeTemplates.userId, args.userId),
      ),
    )
    .returning({ id: resumeTemplates.id });
  return deleted.length > 0;
}
