"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import type {
  CareerFact,
  GapItem,
  GroundedResumeArtifact,
  JobProfile,
  LearningGoal,
} from "@/lib/career/schema";
import { nextClarifyingQuestion } from "@/lib/career/ingest";
import {
  coverLetterToText,
  type CoverLetter,
} from "@/lib/career/cover-letter-format";
import type { ResumeDoc } from "@/lib/resume/schema";
import { useFitRunner } from "@/lib/fit/useFitRunner";
import { useBuilderStore } from "@/lib/store";
import { Toolbar } from "@/components/Toolbar";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { PrintRoot } from "@/components/PrintRoot";
import { CompressDialog } from "@/components/CompressDialog";
import { AtsPanel } from "@/components/AtsPanel";
import { MyResumes } from "@/components/MyResumes";
import { EditorPanel } from "@/components/editor/EditorPanel";
import { ProfileGate } from "@/components/career/ProfileGate";

type Workspace = "partner" | "memory" | "apply" | "editor";
type ArtifactTab = "application" | "target" | "plan";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface TailoringResult {
  applicationId: string;
  jobProfile: JobProfile;
  gaps: GapItem[];
  goals: LearningGoal[];
  application: GroundedResumeArtifact;
  target: GroundedResumeArtifact;
  rationale: string;
  coverLetter: CoverLetter | null;
}

/** Title a generated resume for its role, e.g. "Web3 Engineer at Protocol Labs". */
function applicationResumeTitle(job: JobProfile): string {
  const role = job.title?.trim() || "Application";
  return job.company?.trim() ? `${role} at ${job.company.trim()}` : role;
}

/** Server verdict on whether an imported resume may become this user's memory. */
interface MemoryOwnershipNotice {
  verdict: "match" | "near" | "mismatch" | "unknown";
  accountName: string | null;
  resumeName: string | null;
  canConfirm: boolean;
  message: string;
}

interface MemorySummary {
  total: number;
  confirmed: number;
  needsReview: number;
  aspirational: number;
  rejected: number;
}

const EMPTY_MEMORY_SUMMARY: MemorySummary = {
  total: 0,
  confirmed: 0,
  needsReview: 0,
  aspirational: 0,
  rejected: 0,
};

export default function CareerPartnerClient() {
  return (
    <SessionProvider>
      <CareerPartnerShell />
    </SessionProvider>
  );
}

