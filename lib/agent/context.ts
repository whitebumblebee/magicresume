export interface CareerAgentContext {
  auth: {
    uid: string;
    email?: string;
  };
  requestId?: string;
}

export function requireAgentUserId(context: unknown): string {
  if (!context || typeof context !== "object") {
    throw new Error("Authenticated agent context is required.");
  }
  const candidate = context as {
    auth?: { uid?: unknown };
    userId?: unknown;
  };
  const userId =
    typeof candidate.auth?.uid === "string"
      ? candidate.auth.uid
      : typeof candidate.userId === "string"
        ? candidate.userId
        : "";
  if (!userId.trim()) {
    throw new Error("Authenticated agent user id is required.");
  }
  return userId;
}

export function createAgentContext(args: {
  userId: string;
  email?: string | null;
  requestId?: string;
}): CareerAgentContext {
  if (!args.userId.trim()) throw new Error("userId is required");
  return {
    auth: {
      uid: args.userId,
      email: args.email ?? undefined,
    },
    requestId: args.requestId,
  };
}
