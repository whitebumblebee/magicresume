import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resumes } from "@/lib/db/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST { isPublic: boolean } — toggle public sharing, returns the share URL slug. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: { isPublic?: boolean };
  try {
    body = (await req.json()) as { isPublic?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const wantPublic = Boolean(body.isPublic);

  const db = getDb();
  const rows = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, session.user.id)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let slug = row.shareSlug;
  if (wantPublic) {
    if (!slug) slug = randomBytes(8).toString("base64url");
  }

  const updated = await db
    .update(resumes)
    .set({ isPublic: wantPublic, shareSlug: wantPublic ? slug : null })
    .where(eq(resumes.id, id))
    .returning({ shareSlug: resumes.shareSlug, isPublic: resumes.isPublic });

  return NextResponse.json({
    isPublic: updated[0].isPublic,
    shareSlug: updated[0].shareSlug,
  });
}
