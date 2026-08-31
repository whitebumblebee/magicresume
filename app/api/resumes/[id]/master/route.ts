import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  MasterResumeError,
  clearMasterResume,
  setMasterResume,
} from "@/lib/career/master-resume";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Designate this resume as the user's master document. */
export async function PUT(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const master = await setMasterResume({ userId: session.user.id, resumeId: id });
    return NextResponse.json({ master });
  } catch (error) {
    if (error instanceof MasterResumeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}

/** Stop treating any resume as master. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  await ctx.params;
  await clearMasterResume({ userId: session.user.id });
  return NextResponse.json({ master: null });
}
