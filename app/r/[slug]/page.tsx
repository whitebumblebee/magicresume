import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { resumeDocSchema } from "@/lib/resume/schema";
import { defaultFitConfig, type FitConfig } from "@/lib/fit/types";
import { ResumePage } from "@/lib/render/ResumePage";
import { SharePrintButton } from "@/components/SharePrintButton";

export const dynamic = "force-dynamic";

export default async function SharedResumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(slug)) notFound();

  const db = getDb();
  const rows = await db
    .select({ doc: resumes.doc, title: resumes.title })
    .from(resumes)
    .where(and(eq(resumes.shareSlug, slug), eq(resumes.isPublic, true)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const payload = row.doc as { doc?: unknown; fitConfig?: FitConfig | null };
  const parsed = resumeDocSchema.safeParse(payload?.doc);
  if (!parsed.success) notFound();
  const doc = parsed.data;
  const config = payload?.fitConfig ?? defaultFitConfig(doc.theme);

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-zinc-100 py-8">
      <div className="flex w-full max-w-[820px] items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="font-bold text-sky-800">MagicResume</span>
          <span>· shared resume</span>
        </div>
        <SharePrintButton name={doc.contact.name} />
      </div>
      <div className="shadow-xl ring-1 ring-zinc-300">
        <ResumePage doc={doc} config={config} />
      </div>
      <div className="print-root" aria-hidden>
        <style>{`@page { size: ${doc.page.size === "A4" ? "A4" : "letter"}; margin: 0; }`}</style>
        <ResumePage doc={doc} config={config} />
      </div>
    </main>
  );
}
