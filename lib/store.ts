"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type {
  Contact,
  Engagement,
  EngagementKind,
  Entry,
  LayoutPreset,
  LayoutRegion,
  ResumeDoc,
  Section,
  SectionType,
  ThemeTokens,
} from "@/lib/resume/schema";
import {
  MAX_ENGAGEMENT_CHILDREN,
  MAX_ENGAGEMENTS_PER_ENTRY,
  MAX_ENGAGEMENTS_PER_LEVEL,
} from "@/lib/resume/schema";
import {
  draftCleanInlineMarkdown,
  draftCleanMarkdown,
} from "@/lib/resume/markdown";
import {
  DEFAULT_THEME,
  SECTION_TYPE_TITLES,
  emptyResumeDoc,
  defaultResumeLayout,
  layoutOf,
  newId,
} from "@/lib/resume/defaults";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import { applyResumeDesign } from "@/lib/templates/design";
import type { ResumeTemplateDesign } from "@/lib/templates/schema";
import type { FitResult } from "@/lib/fit/engine";
import type { FitConfig } from "@/lib/fit/types";

export interface BuilderState {
  doc: ResumeDoc;
  autoFit: boolean;
  manual: FitConfig | null;
  fit: FitResult | null;
  compressOpen: boolean;
  atsOpen: boolean;
  artifactKind: "application" | "target";
  targetWatermark: string | null;

  setCompressOpen: (open: boolean) => void;
  setAtsOpen: (open: boolean) => void;

  setFit: (fit: FitResult) => void;
  setAutoFit: (on: boolean) => void;
  setManual: (patch: Partial<FitConfig>) => void;

  setContact: (patch: Partial<Omit<Contact, "links">>) => void;
  addLink: () => void;
  updateLink: (
    id: string,
    patch: Partial<{ label: string; url: string }>,
  ) => void;
  removeLink: (id: string) => void;

  setHeadline: (headline: string) => void;
  setSummary: (summary: string) => void;
  setSummaryTitle: (summaryTitle: string) => void;

  addSection: (type: SectionType) => void;
  updateSection: (id: string, patch: Partial<Pick<Section, "title">>) => void;
  removeSection: (id: string) => void;
  moveSection: (id: string, dir: -1 | 1) => void;

  addEntry: (sectionId: string) => void;
  updateEntry: (
    sectionId: string,
    entryId: string,
    patch: Partial<Entry>,
  ) => void;
  removeEntry: (sectionId: string, entryId: string) => void;
  addEngagement: (
    sectionId: string,
    entryId: string,
    kind: EngagementKind,
    parentEngagementId?: string,
  ) => void;
  updateEngagement: (
    sectionId: string,
    entryId: string,
    engagementId: string,
    patch: Partial<Omit<Engagement, "id" | "engagements">>,
  ) => void;
  removeEngagement: (
    sectionId: string,
    entryId: string,
    engagementId: string,
  ) => void;

  setTheme: (patch: Partial<ThemeTokens>) => void;
  setPageSize: (size: ResumeDoc["page"]["size"]) => void;
  setLayoutPreset: (preset: LayoutPreset) => void;
  setLayoutGaps: (patch: { columnGap?: number; rowGap?: number }) => void;
  updateLayoutRegion: (id: string, patch: Partial<LayoutRegion>) => void;
  setPlacementRegion: (
    kind: "identity" | "contact" | "summary" | "section",
    regionId: string,
    sectionId?: string,
  ) => void;
  applyTemplateDesign: (design: ResumeTemplateDesign) => void;

  loadSample: () => void;
  clearDoc: () => void;
  loadImported: (doc: ResumeDoc) => void;
  /** Application this artifact was generated for, carried through to saving. */
  sourceApplicationId: string | null;
  sourceApplicationTitle: string | null;
  setArtifact: (
    doc: ResumeDoc,
    kind: "application" | "target",
    watermark?: string,
    application?: { id: string; title: string },
  ) => void;
}

