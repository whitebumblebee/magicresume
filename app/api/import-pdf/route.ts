import { NextResponse } from "next/server";
import { llmConfigured, missingKeyMessage } from "@/lib/llm/client";
import { runImportPdf } from "@/lib/import/service";
import { rateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { upsertPrivateTemplate } from "@/lib/templates/repository";

export const runtime = "nodejs";

const MAX_IMAGES = 2;
const MAX_IMAGE_CHARS = 4_200_000; // ~3MB binary after base64

type PromptLine = {
  text: string;
  x: number;
  size: number;
  bold: boolean;
  fontName?: string;
};

interface ImportPdfBody {
  pageSize?: "A4" | "LETTER";
  pageWidthPt?: number;
  pageHeightPt?: number;
  pageLines?: PromptLine[][];
  images?: string[];
}

export async function POST(req: Request) {
  const limited = rateLimit(req, { windowMs: 60_000, max: 6 });
  if (limited) return limited;

  if (!llmConfigured()) {
    return NextResponse.json({ error: missingKeyMessage() }, { status: 503 });
  }

  let body: ImportPdfBody;
  try {
    body = (await req.json()) as ImportPdfBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const images = (body.images ?? []).slice(0, MAX_IMAGES);
  if (
    images.length === 0 ||
    images.some(
      (img) => !img.startsWith("data:image/") || img.length > MAX_IMAGE_CHARS,
    )
  ) {
    return NextResponse.json(
      { error: "Expected 1–2 page render images (data URLs)." },
      { status: 400 },
    );
  }

  const pageLines = body.pageLines;
  if (!Array.isArray(pageLines) || pageLines.length === 0) {
    return NextResponse.json(
      {
        error:
          "No extractable text found — is this a scanned PDF? Try the screenshot clone option instead.",
      },
      { status: 400 },
    );
  }

  try {
    const doc = await runImportPdf({
      pageSize: body.pageSize === "LETTER" ? "LETTER" : "A4",
      pageWidthPt: body.pageWidthPt ?? 595.3,
      pageHeightPt: body.pageHeightPt ?? 841.9,
      pageLines,
      images,
    });
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
    console.error("import-pdf failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Import failed: ${err.message}`
            : "Import failed.",
      },
      { status: 502 },
    );
  }
}
