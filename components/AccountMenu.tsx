"use client";

import { useSession, signOut, signIn } from "next-auth/react";

/** Account button: signed-in menu (email + sign out) / sign-in button. */
export function AccountMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-xs text-zinc-400">…</span>;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="group relative">
      <button className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-700 text-[10px] font-bold text-white">
          {(session.user.name ?? session.user.email ?? "?")
            .slice(0, 1)
            .toUpperCase()}
        </span>
        <span className="max-w-24 truncate">
          {session.user.name ?? session.user.email}
        </span>
        <span className="text-[10px] text-zinc-400">▾</span>
      </button>
      <div className="invisible absolute right-0 z-40 mt-1 w-44 rounded-md border border-zinc-200 bg-white py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
        <div className="truncate border-b border-zinc-100 px-3 py-1.5 text-xs text-zinc-400">
          {session.user.email}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
