"use client";

import type {
  ChildEngagement,
  Engagement,
  EngagementKind,
  OrganizationVisibility,
  Section,
} from "@/lib/resume/schema";
import { ENGAGEMENT_KIND_LABELS } from "@/lib/resume/engagements";
import { useBuilderStore } from "@/lib/store";
import { MarkdownEditor } from "./MarkdownEditor";

const inputCls =
  "w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none";
const labelCls = "mb-0.5 block text-[11px] font-medium text-zinc-500";
const engagementKinds = Object.keys(ENGAGEMENT_KIND_LABELS) as EngagementKind[];

function BulletEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <div>
      <label className={labelCls}>
        Accomplishments — one per line; inline **bold**, *italic*, and
        [links](https://…) supported
      </label>
      <textarea
        className={`${inputCls} min-h-20 font-mono text-xs leading-relaxed`}
        value={value.join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n"))}
        placeholder={"**Project X:** Built …\nReduced cost by 30% via …"}
        rows={Math.min(10, Math.max(3, value.length + 1))}
      />
    </div>
  );
}

function PrivacyFields({
  visibility,
  organization,
  confidentialLabel,
  onVisibility,
  onOrganization,
  onConfidentialLabel,
}: {
  visibility: OrganizationVisibility;
  organization: string;
  confidentialLabel: string;
  onVisibility: (value: OrganizationVisibility) => void;
  onOrganization: (value: string) => void;
  onConfidentialLabel: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label className={labelCls}>Organization privacy</label>
        <select
          className={inputCls}
          value={visibility}
          onChange={(event) =>
            onVisibility(event.target.value as OrganizationVisibility)
          }
        >
          <option value="named">Show organization name</option>
          <option value="confidential">Use confidential label</option>
          <option value="omitted">Omit organization</option>
        </select>
      </div>
      {visibility === "named" ? (
        <div>
          <label className={labelCls}>Organization</label>
          <input
            className={inputCls}
            value={organization}
            onChange={(event) => onOrganization(event.target.value)}
            placeholder="Organization or practice"
          />
        </div>
      ) : visibility === "confidential" ? (
        <div>
          <label className={labelCls}>Confidential display label</label>
          <input
            className={inputCls}
            value={confidentialLabel}
            onChange={(event) => onConfidentialLabel(event.target.value)}
            placeholder="Confidential client"
          />
        </div>
      ) : null}
    </>
  );
}

