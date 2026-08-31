import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";

/**
 * Auth.js v5. Google OAuth in production; a dev-only email login so local
 * development works without OAuth credentials. Session strategy: JWT (works
 * with both providers and serverless).
 */

const devLoginEnabled =
  process.env.NODE_ENV !== "production" || process.env.AUTH_DEV_LOGIN === "1";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.AUTH_SECRET?.trim() ||
    (devLoginEnabled
      ? "mr-local-development-only-secret-change-me"
      : undefined),
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  } as never),
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google]
      : []),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev Login",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(raw) {
              const email = String(raw?.email ?? "")
                .trim()
                .toLowerCase();
              if (!/.+@.+\..+/.test(email)) return null;
              const db = getDb();
              const existing = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);
              if (existing[0]) return existing[0];
              const inserted = await db
                .insert(users)
                .values({ email, name: email.split("@")[0] })
                .onConflictDoNothing()
                .returning();
              return inserted[0] ?? existing[0] ?? null;
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = String(token.uid);
      }
      return session;
    },
  },
});
