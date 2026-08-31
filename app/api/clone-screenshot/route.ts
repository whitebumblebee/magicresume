import { NextResponse } from "next/server";
import { llmConfigured, missingKeyMessage } from "@/lib/llm/client";
import { runCloneScreenshot } from "@/lib/import/service";
import { rateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { upsertPrivateTemplate } from "@/lib/templates/repository";

export const runtime = "nodejs";

const MAX_IMAGE_CHARS = 6_800_000; // ~5MB binary after base64

export async function POST(req: Request) {
  const limited = rateLimit(req, { windowMs: 60_000, max: 6 });
  if (limited) return limited;

  if (!llmConfigured()) {
    return NextResponse.json({ error: missingKeyMessage() }, { status: 503 });
  }

  let body: { image?: string };
  try {
    body = (await req.json()) as { image?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const image = body.image ?? "";
  if (
    !image.startsWith("data:image/") ||
    image.length > MAX_IMAGE_CHARS
  ) {
    return NextResponse.json(
      { error: "Expected an image data URL under ~5MB." },
      { status: 400 },
    );
  }

  try {
    const doc = await runCloneScreenshot(image);
    const session = await auth();
    let templateId: string | null = null;
    if (session?.user?.id) {
      try {
        const template = await upsertPrivateTemplate({
          userId: session.user.id,
          doc,
        });
        templateId = template.id;
      } catch (error) {
        console.error("private template save failed", error);
      }
    }
    return NextResponse.json({ doc, templateId });
  } catch (err) {
    console.error("clone-screenshot failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Clone failed: ${err.message}`
            : "Clone failed.",
      },
      { status: 502 },
    );
  }
}
