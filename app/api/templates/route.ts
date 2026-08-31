import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resumeDocSchema } from "@/lib/resume/schema";
import {
  listTemplates,
  upsertPrivateTemplate,
} from "@/lib/templates/repository";

export const runtime = "nodejs";

const createTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  doc: resumeDocSchema,
});

export async function GET() {
  const session = await auth();
  const templates = await listTemplates(session?.user?.id);
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid template payload." },
      { status: 400 },
    );
  }
  const template = await upsertPrivateTemplate({
    userId: session.user.id,
    doc: parsed.data.doc,
    title: parsed.data.title,
  });
  return NextResponse.json(
    { template: { id: template.id, visibility: template.visibility } },
    { status: 201 },
  );
}
