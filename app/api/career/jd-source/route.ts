import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { fetchJdFromUrl, jdFromUploadedText } from "@/lib/career/jd-intake";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Turn a URL or an uploaded file into job-description text.
 *
 * Kept separate from tailoring so a failed fetch costs nothing and the user can
 * see, edit, and confirm the extracted text before any model call.
 */
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().trim().min(4).max(2000) }),
  z.object({
    kind: z.literal("file"),
    filename: z.string().trim().min(1).max(200),
    text: z.string().max(400_000),
  }),
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  // Outbound fetching is rate-limited per user to prevent using the server as a
  // general-purpose page fetcher.
  const limited = rateLimit(req, { windowMs: 60_000, max: 10 });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a job-description URL or file text." },
      { status: 400 },
    );
  }

  const result =
    parsed.data.kind === "url"
      ? await fetchJdFromUrl(parsed.data.url)
      : jdFromUploadedText(parsed.data);

  if (!result.ok) {
    // A blocked or unreadable source is an expected outcome, not a server fault.
    return NextResponse.json(
      { error: result.message, source: result.source },
      { status: 422 },
    );
  }
  return NextResponse.json({ text: result.text, source: result.source });
}
