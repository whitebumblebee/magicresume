import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { safeHref } from "@/lib/render/link-utils";

export const runtime = "nodejs";

/**
 * Account profile.
 *
 * First + last name is the person's identity: it decides whether an imported
 * resume may become this account's career memory, and it is the name printed on
 * generated resumes and cover letters. Contact details and links are reused for
 * the cover-letter signature.
 *
 * Birth year is optional on purpose — it is never used for identity matching and
 * is sensitive in a hiring context.
 */
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => USERNAME.test(value),
      "Use 3–30 characters: lowercase letters, numbers, dot, underscore or hyphen.",
    ),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  profession: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        url: z.string().trim().min(1).max(400),
      }),
    )
    .max(8)
    .optional()
    .default([]),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .nullable()
    .optional(),
});

const PROFILE_COLUMNS = {
  username: users.username,
  name: users.name,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  profession: users.profession,
  phone: users.phone,
  location: users.location,
  links: users.links,
  birthYear: users.birthYear,
  profileCompletedAt: users.profileCompletedAt,
};

function isComplete(profile: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profileCompletedAt: Date | null;
}): boolean {
  return Boolean(
    profile.profileCompletedAt &&
    profile.username?.trim() &&
    profile.firstName?.trim() &&
    profile.lastName?.trim(),
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const [profile] = await getDb()
    .select(PROFILE_COLUMNS)
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!profile) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  return NextResponse.json({ profile, complete: isComplete(profile) });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter your username, name, and profession.",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Links are user-provided URLs that end up rendered as anchors, so normalize
  // them through the same allowlist the renderer uses and drop unsafe entries.
  const links: { label: string; url: string }[] = [];
  for (const link of input.links) {
    const url = safeHref(link.url);
    if (!url) {
      return NextResponse.json(
        { error: `“${link.label}” is not a valid http(s) link.` },
        { status: 400 },
      );
    }
    links.push({ label: link.label, url });
  }

  const db = getDb();
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, input.username), ne(users.id, userId)))
    .limit(1);
  if (taken) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 },
    );
  }

  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const [profile] = await db
    .update(users)
    .set({
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      // Kept in sync so the Auth.js display name and the identity check agree.
      name: fullName,
      profession: input.profession,
      phone: input.phone,
      location: input.location,
      links,
      birthYear: input.birthYear ?? null,
      profileCompletedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);
  return NextResponse.json({ profile, complete: true });
}