function CareerPartnerShell() {
  useFitRunner();
  const { data: session } = useSession();
  const doc = useBuilderStore((state) => state.doc);
  const fit = useBuilderStore((state) => state.fit);
  const artifactKind = useBuilderStore((state) => state.artifactKind);
  const setArtifact = useBuilderStore((state) => state.setArtifact);

  const [workspace, setWorkspace] = useState<Workspace>("partner");
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>("application");
  const [resumesOpen, setResumesOpen] = useState(false);
  const [facts, setFacts] = useState<CareerFact[]>([]);
  const [memorySummary, setMemorySummary] =
    useState<MemorySummary>(EMPTY_MEMORY_SUMMARY);
  const [factsLoading, setFactsLoading] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryOwnership, setMemoryOwnership] = useState<
    (MemoryOwnershipNotice & { doc: ResumeDoc }) | null
  >(null);
  const [tailoring, setTailoring] = useState<TailoringResult | null>(null);
  const [layoutAdvice, setLayoutAdvice] = useState("");
  const observedLayoutRef = useRef("");

  useEffect(() => {
    useBuilderStore.persist.rehydrate();
  }, []);

  const refreshFacts = useCallback(async () => {
    if (!session?.user) return;
    setFactsLoading(true);
    try {
      const response = await fetch("/api/career/facts");
      const payload = (await response.json()) as {
        facts?: CareerFact[];
        summary?: MemorySummary;
        error?: string;
      };
      if (!response.ok || !payload.facts) {
        throw new Error(payload.error ?? "Could not load career memory.");
      }
      setFacts(payload.facts);
      setMemorySummary(payload.summary ?? EMPTY_MEMORY_SUMMARY);
    } catch (error) {
      setMemoryNotice(
        error instanceof Error
          ? error.message
          : "Could not load career memory.",
      );
    } finally {
      setFactsLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshFacts(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshFacts]);

  useEffect(() => {
    const refresh = () => refreshFacts();
    window.addEventListener("mr:memory-changed", refresh);
    return () => window.removeEventListener("mr:memory-changed", refresh);
  }, [refreshFacts]);

  const ingestImportedResume = async (
    importedDoc: ResumeDoc,
    confirmOwnership = false,
  ) => {
    if (!session?.user) {
      setMemoryNotice(
        "Sign in to turn this resume into persistent career memory.",
      );
      setWorkspace("memory");
      return;
    }
    setMemoryNotice("Extracting provisional facts from the imported resume…");
    setWorkspace("memory");
    const response = await fetch("/api/career/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ingest",
        doc: importedDoc,
        confirmOwnership,
      }),
    });
    const payload = (await response.json()) as {
      created?: number;
      reused?: number;
      facts?: CareerFact[];
      summary?: MemorySummary;
      error?: string;
      ownership?: MemoryOwnershipNotice;
    };
    if (!response.ok || !payload.facts) {
      // A resume belonging to someone else is refused for memory only; the
      // document itself stays fully editable, fittable, and exportable.
      setMemoryOwnership(
        payload.ownership?.canConfirm
          ? { ...payload.ownership, doc: importedDoc }
          : null,
      );
      setMemoryNotice(payload.error ?? "Career-memory import failed.");
      return;
    }
    setMemoryOwnership(null);
    setFacts(payload.facts);
    setMemorySummary(payload.summary ?? EMPTY_MEMORY_SUMMARY);
    setMemoryNotice(
      `${payload.summary?.total ?? payload.facts.length} total memory items · ${payload.created ?? 0} new · ${payload.reused ?? 0} reused · ${payload.summary?.needsReview ?? 0} awaiting review.`,
    );
  };

  useEffect(() => {
    if (
      !tailoring ||
      artifactKind !== "application" ||
      !fit ||
      !session?.user
    ) {
      return;
    }
    const key = [
      tailoring.applicationId,
      fit.status,
      Math.round(fit.overflowPx),
      fit.estimatedPages,
      doc.theme.sizes.body * fit.config.sizeScale,
    ].join(":");
    if (observedLayoutRef.current === key) return;
    observedLayoutRef.current = key;

    fetch("/api/career/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: tailoring.applicationId,
        status: fit.status,
        overflowPx: fit.overflowPx,
        estimatedPages: fit.estimatedPages,
        bodyPt: doc.theme.sizes.body * fit.config.sizeScale,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          message?: string;
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Layout check failed.");
        setLayoutAdvice(payload.message ?? "");
      })
      .catch((error) =>
        setLayoutAdvice(
          error instanceof Error ? error.message : "Layout check failed.",
        ),
      );
  }, [tailoring, artifactKind, fit, session?.user, doc.theme.sizes.body]);

  const showArtifact = (tab: ArtifactTab) => {
    setArtifactTab(tab);
    if (!tailoring || tab === "plan") return;
    const artifact =
      tab === "application" ? tailoring.application : tailoring.target;
    setArtifact(artifact.doc, artifact.kind, artifact.watermark, {
      id: tailoring.applicationId,
      title: applicationResumeTitle(tailoring.jobProfile),
    });
  };

  return (
    <>
      <div className="screen-only flex h-screen flex-col">
        {session?.user && <ProfileGate />}
        <Toolbar
          onOpenResumes={() => setResumesOpen(true)}
          onImported={ingestImportedResume}
        />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-120 shrink-0 flex-col border-r border-zinc-200 bg-white">
            <WorkspaceNav
              value={workspace}
              onChange={setWorkspace}
              memoryCount={memorySummary.total}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {workspace === "partner" && (
                <PartnerPanel memoryCount={memorySummary.total} />
              )}
              {workspace === "memory" && (
                <MemoryPanel
                  facts={facts}
                  summary={memorySummary}
                  loading={factsLoading}
                  notice={memoryNotice}
                  ownership={memoryOwnership}
                  onConfirmOwnership={() => {
                    if (memoryOwnership) {
                      void ingestImportedResume(memoryOwnership.doc, true);
                    }
                  }}
                  onRefresh={refreshFacts}
                  onMemoryChange={(nextFacts, summary) => {
                    setFacts(nextFacts);
                    setMemorySummary(summary);
                  }}
                />
              )}
              {workspace === "apply" && (
                <ApplicationPanel
                  usableCount={
                    memorySummary.confirmed + memorySummary.needsReview
                  }
                  result={tailoring}
                  onResult={(result) => {
                    setTailoring(result);
                    setArtifactTab("application");
                    setArtifact(
                      result.application.doc,
                      "application",
                      undefined,
                      {
                        id: result.applicationId,
                        title: applicationResumeTitle(result.jobProfile),
                      },
                    );
                    setLayoutAdvice("");
                  }}
                />
              )}
              {workspace === "editor" && <EditorPanel />}
            </div>
          </aside>

          <main className="relative flex min-w-0 flex-1 flex-col">
            {tailoring && (
              <ArtifactSwitcher
                tab={artifactTab}
                result={tailoring}
                layoutAdvice={layoutAdvice}
                onChange={showArtifact}
              />
            )}
            {artifactTab === "plan" && tailoring ? (
              <PreparationPlan result={tailoring} />
            ) : (
              <PreviewPane />
            )}
          </main>
        </div>
      </div>
      <PrintRoot />
      <CompressDialog />
      <AtsPanel />
      <MyResumes open={resumesOpen} onClose={() => setResumesOpen(false)} />
    </>
  );
}

