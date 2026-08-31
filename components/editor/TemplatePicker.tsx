"use client";

import { useCallback, useEffect, useState } from "react";
import { useBuilderStore } from "@/lib/store";
import {
  resumeTemplateDesignSchema,
  type ResumeTemplateDesign,
} from "@/lib/templates/schema";

interface TemplateItem {
  id: string;
  title: string;
  source: "builtin" | "private" | "public";
  owned: boolean;
  visibility: "builtin" | "private" | "public";
  design: ResumeTemplateDesign;
}

export function TemplatePicker() {
  const doc = useBuilderStore((state) => state.doc);
  const applyDesign = useBuilderStore((state) => state.applyTemplateDesign);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/templates");
      const payload = (await response.json()) as {
        templates?: TemplateItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load templates.");
      }
      setItems(
        (payload.templates ?? []).filter((item) =>
          resumeTemplateDesignSchema.safeParse(item.design).success,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load templates.",
      );
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    const listener = () => void refresh();
    window.addEventListener("mr:templates-changed", listener);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("mr:templates-changed", listener);
    };
  }, [refresh]);

  const apply = (item: TemplateItem) => {
    const parsed = resumeTemplateDesignSchema.safeParse(item.design);
    if (!parsed.success) {
      setMessage("This template is invalid and was not applied.");
      return;
    }
    applyDesign(parsed.data);
    setMessage(`Applied ${item.title}; resume content was preserved.`);
  };

  const saveCurrent = async () => {
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My resume design", doc }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save this design.");
      }
      setMessage("Saved as a private template.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save this design.",
      );
    } finally {
      setBusy(null);
    }
  };

  const changeVisibility = async (
    item: TemplateItem,
    visibility: "private" | "public",
  ) => {
    if (
      visibility === "public" &&
      !window.confirm(
        "Publish this content-free design for other users? Resume text and contact details are never included.",
      )
    ) {
      return;
    }
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/templates/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update template.");
      }
      setMessage(
        visibility === "public"
          ? "Published the content-free design."
          : "Template is private again.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update template.",
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: TemplateItem) => {
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/templates/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete template.");
      setMessage("Template deleted.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete template.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-700">Templates</span>
        <button
          type="button"
          disabled={busy === "save"}
          onClick={saveCurrent}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:border-sky-400 disabled:opacity-40"
        >
          Save current design
        </button>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-zinc-800">
                  {item.title}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                  {item.visibility === "builtin"
                    ? "Built-in"
                    : item.owned
                      ? item.visibility
                      : "Public"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => apply(item)}
                className="rounded bg-sky-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-800"
              >
                Apply
              </button>
            </div>
            {item.owned && (
              <div className="mt-1.5 flex gap-1">
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() =>
                    changeVisibility(
                      item,
                      item.visibility === "public" ? "private" : "public",
                    )
                  }
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 disabled:opacity-40"
                >
                  {item.visibility === "public" ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => remove(item)}
                  className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {message && <p className="mt-1.5 text-[11px] text-zinc-600">{message}</p>}
    </div>
  );
}