function EngagementEditor({
  sectionId,
  entryId,
  engagement,
  level,
}: {
  sectionId: string;
  entryId: string;
  engagement: Engagement | ChildEngagement;
  level: 0 | 1;
}) {
  const updateEngagement = useBuilderStore((state) => state.updateEngagement);
  const removeEngagement = useBuilderStore((state) => state.removeEngagement);
  const addEngagement = useBuilderStore((state) => state.addEngagement);
  const update = (patch: Partial<Omit<Engagement, "id" | "engagements">>) =>
    updateEngagement(sectionId, entryId, engagement.id, patch);
  const children =
    level === 0 ? ((engagement as Engagement).engagements ?? []) : [];

  return (
    <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
          {level === 0 ? "Engagement" : "Nested engagement"}
        </span>
        <button
          type="button"
          onClick={() => removeEngagement(sectionId, entryId, engagement.id)}
          className="text-xs text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className={labelCls}>Kind</label>
          <select
            className={inputCls}
            value={engagement.kind}
            onChange={(event) =>
              update({ kind: event.target.value as EngagementKind })
            }
          >
            {engagementKinds.map((kind) => (
              <option key={kind} value={kind}>
                {ENGAGEMENT_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Name</label>
          <input
            className={inputCls}
            value={engagement.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="Product, project, site…"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className={labelCls}>Role</label>
          <input
            className={inputCls}
            value={engagement.role}
            onChange={(event) => update({ role: event.target.value })}
            placeholder="Role or responsibility"
          />
        </div>
        <div>
          <label className={labelCls}>Dates</label>
          <input
            className={inputCls}
            value={engagement.dateRange}
            onChange={(event) => update({ dateRange: event.target.value })}
            placeholder="Jan 2022 – Jun 2023"
          />
        </div>
      </div>
      <PrivacyFields
        visibility={engagement.visibility}
        organization={engagement.organization}
        confidentialLabel={engagement.confidentialLabel}
        onVisibility={(visibility) => update({ visibility })}
        onOrganization={(organization) => update({ organization })}
        onConfidentialLabel={(confidentialLabel) =>
          update({ confidentialLabel })
        }
      />
      <div>
        <label className={labelCls}>Location</label>
        <input
          className={inputCls}
          value={engagement.location}
          onChange={(event) => update({ location: event.target.value })}
          placeholder="City, facility, remote…"
        />
      </div>
      <MarkdownEditor
        label="Narrative"
        value={engagement.narrative}
        onChange={(narrative) => update({ narrative })}
        placeholder="Context, scope, and impact. Safe Markdown is supported."
        rows={4}
      />
      <BulletEditor
        value={engagement.bullets}
        onChange={(bullets) => update({ bullets })}
      />
      {level === 0 ? (
        <div className="space-y-2 border-l-2 border-sky-200 pl-2">
          {children.map((child) => (
            <EngagementEditor
              key={child.id}
              sectionId={sectionId}
              entryId={entryId}
              engagement={child}
              level={1}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              addEngagement(sectionId, entryId, "project", engagement.id)
            }
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            + Add nested engagement
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SectionEditor({ section }: { section: Section }) {
  const updateSection = useBuilderStore((state) => state.updateSection);
  const removeSection = useBuilderStore((state) => state.removeSection);
  const moveSection = useBuilderStore((state) => state.moveSection);
  const addEntry = useBuilderStore((state) => state.addEntry);
  const updateEntry = useBuilderStore((state) => state.updateEntry);
  const removeEntry = useBuilderStore((state) => state.removeEntry);
  const addEngagement = useBuilderStore((state) => state.addEngagement);
  const experience = section.type === "experience";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          className={`${inputCls} font-medium`}
          value={section.title}
          onChange={(event) =>
            updateSection(section.id, { title: event.target.value })
          }
        />
        <button
          onClick={() => moveSection(section.id, -1)}
          className="shrink-0 rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => moveSection(section.id, 1)}
          className="shrink-0 rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => removeSection(section.id)}
          className="shrink-0 rounded border border-zinc-300 px-1.5 py-1 text-xs text-red-500 hover:bg-red-50"
          title="Delete section"
        >
          ✕
        </button>
      </div>

      {section.entries.map((entry) => {
        const visibility = entry.organizationVisibility ?? "named";
        return (
          <div
            key={entry.id}
            className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/60 p-2"
          >
            {experience ? (
              <div>
                <label className={labelCls}>Work context</label>
                <select
                  className={inputCls}
                  value={entry.kind ?? "employer"}
                  onChange={(event) =>
                    updateEntry(section.id, entry.id, {
                      kind: event.target.value as EngagementKind,
                    })
                  }
                >
                  {engagementKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {ENGAGEMENT_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelCls}>Heading (role / title)</label>
                <input
                  className={inputCls}
                  value={entry.heading}
                  onChange={(event) =>
                    updateEntry(section.id, entry.id, {
                      heading: event.target.value,
                    })
                  }
                  placeholder="Senior Engineer"
                />
              </div>
              <div>
                <label className={labelCls}>Dates</label>
                <input
                  className={inputCls}
                  value={entry.dateRange}
                  onChange={(event) =>
                    updateEntry(section.id, entry.id, {
                      dateRange: event.target.value,
                    })
                  }
                  placeholder="Jan 2020 – Present"
                />
              </div>
            </div>
            {experience ? (
              <PrivacyFields
                visibility={visibility}
                organization={entry.subheading}
                confidentialLabel={entry.confidentialLabel ?? ""}
                onVisibility={(organizationVisibility) =>
                  updateEntry(section.id, entry.id, { organizationVisibility })
                }
                onOrganization={(subheading) =>
                  updateEntry(section.id, entry.id, { subheading })
                }
                onConfidentialLabel={(confidentialLabel) =>
                  updateEntry(section.id, entry.id, { confidentialLabel })
                }
              />
            ) : (
              <div>
                <label className={labelCls}>Subheading (company / org)</label>
                <input
                  className={inputCls}
                  value={entry.subheading}
                  onChange={(event) =>
                    updateEntry(section.id, entry.id, {
                      subheading: event.target.value,
                    })
                  }
                  placeholder="Acme Corp"
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Location</label>
              <input
                className={inputCls}
                value={entry.location}
                onChange={(event) =>
                  updateEntry(section.id, entry.id, {
                    location: event.target.value,
                  })
                }
                placeholder="City, country or remote"
              />
            </div>
            <MarkdownEditor
              label="Narrative"
              value={entry.narrative ?? ""}
              onChange={(narrative) =>
                updateEntry(section.id, entry.id, { narrative })
              }
              placeholder="Context, scope, and impact. Safe Markdown is supported."
              rows={4}
            />
            <BulletEditor
              value={entry.bullets}
              onChange={(bullets) =>
                updateEntry(section.id, entry.id, { bullets })
              }
            />
            {experience ? (
              <div className="space-y-2 border-t border-zinc-200 pt-2">
                {(entry.engagements ?? []).map((engagement) => (
                  <EngagementEditor
                    key={engagement.id}
                    sectionId={section.id}
                    entryId={entry.id}
                    engagement={engagement}
                    level={0}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => addEngagement(section.id, entry.id, "project")}
                  className="text-xs font-medium text-sky-700 hover:underline"
                >
                  + Add client, project, or other engagement
                </button>
              </div>
            ) : null}
            <div className="flex justify-end">
              <button
                onClick={() => removeEntry(section.id, entry.id)}
                className="text-xs text-red-500 hover:underline"
              >
                Delete entry
              </button>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => addEntry(section.id)}
        className="text-xs font-medium text-sky-700 hover:underline"
      >
        + Add entry
      </button>
    </div>
  );
}