export const useBuilderStore = create<BuilderState>()(
  persist(
    immer((set) => ({
      doc: structuredClone(SAMPLE_RESUME),
      autoFit: true,
      manual: null,
      fit: null,
      compressOpen: false,
      atsOpen: false,
      artifactKind: "application",
      targetWatermark: null,
      sourceApplicationId: null,
      sourceApplicationTitle: null,

      setCompressOpen: (open) =>
        set((s) => {
          s.compressOpen = open;
        }),

      setAtsOpen: (open) =>
        set((s) => {
          s.atsOpen = open;
        }),

      setFit: (fit) =>
        set((s) => {
          s.fit = fit;
        }),

      setAutoFit: (on) =>
        set((s) => {
          s.autoFit = on;
          // Hand off from the engine's current answer so sliders start sane.
          if (!on && !s.manual) {
            s.manual = s.fit
              ? { ...s.fit.config }
              : {
                  sizeScale: 1,
                  lineHeight: s.doc.theme.lineHeight,
                  spacingScale: 1,
                  marginScale: 1,
                };
          }
        }),

      setManual: (patch) =>
        set((s) => {
          if (!s.manual) {
            s.manual = s.fit
              ? { ...s.fit.config }
              : {
                  sizeScale: 1,
                  lineHeight: s.doc.theme.lineHeight,
                  spacingScale: 1,
                  marginScale: 1,
                };
          }
          Object.assign(s.manual, patch);
          s.autoFit = false;
        }),

      setContact: (patch) =>
        set((s) => {
          Object.assign(s.doc.contact, patch);
        }),

      addLink: () =>
        set((s) => {
          s.doc.contact.links.push({ id: newId(), label: "", url: "" });
        }),

      updateLink: (id, patch) =>
        set((s) => {
          const link = s.doc.contact.links.find((l) => l.id === id);
          if (link) Object.assign(link, patch);
        }),

      removeLink: (id) =>
        set((s) => {
          s.doc.contact.links = s.doc.contact.links.filter((l) => l.id !== id);
        }),

      setHeadline: (headline) =>
        set((s) => {
          s.doc.headline = headline;
        }),

      setSummary: (summary) =>
        set((s) => {
          s.doc.summary = draftCleanMarkdown(summary);
        }),

      setSummaryTitle: (summaryTitle) =>
        set((s) => {
          s.doc.summaryTitle = summaryTitle;
        }),

      addSection: (type) =>
        set((s) => {
          const sectionId = newId();
          s.doc.sections.push({
            id: sectionId,
            type,
            title: SECTION_TYPE_TITLES[type] ?? "Section",
            entries: [
              {
                id: newId(),
                heading: "",
                subheading: "",
                dateRange: "",
                location: "",
                bullets: [],
              },
            ],
          });
          if (s.doc.layout) {
            const target =
              s.doc.layout.regions.at(-1)?.id ?? s.doc.layout.regions[0]?.id;
            if (target) {
              s.doc.layout.placements.push({
                kind: "section",
                sectionId,
                regionId: target,
                order: Math.min(
                  99,
                  s.doc.layout.placements.filter(
                    (placement) => placement.regionId === target,
                  ).length,
                ),
              });
            }
          }
        }),

      updateSection: (id, patch) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === id);
          if (section) Object.assign(section, patch);
        }),

      removeSection: (id) =>
        set((s) => {
          s.doc.sections = s.doc.sections.filter((sec) => sec.id !== id);
          if (s.doc.layout) {
            s.doc.layout.placements = s.doc.layout.placements.filter(
              (placement) =>
                placement.kind !== "section" || placement.sectionId !== id,
            );
          }
        }),

      moveSection: (id, dir) =>
        set((s) => {
          const i = s.doc.sections.findIndex((sec) => sec.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.doc.sections.length) return;
          const [sec] = s.doc.sections.splice(i, 1);
          s.doc.sections.splice(j, 0, sec);
        }),

      addEntry: (sectionId) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          section?.entries.push({
            id: newId(),
            heading: "",
            subheading: "",
            dateRange: "",
            location: "",
            bullets: [],
          });
        }),

      updateEntry: (sectionId, entryId, patch) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          const entry = section?.entries.find((e) => e.id === entryId);
          if (!entry) return;
          const safePatch = { ...patch };
          if (safePatch.narrative !== undefined) {
            safePatch.narrative = draftCleanMarkdown(safePatch.narrative);
          }
          if (safePatch.bullets !== undefined) {
            safePatch.bullets = safePatch.bullets.map((bullet) =>
              draftCleanInlineMarkdown(bullet),
            );
          }
          Object.assign(entry, safePatch);
          const visibility = entry.organizationVisibility ?? "named";
          if (visibility !== "named") entry.subheading = "";
          if (visibility !== "confidential") {
            entry.confidentialLabel = undefined;
          }
        }),

      removeEntry: (sectionId, entryId) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          if (section) {
            section.entries = section.entries.filter((e) => e.id !== entryId);
          }
        }),

      addEngagement: (sectionId, entryId, kind, parentEngagementId) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          const entry = section?.entries.find(
            (candidate) => candidate.id === entryId,
          );
          if (!entry) return;
          const engagementCount = (entry.engagements ?? []).reduce(
            (count, candidate) =>
              count + 1 + (candidate.engagements?.length ?? 0),
            0,
          );
          if (engagementCount >= MAX_ENGAGEMENTS_PER_ENTRY) return;
          const engagement = {
            id: newId(),
            kind,
            name: "",
            role: "",
            organization: "",
            visibility: "named" as const,
            confidentialLabel: "",
            dateRange: "",
            location: "",
            narrative: "",
            bullets: [],
          };
          entry.engagements ??= [];
          if (parentEngagementId) {
            const parent = entry.engagements.find(
              (candidate) => candidate.id === parentEngagementId,
            );
            if (!parent) return;
            parent.engagements ??= [];
            if (parent.engagements.length >= MAX_ENGAGEMENT_CHILDREN) return;
            parent.engagements.push(engagement);
            return;
          }
          if (entry.engagements.length >= MAX_ENGAGEMENTS_PER_LEVEL) return;
          entry.engagements.push(engagement);
        }),

      updateEngagement: (sectionId, entryId, engagementId, patch) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          const entry = section?.entries.find(
            (candidate) => candidate.id === entryId,
          );
          if (!entry) return;
          const roots = entry.engagements ?? [];
          const engagement =
            roots.find((candidate) => candidate.id === engagementId) ??
            roots
              .flatMap((candidate) => candidate.engagements ?? [])
              .find((candidate) => candidate.id === engagementId);
          if (!engagement) return;
          const safePatch = { ...patch };
          if (safePatch.narrative !== undefined) {
            safePatch.narrative = draftCleanMarkdown(safePatch.narrative);
          }
          if (safePatch.bullets !== undefined) {
            safePatch.bullets = safePatch.bullets.map((bullet) =>
              draftCleanInlineMarkdown(bullet),
            );
          }
          Object.assign(engagement, safePatch);
          if (engagement.visibility !== "named") {
            engagement.organization = "";
          }
          if (engagement.visibility !== "confidential") {
            engagement.confidentialLabel = "";
          }
        }),

      removeEngagement: (sectionId, entryId, engagementId) =>
        set((s) => {
          const section = s.doc.sections.find((sec) => sec.id === sectionId);
          const entry = section?.entries.find(
            (candidate) => candidate.id === entryId,
          );
          if (!entry?.engagements) return;
          const rootIndex = entry.engagements.findIndex(
            (candidate) => candidate.id === engagementId,
          );
          if (rootIndex >= 0) {
            entry.engagements.splice(rootIndex, 1);
            return;
          }
          for (const root of entry.engagements) {
            if (!root.engagements) continue;
            const childIndex = root.engagements.findIndex(
              (candidate) => candidate.id === engagementId,
            );
            if (childIndex >= 0) {
              root.engagements.splice(childIndex, 1);
              return;
            }
          }
        }),

      setTheme: (patch) =>
        set((s) => {
          s.doc.theme = { ...s.doc.theme, ...patch };
        }),

      setPageSize: (size) =>
        set((s) => {
          s.doc.page.size = size;
        }),

      setLayoutPreset: (preset) =>
        set((s) => {
          if (preset === "custom") {
            const current = layoutOf(s.doc as ResumeDoc);
            s.doc.layout = structuredClone(current);
            s.doc.layout.preset = "custom";
          } else {
            s.doc.layout = createLayoutPreset(s.doc as ResumeDoc, preset);
          }
          s.manual = null;
          s.fit = null;
        }),

      setLayoutGaps: (patch) =>
        set((s) => {
          if (!s.doc.layout) {
            s.doc.layout = defaultResumeLayout(s.doc as ResumeDoc);
          }
          if (patch.columnGap !== undefined) {
            s.doc.layout.columnGap = Math.max(0, Math.min(72, patch.columnGap));
          }
          if (patch.rowGap !== undefined) {
            s.doc.layout.rowGap = Math.max(0, Math.min(72, patch.rowGap));
          }
          s.doc.layout.preset = "custom";
        }),

      updateLayoutRegion: (id, patch) =>
        set((s) => {
          if (!s.doc.layout) {
            s.doc.layout = defaultResumeLayout(s.doc as ResumeDoc);
          }
          const region = s.doc.layout.regions.find(
            (candidate) => candidate.id === id,
          );
          if (region) {
            Object.assign(region, patch);
            s.doc.layout.preset = "custom";
          }
        }),

      setPlacementRegion: (kind, regionId, sectionId) =>
        set((s) => {
          if (!s.doc.layout) {
            s.doc.layout = defaultResumeLayout(s.doc as ResumeDoc);
          }
          const placement = s.doc.layout.placements.find(
            (candidate) =>
              candidate.kind === kind &&
              (kind !== "section" || candidate.sectionId === sectionId),
          );
          if (
            placement &&
            s.doc.layout.regions.some((r) => r.id === regionId)
          ) {
            placement.regionId = regionId;
            placement.order = Math.min(
              99,
              s.doc.layout.placements.filter(
                (candidate) =>
                  candidate.regionId === regionId && candidate !== placement,
              ).length,
            );
            s.doc.layout.preset = "custom";
          }
        }),

      applyTemplateDesign: (design) =>
        set((s) => {
          s.doc = applyResumeDesign(s.doc as ResumeDoc, design);
          s.manual = null;
          s.autoFit = true;
          s.fit = null;
        }),

      loadSample: () =>
        set((s) => {
          s.doc = structuredClone(SAMPLE_RESUME);
          s.manual = null;
          s.autoFit = true;
          s.artifactKind = "application";
          s.targetWatermark = null;
          s.sourceApplicationId = null;
          s.sourceApplicationTitle = null;
        }),

      clearDoc: () =>
        set((s) => {
          s.doc = emptyResumeDoc();
          s.manual = null;
          s.artifactKind = "application";
          s.targetWatermark = null;
          s.sourceApplicationId = null;
          s.sourceApplicationTitle = null;
        }),

      loadImported: (doc) =>
        set((s) => {
          s.doc = doc;
          s.manual = null;
          s.autoFit = true;
          s.fit = null;
          s.artifactKind = "application";
          s.targetWatermark = null;
          s.sourceApplicationId = null;
          s.sourceApplicationTitle = null;
        }),

      setArtifact: (doc, kind, watermark, application) =>
        set((s) => {
          s.doc = structuredClone(doc);
          s.manual = null;
          s.autoFit = true;
          s.fit = null;
          s.artifactKind = kind;
          s.targetWatermark =
            kind === "target"
              ? watermark || "ASPIRATIONAL — NOT FOR APPLICATION"
              : null;
          // Only an exportable application resume is worth filing against a JD;
          // a target preview can never be saved.
          s.sourceApplicationId =
            kind === "application" ? (application?.id ?? null) : null;
          s.sourceApplicationTitle =
            kind === "application" ? (application?.title ?? null) : null;
        }),
    })),
    {
      name: "mr-career-draft-v1",
      skipHydration: true,
      partialize: (s) => ({
        doc: s.doc,
        autoFit: s.autoFit,
        manual: s.manual,
        artifactKind: s.artifactKind,
        targetWatermark: s.targetWatermark,
        sourceApplicationId: s.sourceApplicationId,
        sourceApplicationTitle: s.sourceApplicationTitle,
      }),
    },
  ),
);

export { DEFAULT_THEME };