function WorkspaceNav({
  value,
  onChange,
  memoryCount,
}: {
  value: Workspace;
  onChange: (value: Workspace) => void;
  memoryCount: number;
}) {
  const tabs: Array<{ id: Workspace; label: string; detail?: string }> = [
    { id: "partner", label: "Partner" },
    { id: "memory", label: "Career memory", detail: String(memoryCount) },
    { id: "apply", label: "New application" },
    { id: "editor", label: "Resume editor" },
  ];
  return (
    <nav className="flex border-b border-zinc-200 px-3 pt-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`border-b-2 px-3 pb-2 text-xs font-semibold transition ${
            value === tab.id
              ? "border-sky-700 text-sky-800"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {tab.label}
          {tab.detail && (
            <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px]">
              {tab.detail}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

function PartnerPanel({ memoryCount }: { memoryCount: number }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text:
        memoryCount > 0
          ? "What changed in your career since the last thing I remember?"
          : "Start by importing a resume, or tell me about work you are proud of. I will ask focused questions and save only what you confirm.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [working, setWorking] = useState(false);
  const [toolProgress, setToolProgress] = useState("");

  const send = async () => {
    const message = input.trim();
    if (!message || working) return;
    if (!session?.user) {
      await signIn();
      return;
    }
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setWorking(true);
    setToolProgress("Reading career memory");
    try {
      const response = await fetch("/api/partner/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "MagicResume could not respond.");
      }
      if (!response.body)
        throw new Error("Streaming response was unavailable.");

      setMessages((current) => [...current, { role: "assistant", text: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedText = "";
      let finishReason = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: "text" | "tool" | "done" | "error";
            text?: string;
            name?: string;
            status?: string;
            sessionId?: string;
            finishReason?: string;
            error?: string;
          };
          if (event.type === "text" && event.text) {
            receivedText += event.text;
            setMessages((current) => {
              const next = [...current];
              const last = next.at(-1);
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  text: `${last.text}${event.text}`,
                };
              }
              return next;
            });
          } else if (event.type === "tool" && event.name) {
            setToolProgress(toolLabel(event.name, event.status));
          } else if (event.type === "done") {
            setSessionId(event.sessionId ?? sessionId);
            finishReason = event.finishReason ?? "";
          } else if (event.type === "error") {
            throw new Error(event.error ?? "MagicResume could not respond.");
          }
        }
        if (done) break;
      }

      if (!receivedText) {
        setMessages((current) => {
          const next = [...current];
          const last = next.at(-1);
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              text:
                finishReason === "interrupted"
                  ? "I need your approval before saving that change. Review it in Career memory."
                  : "I completed the step.",
            };
          }
          return next;
        });
      }
      window.dispatchEvent(new Event("mr:memory-changed"));
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "MagicResume could not respond.";
      setMessages((current) => {
        const next = [...current];
        const last = next.at(-1);
        if (last?.role === "assistant" && !last.text) {
          next[next.length - 1] = { ...last, text };
          return next;
        }
        return [...next, { role: "assistant", text }];
      });
    } finally {
      setWorking(false);
      setToolProgress("");
    }
  };

  return (
    <section className="flex min-h-full flex-col p-4">
      <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 p-4">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
          Persistent career partner
        </div>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-950">
          Your career changes. MagicResume remembers.
        </h1>
        <p className="mt-2 text-sm leading-5 text-zinc-600">
          Share accomplishments as they happen. MagicResume asks for the missing
          evidence and reuses only confirmed facts in future applications.
        </p>
      </div>
      <div className="flex-1 space-y-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-5 ${
              message.role === "assistant"
                ? "bg-zinc-100 text-zinc-800"
                : "ml-auto bg-sky-700 text-white"
            }`}
          >
            {message.text}
          </div>
        ))}
        {working && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky-600" />
            {toolProgress || "Deciding the next useful question"}…
          </div>
        )}
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder="Tell MagicResume what you built, learned, changed, or want to pursue…"
          className="w-full resize-none px-2 py-1 text-sm outline-none"
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-zinc-400">
            Enter to send · Shift+Enter for a new line
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || working}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {session?.user ? "Send" : "Sign in to begin"}
          </button>
        </div>
      </div>
    </section>
  );
}

function MemoryPanel({
  facts,
  summary,
  loading,
  notice,
  ownership,
  onConfirmOwnership,
  onRefresh,
  onMemoryChange,
}: {
  facts: CareerFact[];
  summary: MemorySummary;
  loading: boolean;
  notice: string;
  ownership: MemoryOwnershipNotice | null;
  onConfirmOwnership: () => void;
  onRefresh: () => void;
  onMemoryChange: (facts: CareerFact[], summary: MemorySummary) => void;
}) {
  const { data: session } = useSession();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const setState = async (factId: string, state: "confirmed" | "rejected") => {
    const response = await fetch("/api/career/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-state", factId, state }),
    });
    const payload = (await response.json()) as {
      fact?: CareerFact;
      facts?: CareerFact[];
      summary?: MemorySummary;
      error?: string;
    };
    if (!response.ok || !payload.fact || !payload.facts || !payload.summary)
      return;
    onMemoryChange(payload.facts, payload.summary);
  };

  const beginEdit = (fact: CareerFact) => {
    setEditingId(fact.id);
    setDraftTitle(fact.title);
    setDraftDescription(fact.description);
    setDraftNote(fact.userNote ?? "");
  };

  const saveEdit = async (factId: string) => {
    const response = await fetch("/api/career/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        factId,
        title: draftTitle,
        description: draftDescription,
        userNote: draftNote.trim() ? draftNote : null,
      }),
    });
    const payload = (await response.json()) as {
      facts?: CareerFact[];
      summary?: MemorySummary;
    };
    if (!response.ok || !payload.facts || !payload.summary) return;
    onMemoryChange(payload.facts, payload.summary);
    setEditingId(null);
  };

  const removeFact = async (factId: string) => {
    const response = await fetch("/api/career/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", factId }),
    });
    const payload = (await response.json()) as {
      facts?: CareerFact[];
      summary?: MemorySummary;
    };
    if (!response.ok || !payload.facts || !payload.summary) return;
    onMemoryChange(payload.facts, payload.summary);
  };

  if (!session?.user) {
    return (
      <EmptyState
        title="Your memory belongs to your account"
        body="Sign in before importing a resume so MagicResume can remember your career across sessions."
        action="Sign in"
        onAction={() => signIn()}
      />
    );
  }

  return (
    <section className="space-y-3 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950">Career memory</h2>
          <p className="text-xs leading-5 text-zinc-500">
            What MagicResume remembers about you. Edit, annotate, or delete
            anything — confirming is optional.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
        >
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
          {summary.total} total
        </span>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
          {summary.confirmed} confirmed
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
          {summary.needsReview} needs review
        </span>
        {summary.aspirational > 0 && (
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">
            {summary.aspirational} aspirational
          </span>
        )}
      </div>
      {notice && (
        <div
          className={
            ownership
              ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              : "rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800"
          }
        >
          <p>{notice}</p>
          {ownership?.canConfirm && (
            <button
              type="button"
              onClick={onConfirmOwnership}
              className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900"
            >
              This resume is mine — remember it
            </button>
          )}
        </div>
      )}
      {loading && <p className="text-sm text-zinc-500">Loading memory…</p>}
      {!loading && facts.length === 0 && (
        <EmptyState
          title="No career evidence yet"
          body="Import a PDF from the toolbar. MagicResume will extract provisional facts for your review."
        />
      )}
      {facts.map((fact) => {
        const question = nextClarifyingQuestion(fact);
        return (
          <article
            key={fact.id}
            className={`rounded-xl border p-3 ${
              fact.state === "aspirational"
                ? "border-amber-200 bg-amber-50/50"
                : fact.state === "confirmed"
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  {fact.title}
                </div>
                {fact.organization && (
                  <div className="text-xs text-zinc-500">
                    {fact.organization}
                  </div>
                )}
              </div>
              <StateBadge state={fact.state} />
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-600">
              {fact.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                evidence quality {fact.qualityScore}/100
              </span>
              {fact.metrics.map((metric) => (
                <span
                  key={metric}
                  className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700"
                >
                  {metric}
                </span>
              ))}
            </div>
            {question && fact.state !== "aspirational" && (
              <div className="mt-2 rounded bg-violet-50 px-2.5 py-2 text-xs leading-4 text-violet-800">
                MagicResume would ask: {question}
              </div>
            )}
            {fact.userNote && editingId !== fact.id && (
              <p className="mt-2 rounded bg-sky-50 px-2.5 py-2 text-xs leading-4 text-sky-900">
                Your note: {fact.userNote}
              </p>
            )}
            {editingId === fact.id ? (
              <div className="mt-3 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-600">
                  Title
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-[11px] font-medium text-zinc-600">
                  What you actually did
                  <textarea
                    value={draftDescription}
                    onChange={(event) =>
                      setDraftDescription(event.target.value)
                    }
                    rows={4}
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-[11px] font-medium text-zinc-600">
                  Note for MagicResume{" "}
                  <span className="font-normal text-zinc-400">(optional)</span>
                  <textarea
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={2}
                    placeholder="e.g. I led this, not assisted. Emphasise the migration."
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit(fact.id)}
                    className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {fact.state === "inferred" && (
                  <button
                    type="button"
                    onClick={() => setState(fact.id, "confirmed")}
                    className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Confirm accurate
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => beginEdit(fact)}
                  className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-700"
                >
                  Edit or add a note
                </button>
                {fact.state === "inferred" && (
                  <button
                    type="button"
                    onClick={() => setState(fact.id, "rejected")}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-600"
                  >
                    Reject
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeFact(fact.id)}
                  className="ml-auto rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600"
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ApplicationPanel({
  usableCount,
  result,
  onResult,
}: {
  usableCount: number;
  result: TailoringResult | null;
  onResult: (result: TailoringResult) => void;
}) {
  const { data: session } = useSession();
  const [jd, setJd] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [importingJd, setImportingJd] = useState(false);
  const [jdNotice, setJdNotice] = useState("");

  // A URL or file is turned into editable text first, so the user can check what
  // was actually read before any model call happens.
  const loadJdSource = async (body: Record<string, unknown>, label: string) => {
    setImportingJd(true);
    setError("");
    setJdNotice("");
    try {
      const response = await fetch("/api/career/jd-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
      };
      if (!response.ok || !payload.text) {
        setError(payload.error ?? "Could not read that job description.");
        return;
      }
      setJd(payload.text);
      setJdNotice(`Loaded ${payload.text.length} characters from ${label}.`);
    } finally {
      setImportingJd(false);
    }
  };

  const generate = async () => {
    if (!session?.user) {
      await signIn();
      return;
    }
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/career/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawJobDescription: jd }),
      });
      const payload = (await response.json()) as TailoringResult & {
        error?: string;
      };
      if (!response.ok || !payload.applicationId) {
        throw new Error(payload.error ?? "Tailoring failed.");
      }
      onResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tailoring failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-bold text-zinc-950">
          Build an application
        </h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          MagicResume builds from what it remembers about you, writes a resume
          and a cover letter for this role, and separates missing skills into a
          private preparation plan.
        </p>
      </div>
      <div className="space-y-2 rounded-lg border border-zinc-200 p-2.5">
        <p className="text-[11px] font-medium text-zinc-600">
          Load the job description
        </p>
        <div className="flex gap-2">
          <input
            value={jdUrl}
            onChange={(event) => setJdUrl(event.target.value)}
            placeholder="https://company.com/careers/role"
            aria-label="Job description URL"
            className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={importingJd || jdUrl.trim().length < 8}
            onClick={() =>
              void loadJdSource({ kind: "url", url: jdUrl }, "the link")
            }
            className="rounded border border-zinc-300 px-2 py-1.5 text-xs text-zinc-700 disabled:opacity-40"
          >
            {importingJd ? "Reading…" : "Fetch"}
          </button>
        </div>
        <label className="block text-[11px] text-zinc-600">
          …or attach Markdown, text, or PDF
          <input
            type="file"
            accept=".md,.markdown,.txt,.text,.pdf"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              // Reuse the existing browser-side PDF extraction; only text is
              // needed here, so the page renders are ignored.
              const text = /\.pdf$/i.test(file.name)
                ? await (async () => {
                    const { extractPdf } =
                      await import("@/lib/import/pdf-extract");
                    const extracted = await extractPdf(file);
                    return extracted.pageLines
                      .map((lines) => lines.map((line) => line.text).join("\n"))
                      .join("\n\n");
                  })()
                : await file.text();
              await loadJdSource(
                { kind: "file", filename: file.name, text },
                file.name,
              );
              event.target.value = "";
            }}
            className="mt-1 block w-full text-[11px] text-zinc-600"
          />
        </label>
        {jdNotice && <p className="text-[11px] text-emerald-700">{jdNotice}</p>}
      </div>
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          usableCount > 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {usableCount > 0
          ? `${usableCount} memory item${usableCount === 1 ? "" : "s"} available as evidence. Confirming is optional — it only marks what you have double-checked.`
          : "Import a resume or add your experience to career memory before tailoring."}
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-zinc-700">
          Job description
        </span>
        <textarea
          value={jd}
          onChange={(event) => setJd(event.target.value)}
          rows={14}
          placeholder="Paste the complete job description here…"
          className="mt-1 w-full rounded-xl border border-zinc-300 p-3 text-sm leading-5 outline-none focus:border-sky-600"
        />
      </label>
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={generate}
        disabled={working || jd.trim().length < 80 || usableCount === 0}
        className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {working
          ? "Analyzing evidence and building both futures…"
          : "Build truthful application + gap plan"}
      </button>
      {result && (
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs font-semibold text-zinc-900">
            {result.jobProfile.title}
            {result.jobProfile.company ? ` · ${result.jobProfile.company}` : ""}
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {result.rationale}
          </p>
          {result.coverLetter ? (
            <div className="mt-3 border-t border-zinc-200 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  Cover letter · {result.coverLetter.wordCount} words
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      coverLetterToText(result.coverLetter!),
                    )
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700"
                >
                  Copy
                </button>
              </div>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-zinc-700">
                {coverLetterToText(result.coverLetter)}
              </pre>
              <p className="mt-2 text-[11px] leading-4 text-zinc-500">
                Company understanding used:{" "}
                {result.coverLetter.companyUnderstanding}
                {result.coverLetter.companySources.length > 0 &&
                  ` (from ${result.coverLetter.companySources.join(", ")})`}
                . Check this before sending.
              </p>
            </div>
          ) : (
            <p className="mt-3 border-t border-zinc-200 pt-3 text-[11px] text-amber-700">
              The cover letter could not be generated this time. The resume
              above is unaffected — try again from the application list.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ArtifactSwitcher({
  tab,
  result,
  layoutAdvice,
  onChange,
}: {
  tab: ArtifactTab;
  result: TailoringResult;
  layoutAdvice: string;
  onChange: (tab: ArtifactTab) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
      <div className="flex rounded-lg bg-zinc-100 p-1">
        {(
          [
            ["application", "Application resume"],
            ["target", "Target-state preview"],
            ["plan", "Preparation plan"],
          ] as Array<[ArtifactTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              tab === id
                ? id === "target"
                  ? "bg-amber-100 text-amber-900 shadow-sm"
                  : "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-w-md truncate text-xs text-zinc-500">
        {tab === "target"
          ? "Private and non-exportable"
          : tab === "plan"
            ? `${result.goals.length} evidence-building goal${result.goals.length === 1 ? "" : "s"}`
            : layoutAdvice || "Grounded in confirmed career evidence"}
      </div>
      {tab === "application" && <FeedbackControls result={result} />}
    </div>
  );
}

function FeedbackControls({ result }: { result: TailoringResult }) {
  const [saved, setSaved] = useState("");
  const remember = async (
    key: "concise_bullets" | "protect_metrics",
    value: string,
  ) => {
    const response = await fetch("/api/career/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: result.applicationId,
        type: "application-style",
        subject: value,
        decision: "corrected",
        preference: {
          category: "content",
          key,
          value: true,
          learnedFrom: `Application feedback: ${value}`,
          active: true,
        },
      }),
    });
    if (response.ok) {
      setSaved("Remembered for the next application");
      window.setTimeout(() => setSaved(""), 2200);
    }
  };
  return (
    <div className="relative flex items-center gap-1">
      <span className="mr-1 text-[10px] text-zinc-400">Teach MagicResume:</span>
      <button
        type="button"
        onClick={() =>
          remember("concise_bullets", "Prefer shorter, denser bullets.")
        }
        className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50"
      >
        More concise
      </button>
      <button
        type="button"
        onClick={() =>
          remember("protect_metrics", "Never remove confirmed metrics.")
        }
        className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50"
      >
        Protect metrics
      </button>
      {saved && (
        <span className="absolute right-0 top-8 z-30 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[10px] text-white shadow">
          {saved}
        </span>
      )}
    </div>
  );
}

function PreparationPlan({ result }: { result: TailoringResult }) {
  return (
    <div className="flex-1 overflow-y-auto bg-zinc-100 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl bg-zinc-950 p-6 text-white shadow-xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            Private preparation plan
          </div>
          <h2 className="mt-2 text-2xl font-bold">
            Become the candidate shown in your target resume.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
            These gaps never enter the application resume as completed skills.
            Finish the evidence requirements, confirm them with MagicResume,
            then regenerate for a future role.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {result.gaps.map((gap) => (
            <div
              key={`${gap.capability}-${gap.importance}`}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-zinc-900">
                  {gap.capability}
                </h3>
                <GapBadge state={gap.state} />
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {gap.rationale}
              </p>
              <p className="mt-2 text-xs font-medium leading-5 text-sky-800">
                {gap.recommendation}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {result.goals.map((goal, goalIndex) => (
            <article
              key={goal.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-800">
                  {goalIndex + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-zinc-950">{goal.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-zinc-600">
                    {goal.description}
                  </p>
                  <div className="mt-4 space-y-2">
                    {goal.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
                      >
                        <div className="text-sm font-semibold text-zinc-800">
                          {task.title}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">
                          {task.description}
                        </div>
                        <div className="mt-2 text-[11px] font-medium text-emerald-700">
                          Evidence to graduate: {task.completionEvidence}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {result.goals.length === 0 && (
            <EmptyState
              title="No major evidence gaps"
              body="The confirmed career memory already covers the important requirements. Review transferable evidence and polish the application resume."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: CareerFact["state"] }) {
  const classes = {
    inferred: "bg-zinc-100 text-zinc-600",
    confirmed: "bg-emerald-100 text-emerald-700",
    aspirational: "bg-amber-100 text-amber-800",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${classes[state]}`}
    >
      {state}
    </span>
  );
}

function GapBadge({ state }: { state: GapItem["state"] }) {
  const classes = {
    demonstrated: "bg-emerald-100 text-emerald-800",
    transferable: "bg-sky-100 text-sky-800",
    currently_learning: "bg-violet-100 text-violet-800",
    missing: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${classes[state]}`}
    >
      {state.replace("_", " ")}
    </span>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{body}</p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function toolLabel(name: string, status?: string): string {
  const labels: Record<string, string> = {
    get_career_context: "Reading confirmed career evidence",
    propose_career_fact: "Saving provisional career memory",
    review_career_fact: "Preparing an approval checkpoint",
    learn_career_preference: "Remembering your preference",
    build_tailored_application: "Building grounded application artifacts",
    observe_browser_layout: "Checking the one-page fit",
    score_truthful_resume: "Running ATS and evidence checks",
    record_application_feedback: "Learning from your feedback",
  };
  const label = labels[name] ?? "Using a scoped career tool";
  return status === "complete" ? `${label} complete` : label;
}
