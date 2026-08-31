# How "Auto-fit to one page" works

This file explains, in plain language, how MagicResume squeezes a resume onto a
single page.

---

## 1. The problem

You paste in a resume. It might be too tall to fit on one A4 (or US Letter)
page. Auto-fit's job is to **shrink the content just enough** so it fits, while
keeping the text **readable**.

It does this by turning four "knobs":

| Knob            | What it does                                                | Example           |
| --------------- | ----------------------------------------------------------- | ----------------- |
| **Font size**   | Scales every font (name, headers, body) up or down together | body 10pt → 8.5pt |
| **Line height** | Vertical space between lines                                | 1.25 → 1.1        |
| **Spacing**     | Gaps between sections, entries, bullets, header             | 100% → 55%        |
| **Margins**     | Empty space around the page edges                           | 40pt → 18pt       |

The knobs are chosen so the **relative look** of the resume is preserved — the
name stays bigger than the body, etc. Everything shrinks together.

---

## 2. The limits (why it won't shrink forever)

Auto-fit will **never** break these floors, even if it means the resume still
doesn't fit:

| Setting        | Hard floor | Why                                   |
| -------------- | ---------- | ------------------------------------- |
| Body font size | **8.5pt**  | Below this it's unreadable            |
| Line height    | **1.05**   | Lines start to overlap / look cramped |
| Page margins   | **14pt**   | Content runs off / looks broken       |
| Spacing        | **50%**    | Sections bleed into each other        |

If the resume still doesn't fit _at these floors_, auto-fit honestly reports
"too long" instead of silently destroying readability. The remaining lever is
content reduction (the separate "Make it fit with AI" feature).

---

## 3. The core trick: measure without a browser

Auto-fit needs to know "how tall would this resume be if I set body font to
9.25pt?" — and it needs to try **hundreds** of such questions, instantly.

Rendering the real page to the screen for each attempt would be far too slow.
Instead it uses a **virtual ruler**:

1. `lib/fit/layout.ts` walks through the resume block by block (name → contact →
   summary → sections → entries → bullets) and adds up the heights, exactly the
   same way `lib/render/ResumePage.tsx` lays it out on screen.
2. For each piece of text it asks a **text measurer** how many lines it wraps
   into, given a certain width.

The answer to "does this config fit?" is just: **is the total height ≤ one page
height?** If yes, it fits.

> These two files (`layout.ts` and `ResumePage.tsx`) are kept in lock-step by
> design — the virtual ruler must predict the real renderer perfectly.

---

## 4. The algorithm, step by step

The entry point is `autoFit()` in `lib/fit/engine.ts`. It runs in two phases:

### Phase A — standard floors

Try to fit while staying at "nice" readability (line height 1.1, margins 18pt,
spacing 55%):

1. **Find the biggest font size that fits.** Start large (35% bigger than the
   theme's base) and step **down by 0.25pt** at a time until the virtual ruler
   says "fits." The first size that fits wins. This loop stops at the 8.5pt
   floor.
2. If even 8.5pt doesn't fit, **Phase A fails.**

If Phase A finds a font size, it then makes the resume look as close to the
original as possible by **relaxing the other knobs back up** one at a time,
using binary search each time:

3. Push **line height** back up toward the theme (up to 1.6) while it still fits.
4. Push **spacing** back up toward 100% while it still fits.
5. Push **margins** back up toward the theme while it still fits.

The result is the _largest, most natural-looking_ config that fits.

### Phase B — deep squeeze (only if Phase A failed)

Repeat the same search but with tighter floors (line height 1.05, margins 14pt,
spacing 50%). This is the "last resort" before giving up.

### Give up honestly

If even Phase B fails, it returns the tightest possible config and reports
`overflow` (which the UI shows as "~2 pages" and a dashed line where page 2
starts).

### Binary search helper

The repeated "push X up while it still fits" step uses `bsearchMax(lo, hi)` — a
standard **binary search** that, in ~14 rounds, homes in on the largest value
that still fits. (It works because "does it fit?" is _monotonic_: if a small
value fits and a big value doesn't, everything above a certain point won't fit.)

---

## 5. The technology: `@chenglou/pretext`

Measuring text width is the hard part, and it's done by the package
**`@chenglou/pretext`** (v0.0.8).

### What the app asks it

`lib/fit/measure.ts` wraps it in a `TextMeasurer`:

- `measure(text, font, width, lineHeight)` → "how many lines / how tall?"
- `width(text, font)` → "how wide is this single line?"

### How the package implements it

1. **Canvas measurement.** Pretext gets a hidden canvas
   (`OffscreenCanvas` or `document.createElement("canvas")`) and uses the
   browser's own `ctx.measureText(...)` to get the true pixel width of a string
   in a specific font. This is the same font engine the browser uses to render,
   so the numbers are accurate.

2. **Prepare once, then cheap arithmetic.** The expensive part (asking the
   browser for glyph widths) is done **once per (text + font)** by `prepare()`.
   After that, `layout()` breaks the text into lines using **pure math** — no
   canvas calls. That's why the fit engine can try hundreds of configs per
   keystroke without lag.

3. **Smart line breaking.** It segments text into words/graphemes (using
   `Intl.Segmenter`), handles CJK and emoji widths, and picks break points
   (spaces, hyphens) like a real word processor.

4. **Caching.** Both the app (`lib/fit/measure.ts`) and pretext itself cache
   results keyed by `font + text`, so repeated measurements are free.

> Pretext must run in the browser (it needs a canvas) — it's never imported from
> server code. Tests use a **stub measurer**
> (`lib/fit/stub-measurer.ts`) that approximates character widths, so they can
> run in Node without a DOM.

---

## 6. How it all ties together in the app

1. **Trigger.** `lib/fit/useFitRunner.ts` watches the resume doc and the
   "Auto-fit" checkbox. On any change it waits a short debounce (120ms), then
   runs the engine.
2. **Fonts first.** Before measuring, it calls `ensureFontsLoaded()` which loads
   the heading + body webfonts via `document.fonts.load(...)`. Measuring with a
   fallback font would give wrong numbers.
3. **Run.** It calls `autoFit(doc, measurer)` and stores the result
   (`FitResult`) in the global store.
4. **Pick a config.** `effectiveConfig()` decides what to actually render:
   - Auto-fit ON → use the engine's chosen config.
   - Auto-fit OFF → use the manual slider config.
   - Fallback → the theme's own settings.
5. **Render.** Both the on-screen preview and the print/PDF view render
   `ResumePage` with that single config, so what you see is what you download.

The config the engine returns is just four numbers:

```
sizeScale    — multiply every font size (0.85 = 85%)
lineHeight   — e.g. 1.1
spacingScale — e.g. 0.7 (70% of theme spacing)
marginScale  — e.g. 0.64 (64% of theme margins)
```

Everything else (colors, fonts, ordering) is untouched.
