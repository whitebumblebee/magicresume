"use client";

import { useBuilderStore } from "@/lib/store";
import {
  FONT_OPTIONS,
  entryStyleOf,
  identityStyleOf,
} from "@/lib/resume/defaults";
import { FIT_LIMITS } from "@/lib/fit/engine";
import { defaultFitConfig, type FitConfig } from "@/lib/fit/types";
import type { ThemeTokens } from "@/lib/resume/schema";

const labelCls = "block text-[11px] font-medium text-zinc-500 mb-0.5";
const selectCls =
  "w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none bg-white";

function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>{label}</label>
        <span className="text-[11px] tabular-nums text-zinc-500">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-700 disabled:opacity-40"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function ThemePanel() {
  const theme = useBuilderStore((s) => s.doc.theme);
  const pageSize = useBuilderStore((s) => s.doc.page.size);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const fit = useBuilderStore((s) => s.fit);
  const setTheme = useBuilderStore((s) => s.setTheme);
  const setPageSize = useBuilderStore((s) => s.setPageSize);
  const setAutoFit = useBuilderStore((s) => s.setAutoFit);
  const setManual = useBuilderStore((s) => s.setManual);

  const config: FitConfig =
    (autoFitOn ? fit?.config : null) ??
    manual ??
    fit?.config ??
    defaultFitConfig(theme);

  const bodyPt = theme.sizes.body * config.sizeScale;
  const minMarginXScale =
    FIT_LIMITS.minMarginPt /
    Math.min(theme.margins.left, theme.margins.right);
  const minMarginYScale =
    FIT_LIMITS.minMarginPt /
    Math.min(theme.margins.top, theme.margins.bottom);
  const es = entryStyleOf(theme);
  const identityStyle = identityStyleOf(theme);
  const companyValue = es.subheadingInline
    ? es.subheadingItalic
      ? "inline-italic"
      : "inline"
    : "own";

  const setCompanyStyle = (value: string) =>
    setTheme({
      entryStyle: {
        ...es,
        subheadingInline: value !== "own",
        subheadingItalic: value === "inline-italic",
      },
    });

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2">
        <span className="text-sm font-medium text-sky-900">
          Auto-fit to one page
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-sky-700"
          checked={autoFitOn}
          onChange={(e) => setAutoFit(e.target.checked)}
        />
      </label>

      <Slider
        label="Body font size"
        value={Math.round(bodyPt * 4) / 4}
        min={FIT_LIMITS.minBodyPt}
        max={14}
        step={0.25}
        disabled={autoFitOn}
        format={(v) => `${v.toFixed(2)}pt`}
        onChange={(v) => setManual({ sizeScale: v / theme.sizes.body })}
      />
      <Slider
        label="Line height"
        value={config.lineHeight}
        min={FIT_LIMITS.squeeze.minLineHeight}
        max={FIT_LIMITS.maxLineHeight}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => v.toFixed(2)}
        onChange={(v) => setManual({ lineHeight: v })}
      />
      <Slider
        label="Spacing"
        value={config.spacingScale}
        min={FIT_LIMITS.squeeze.minSpacingScale}
        max={1.2}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ spacingScale: v })}
      />
      <Slider
        label="Horizontal margins"
        value={config.marginXScale ?? config.marginScale}
        min={minMarginXScale}
        max={Math.max(1.1, minMarginXScale)}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) =>
          setManual({
            marginXScale: v,
            marginScale: Math.max(
              v,
              config.marginYScale ?? config.marginScale,
            ),
          })
        }
      />
      <Slider
        label="Vertical margins"
        value={config.marginYScale ?? config.marginScale}
        min={minMarginYScale}
        max={Math.max(1.1, minMarginYScale)}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) =>
          setManual({
            marginYScale: v,
            marginScale: Math.max(
              config.marginXScale ?? config.marginScale,
              v,
            ),
          })
        }
      />
      <Slider
        label="Column ratio fidelity"
        value={config.columnRatioScale ?? 1}
        min={FIT_LIMITS.minColumnRatioScale}
        max={FIT_LIMITS.maxColumnRatioScale}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ columnRatioScale: v })}
      />
      <Slider
        label="Column gaps"
        value={config.columnGapScale ?? 1}
        min={FIT_LIMITS.squeeze.minColumnGapScale}
        max={1.2}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ columnGapScale: v })}
      />
      <Slider
        label="Region horizontal padding"
        value={config.regionPaddingXScale ?? 1}
        min={FIT_LIMITS.squeeze.minRegionPaddingXScale}
        max={1.2}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ regionPaddingXScale: v })}
      />
      <Slider
        label="Region vertical padding"
        value={config.regionPaddingYScale ?? 1}
        min={FIT_LIMITS.squeeze.minRegionPaddingYScale}
        max={1.2}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ regionPaddingYScale: v })}
      />
      <Slider
        label="Inline/date gaps"
        value={config.inlineGapScale ?? 1}
        min={FIT_LIMITS.squeeze.minInlineGapScale}
        max={1.2}
        step={0.01}
        disabled={autoFitOn}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setManual({ inlineGapScale: v })}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Heading font</label>
          <select
            className={selectCls}
            value={theme.fonts.heading}
            onChange={(e) =>
              setTheme({ fonts: { ...theme.fonts, heading: e.target.value } })
            }
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Body font</label>
          <select
            className={selectCls}
            value={theme.fonts.body}
            onChange={(e) =>
              setTheme({ fonts: { ...theme.fonts, body: e.target.value } })
            }
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["primary", "Accent"],
            ["text", "Text"],
            ["muted", "Muted"],
            ["name", "Name"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <input
              type="color"
              className="h-8 w-full cursor-pointer rounded border border-zinc-300"
              value={
                key === "name"
                  ? (theme.colors.name ?? theme.colors.primary)
                  : theme.colors[key]
              }
              onChange={(e) =>
                setTheme({
                  colors: { ...theme.colors, [key]: e.target.value },
                })
              }
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Page size</label>
          <select
            className={selectCls}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as "A4" | "LETTER")}
          >
            <option value="A4">A4</option>
            <option value="LETTER">US Letter</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Bullet glyph</label>
          <select
            className={selectCls}
            value={theme.bulletGlyph}
            onChange={(e) =>
              setTheme({
                bulletGlyph: e.target.value as ThemeTokens["bulletGlyph"],
              })
            }
          >
            <option value="•">• round</option>
            <option value="–">– dash</option>
            <option value="▪">▪ square</option>
            <option value="none">none</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Section header</label>
          <select
            className={selectCls}
            value={theme.sectionHeaderStyle.case}
            onChange={(e) =>
              setTheme({
                sectionHeaderStyle: {
                  ...theme.sectionHeaderStyle,
                  case: e.target.value as ThemeTokens["sectionHeaderStyle"]["case"],
                },
              })
            }
          >
            <option value="upper">UPPERCASE</option>
            <option value="smallcaps">Small caps</option>
            <option value="title">Title case</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Header rule</label>
          <select
            className={selectCls}
            value={theme.sectionHeaderStyle.rule}
            onChange={(e) =>
              setTheme({
                sectionHeaderStyle: {
                  ...theme.sectionHeaderStyle,
                  rule: e.target.value as ThemeTokens["sectionHeaderStyle"]["rule"],
                },
              })
            }
          >
            <option value="bottom">Bottom line</option>
            <option value="none">None</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Header align</label>
          <select
            className={selectCls}
            value={theme.headerAlignment ?? "left"}
            onChange={(e) =>
              setTheme({
                headerAlignment: e.target.value as "left" | "center",
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Centered</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Contact style</label>
          <select
            className={selectCls}
            value={theme.contactStyle ?? "icons"}
            onChange={(e) =>
              setTheme({
                contactStyle: e.target.value as ThemeTokens["contactStyle"],
              })
            }
          >
            <option value="icons">Icons</option>
            <option value="plain">Plain text</option>
            <option value="labeled">Labeled grid</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Contact layout</label>
          <select
            className={selectCls}
            value={theme.contactLayout ?? "inline"}
            onChange={(e) =>
              setTheme({
                contactLayout: e.target.value as ThemeTokens["contactLayout"],
              })
            }
          >
            <option value="inline">Inline</option>
            <option value="stacked">Stacked</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Name layout</label>
          <select
            className={selectCls}
            value={identityStyle.nameLayout}
            onChange={(e) =>
              setTheme({
                identityStyle: {
                  ...identityStyle,
                  nameLayout: e.target.value as "inline" | "stacked",
                },
              })
            }
          >
            <option value="inline">One line</option>
            <option value="stacked">Split first word</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Name accent</label>
          <select
            className={selectCls}
            value={identityStyle.accent}
            onChange={(e) =>
              setTheme({
                identityStyle: {
                  ...identityStyle,
                  accent: e.target.value as "none" | "first-word",
                },
              })
            }
          >
            <option value="none">Single color</option>
            <option value="first-word">Accent first word</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Company line</label>
          <select
            className={selectCls}
            value={companyValue}
            onChange={(e) => setCompanyStyle(e.target.value)}
          >
            <option value="own">Own line, bold</option>
            <option value="inline">Inline with role</option>
            <option value="inline-italic">Inline, italic</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Dates</label>
          <label className="flex h-8 items-center gap-2 rounded border border-zinc-300 px-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-sky-700"
              checked={es.dateItalic}
              onChange={(e) =>
                setTheme({
                  entryStyle: { ...es, dateItalic: e.target.checked },
                })
              }
            />
            Italic
          </label>
        </div>
      </div>
    </div>
  );
}
