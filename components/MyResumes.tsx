"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useBuilderStore } from "@/lib/store";
import { effectiveConfig } from "@/lib/fit/engine";
import { resumeDocSchema } from "@/lib/resume/schema";
import type { FitConfig } from "@/lib/fit/types";

interface ResumeListItem {
  id: string;
  title: string;
  /** "third_party" resumes are fully editable but never feed career memory. */
  subjectKind?: "self" | "third_party";
  subjectName?: string | null;
  /** The master resume supplies design + contact for generated resumes. */
  isMaster?: boolean;
  /** Set when this resume was generated for a specific job application. */
  applicationId?: string | null;
  shareSlug: string | null;
  isPublic: boolean;
  updatedAt: string;
}

/**
 * Cloud saves drawer: list / save / load / delete / share. Cloud features are
 * auth-gated (free tier stays fully functional locally).
 */
export function MyResumes({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const doc = useBuilderStore((s) => s.doc);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const fit = useBuilderStore((s) => s.fit);
  const setManual = useBuilderStore((s) => s.setManual);
  const setAutoFit = useBuilderStore((s) => s.setAutoFit);
  const loadImported = useBuilderStore((s) => s.loadImported);
  const sourceApplicationId = useBuilderStore((s) => s.sourceApplicationId);
  const sourceApplicationTitle = useBuilderStore(
    (s) => s.sourceApplicationTitle,
  );

  const [items, setItems] = useState<ResumeListItem[]>([]);
  // Own resumes first, then resumes managed on someone else's behalf.
  const groups = [
    {
      key: "self" as const,
      label: "My resumes",
      items: items.filter((item) => item.subjectKind !== "third_party"),
    },
    {
      key: "third_party" as const,
      label: "Managed for someone else",
      items: items.filter((item) => item.subjectKind === "third_party"),
    },
  ].filter((group) => group.items.length > 0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session?.user) return;
    setPhase("loading");
    try {
      const res = await fetch("/api/resumes");
      const json = (await res.json()) as {
        resumes?: ResumeListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setItems(json.resumes ?? []);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setPhase("error");
    }
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [open, refresh]);

  if (!open) return null;

  const save = async (asNew: boolean) => {
    const config = effectiveConfig(doc, autoFitOn, manual, fit);
    const id = asNew ? null : currentId;
    const res = await fetch(id ? `/api/resumes/${id}` : "/api/resumes", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc,
        fitConfig: config,
        applicationId: sourceApplicationId ?? undefined,
        // Generated resumes keep the role title. Re-saving an opened resume
        // omits title so PUT leaves the stored name alone.
        ...(sourceApplicationTitle?.trim()
          ? { title: sourceApplicationTitle.trim() }
          : id
            ? {}
            : { title: doc.contact.name.trim() || "Untitled resume" }),
      }),
    });
    const json = (await res.json()) as {
      resume?: { id: string };
      memory?: {
        created: number;
        reused: number;
        summary: { total: number; needsReview: number };
      };
      error?: string;
    };
    if (!res.ok || !json.resume) {
      setError(json.error ?? "Save failed.");
      return;
    }
    setCurrentId(json.resume.id);
    setMemoryNotice(
      json.memory
        ? `${json.memory.summary.total} total memory items · ${json.memory.created} new · ${json.memory.reused} reused · ${json.memory.summary.needsReview} awaiting review.`
        : "Saved resume evidence is ready for review in Career memory.",
    );
    window.dispatchEvent(new Event("mr:memory-changed"));
    void refresh();
  };

  const syncMemory = async () => {
    setBusyId("memory-sync");
    setError("");
    try {
      const response = await fetch("/api/resumes/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as {
        backfill?: { resumes: number; created: number; reused: number };
        summary?: { total: number; needsReview: number };
        error?: string;
      };
      if (!response.ok || !payload.backfill) {
        throw new Error(payload.error ?? "Memory sync failed.");
      }
      setMemoryNotice(
        `${payload.summary?.total ?? 0} total memory items · ${payload.backfill.created} new · ${payload.backfill.reused} reused · ${payload.summary?.needsReview ?? 0} awaiting review.`,
      );
      window.dispatchEvent(new Event("mr:memory-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Memory sync failed.");
    } finally {
      setBusyId(null);
    }
  };

  const load = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/resumes/${id}`);
      const json = (await res.json()) as {
        resume?: {
          doc: { doc: unknown; fitConfig: FitConfig | null };
          applicationId?: string | null;
          title?: string;
        };
        error?: string;
      };
      if (!res.ok || !json.resume) throw new Error(json.error ?? "Load failed");
      const parsed = resumeDocSchema.safeParse(json.resume.doc.doc);
      if (!parsed.success) throw new Error("Saved resume is invalid.");
      loadImported(parsed.data);
      if (json.resume.applicationId) {
        useBuilderStore.setState({
          sourceApplicationId: json.resume.applicationId,
          sourceApplicationTitle: json.resume.title ?? null,
        });
      }
      const cfg = json.resume.doc.fitConfig;
      if (cfg) {
        setAutoFit(false);
        setManual(cfg);
      } else {
        setAutoFit(true);
      }
      setCurrentId(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusyId(null);
    }
  };

  const toggleMaster = async (item: ResumeListItem) => {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/resumes/${item.id}/master`, {
        method: item.isMaster ? "DELETE" : "PUT",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not update the master resume.");
      }
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the master resume.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      if (currentId === id) setCurrentId(null);
      window.dispatchEvent(new Event("mr:memory-changed"));
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleShare = async (item: ResumeListItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/resumes/${item.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !item.isPublic }),
      });
      const json = (await res.json()) as {
        shareSlug?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Share failed");
      if (json.shareSlug) {
        const url = `${window.location.origin}/r/${json.shareSlug}`;
        await navigator.clipboard?.writeText(url).catch(() => undefined);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-zinc-900/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-[380px] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">My resumes</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        {!session?.user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-zinc-600">
              Sign in to save resumes to the cloud, keep multiple versions, and
              share them as links.
            </p>
            <p className="text-xs text-zinc-400">
              Your current resume stays safe in this browser either way.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 border-b border-zinc-100 px-4 py-3">
              <div className="flex gap-2">
                <button
                  onClick={() => save(false)}
                  className="flex-1 rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800"
                >
                  {currentId ? "Save changes" : "Save"}
                </button>
                <button
                  onClick={() => save(true)}
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Save as new
                </button>
              </div>
              <button
                type="button"
                disabled={busyId === "memory-sync"}
                onClick={syncMemory}
                className="w-full rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-40"
              >
                {busyId === "memory-sync"
                  ? "Syncing career memory…"
                  : "Sync saved resumes to Career memory"}
              </button>
            </div>
            {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
            {memoryNotice && (
              <p className="px-4 py-2 text-xs text-sky-700">{memoryNotice}</p>
            )}
            <div className="flex-1 overflow-y-auto p-2">
              {phase === "loading" && (
                <p className="px-2 py-4 text-sm text-zinc-400">Loading…</p>
              )}
              {phase === "ready" && items.length === 0 && (
                <p className="px-2 py-4 text-sm text-zinc-400">
                  No saved resumes yet — hit Save to store the current one.
                </p>
              )}
              {groups.map((group) => (
                <section key={group.key} className="mb-3">
                  {groups.length > 1 && (
                    <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {group.label}
                    </h3>
                  )}
                  {group.key === "third_party" && (
                    <p className="px-2 pb-2 text-[11px] leading-4 text-zinc-500">
                      Editable, fittable, and exportable. These never become
                      your career memory and cannot be tailored from your
                      history.
                    </p>
                  )}
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className={`rounded-lg border p-2.5 ${item.id === currentId ? "border-sky-300 bg-sky-50/60" : "border-zinc-200"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                            {item.title}
                          </span>
                          {item.applicationId && (
                            <span
                              title="Generated for a specific job application"
                              className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"
                            >
                              FOR A JD
                            </span>
                          )}
                          {item.isMaster && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              MASTER
                            </span>
                          )}
                          {item.id === currentId && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              CURRENT
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          {new Date(item.updatedAt).toLocaleString()}
                          {item.isPublic && item.shareSlug && (
                            <a
                              href={`/r/${item.shareSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-sky-700 underline"
                            >
                              shared ↗
                            </a>
                          )}
                        </div>
                        <div className="mt-2 flex gap-1.5 text-xs">
                          <button
                            disabled={busyId === item.id}
                            onClick={() => load(item.id)}
                            className="rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                          >
                            Open
                          </button>
                          <button
                            disabled={busyId === item.id}
                            onClick={() => toggleShare(item)}
                            className={`rounded border px-2 py-1 disabled:opacity-40 ${item.isPublic ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
                          >
                            {item.isPublic
                              ? "Sharing · copy link"
                              : "Share link"}
                          </button>
                          {group.key === "self" && (
                            <button
                              disabled={busyId === item.id}
                              onClick={() => toggleMaster(item)}
                              title="The master resume supplies the design and contact details for every resume MagicResume generates for you."
                              className={`rounded border px-2 py-1 disabled:opacity-40 ${item.isMaster ? "border-violet-300 bg-violet-50 text-violet-700" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
                            >
                              {item.isMaster ? "Master ✓" : "Set as master"}
                            </button>
                          )}
                          <button
                            disabled={busyId === item.id}
                            onClick={() => remove(item.id)}
                            className="ml-auto rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
