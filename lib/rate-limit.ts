import { NextResponse } from "next/server";

/**
 * Minimal best-effort in-memory rate limiter per Cloud Run instance. It is an
 * abuse floor, not a quota or billing boundary.
 */

const buckets = new Map<string, number[]>();

export function rateLimit(
  req: Request,
  { windowMs, max }: { windowMs: number; max: number },
): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const now = Date.now();
  const key = `${ip}:${Math.floor(now / windowMs)}`;

  const hits = buckets.get(key) ?? [];
  hits.push(now);

  // opportunistic cleanup of stale windows
  if (buckets.size > 10_000) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }

  if (hits.length > max) {
    buckets.set(key, hits);
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  buckets.set(key, hits);
  return null;
}
