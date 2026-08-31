import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteTemplate,
  setTemplateVisibility,
} from "@/lib/templates/repository";
import { templateVisibilitySchema } from "@/lib/templates/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const updateSchema = z.object({ visibility: templateVisibilitySchema });

async function identity(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { error: "Sign in required." },
        { status: 401 },
      ),
    };
  }
  if (!UUID.test(id)) {
    return {
      error: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  return { userId: session.user.id };
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await identity(id);
  if (actor.error) return actor.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid template update." },
      { status: 400 },
    );
  }
  const template = await setTemplateVisibility({
    userId: actor.userId!,
    id,
    visibility: parsed.data.visibility,
  });
  if (!template) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({
    template: {
      id: template.id,
      visibility: template.visibility,
      publishedAt: template.publishedAt,
    },
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await identity(id);
  if (actor.error) return actor.error;
  const deleted = await deleteTemplate({ userId: actor.userId!, id });
  if (!deleted) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
