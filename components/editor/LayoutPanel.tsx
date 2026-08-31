"use client";

import { useBuilderStore } from "@/lib/store";
import { layoutOf } from "@/lib/resume/defaults";
import type {
  LayoutPreset,
  LayoutRegion,
} from "@/lib/resume/schema";
import { TemplatePicker } from "./TemplatePicker";

const labelCls = "block text-[11px] font-medium text-zinc-500 mb-0.5";
const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-sky-500 focus:outline-none";

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function LayoutPanel() {
  const doc = useBuilderStore((state) => state.doc);
  const setPreset = useBuilderStore((state) => state.setLayoutPreset);
  const setGaps = useBuilderStore((state) => state.setLayoutGaps);
  const updateRegion = useBuilderStore((state) => state.updateLayoutRegion);
  const setPlacementRegion = useBuilderStore(
    (state) => state.setPlacementRegion,
  );
  const autoFitOn = useBuilderStore((state) => state.autoFit);
  const fit = useBuilderStore((state) => state.fit);
  const layout = layoutOf(doc);

  return (
    <div className="space-y-3">
      <TemplatePicker />
      <div>
        <label className={labelCls}>Layout preset</label>
        <select
          className={inputCls}
          value={layout.preset}
          onChange={(event) =>
            setPreset(event.target.value as LayoutPreset)
          }
        >
          <option value="single">Single column</option>
          <option value="sidebar-left">Left sidebar</option>
          <option value="sidebar-right">Right sidebar</option>
          <option value="two-column">Two columns</option>
          <option value="three-column">Three columns</option>
          <option value="custom">Custom / imported</option>
        </select>
      </div>

      {layout.unsupportedFeatures.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <div className="font-semibold">Manual approximation needed</div>
          <ul className="mt-1 list-disc pl-4">
            {layout.unsupportedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Column gap (pt)"
          value={layout.columnGap}
          min={0}
          max={72}
          onChange={(columnGap) => setGaps({ columnGap })}
        />
        <NumberField
          label="Row gap (pt)"
          value={layout.rowGap}
          min={0}
          max={72}
          onChange={(rowGap) => setGaps({ rowGap })}
        />
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-zinc-700">
          Content flow
        </div>
        <div className="space-y-1.5">
          {layout.placements.map((placement) => {
            if (placement.kind === "rule") return null;
            const placementKind = placement.kind;
            const section =
              placement.kind === "section"
                ? doc.sections.find(
                    (candidate) => candidate.id === placement.sectionId,
                  )
                : undefined;
            const label =
              placement.kind === "section"
                ? section?.title || "Missing section"
                : placement.kind[0].toUpperCase() + placement.kind.slice(1);
            const autoRegionId =
              placement.kind === "section" && placement.sectionId && autoFitOn
                ? fit?.config.placementOverrides?.[placement.sectionId]
                : undefined;
            return (
              <label
                key={`${placement.kind}-${placement.sectionId ?? "core"}`}
                className="grid grid-cols-[1fr_1.2fr] items-center gap-2 text-xs"
              >
                <span className="min-w-0 text-zinc-600">
                  <span className="block truncate">{label}</span>
                  {autoRegionId && autoRegionId !== placement.regionId && (
                    <span className="block truncate text-[10px] font-medium text-sky-700">
                      Auto-fit → {autoRegionId}
                    </span>
                  )}
                </span>
                <select
                  className={inputCls}
                  value={placement.regionId}
                  onChange={(event) =>
                    setPlacementRegion(
                      placementKind,
                      event.target.value,
                      placement.sectionId,
                    )
                  }
                >
                  {layout.regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.id}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        {layout.placements.some((placement) => placement.kind === "rule") && (
          <div className="mt-1 text-[11px] text-zinc-500">
            Imported decorative rules are preserved with their source regions.
          </div>
        )}
        {autoFitOn && fit?.config.contactLayoutOverride === "inline" && (
          <div className="mt-1 text-[11px] font-medium text-sky-700">
            Auto-fit is wrapping contact details horizontally.
          </div>
        )}
      </div>

      <div className="space-y-2">
        {layout.regions.map((region) => (
          <RegionControls
            key={region.id}
            region={region}
            update={(patch) => updateRegion(region.id, patch)}
          />
        ))}
      </div>

      <p className="text-[11px] leading-4 text-zinc-500">
        Region edits preserve content and switch the layout to custom. For the
        standard sidebar and column presets, auto-fit may temporarily rebalance
        whole sections across parallel regions; custom/imported placement stays
        fixed. Turning auto-fit off preserves the arrangement you last saw.
      </p>
    </div>
  );
}

function RegionControls({
  region,
  update,
}: {
  region: LayoutRegion;
  update: (patch: Partial<LayoutRegion>) => void;
}) {
  const paddingX = (region.padding.left + region.padding.right) / 2;
  const paddingY = (region.padding.top + region.padding.bottom) / 2;
  return (
    <details className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5">
      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
        {region.id}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Row"
            value={region.row}
            min={0}
            max={7}
            step={1}
            onChange={(row) => update({ row: Math.round(row) })}
          />
          <NumberField
            label="Column"
            value={region.column}
            min={0}
            max={2}
            step={1}
            onChange={(column) => update({ column: Math.round(column) })}
          />
          <NumberField
            label="Width weight"
            value={region.width}
            min={0.12}
            max={1}
            step={0.01}
            onChange={(width) => update({ width })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Horizontal padding"
            value={paddingX}
            min={0}
            max={72}
            onChange={(value) =>
              update({
                padding: {
                  ...region.padding,
                  left: value,
                  right: value,
                },
              })
            }
          />
          <NumberField
            label="Vertical padding"
            value={paddingY}
            min={0}
            max={72}
            onChange={(value) =>
              update({
                padding: {
                  ...region.padding,
                  top: value,
                  bottom: value,
                },
              })
            }
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ColorField
            label="Background"
            value={region.background ?? "#ffffff"}
            onChange={(background) => update({ background })}
          />
          <ColorField
            label="Text"
            value={region.textColor ?? "#1f2937"}
            onChange={(textColor) => update({ textColor })}
          />
          <ColorField
            label="Headings"
            value={region.headingColor ?? region.textColor ?? "#1f2937"}
            onChange={(headingColor) => update({ headingColor })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Divider</label>
            <select
              className={inputCls}
              value={region.divider?.side ?? "none"}
              onChange={(event) =>
                update({
                  divider:
                    event.target.value === "none"
                      ? undefined
                      : {
                          side: event.target.value as NonNullable<
                            LayoutRegion["divider"]
                          >["side"],
                          color: region.divider?.color ?? "#94a3b8",
                          width: region.divider?.width ?? 1,
                        },
                })
              }
            >
              <option value="none">None</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Entry accent</label>
            <select
              className={inputCls}
              value={region.entryAccent?.side ?? "none"}
              onChange={(event) =>
                update({
                  entryAccent:
                    event.target.value === "none"
                      ? undefined
                      : {
                          side: event.target.value as "left" | "right",
                          color: region.entryAccent?.color ?? "#0f6e99",
                          width: region.entryAccent?.width ?? 2,
                          gap: region.entryAccent?.gap ?? 5,
                        },
                })
              }
            >
              <option value="none">None</option>
              <option value="left">Left bar</option>
              <option value="right">Right bar</option>
            </select>
          </div>
        </div>
      </div>
    </details>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        className={inputCls}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) =>
          onChange(
            Math.max(
              min,
              Math.min(max, numberValue(event.target.value, value)),
            ),
          )
        }
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="color"
        className="h-8 w-full cursor-pointer rounded border border-zinc-300"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
