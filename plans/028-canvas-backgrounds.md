# Plan 028: Canvas backgrounds - color + pattern, global default with per-sheet override, colored sheet tabs

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/027-hard-grid-lock` (stacked
> chain). Confirm: `canvas/index.tsx` paints the grid via two `linear-gradient`s
> sized `gridSize * scale` with `backgroundPosition` offset by pan; `CanvasState`
> has `gridEnabled` (and NO `snapToGrid` - removed by 027); persist version is 5.
> Mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: M | **Risk**: LOW-MED (persist migration)
- **Depends on**: plan 027 branch (chain + persist-version serialization)
- **Planned at**: 2026-07-12. Maintainer decision: BOTH levels - a global default background plus optional per-sheet override, and the sheet tab reflects its override color.

## Why this matters

The canvas background is hardcoded: `bg-background` + a box grid. Users want visual context per sheet (work vs personal), a dotted pattern option, and color choices - table stakes for canvas tools (tldraw/excalidraw both offer canvas background and pattern options).

## Current state (verified excerpts)

`src/components/canvas/index.tsx` (~lines 54-73):
```ts
const spacing = canvasState.gridSize * canvasState.scale
const showGrid = canvasState.gridEnabled && spacing >= 4
const gridStyle = useMemo(() => {
  if (!showGrid) return undefined
  return {
    ...,
    backgroundImage: [
      "linear-gradient(to right, hsl(var(--border) / 0.3) 1px, transparent 1px)",
      "linear-gradient(to bottom, hsl(var(--border) / 0.3) 1px, transparent 1px)",
    ].join(", "),
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${canvasState.offsetX % spacing}px ${canvasState.offsetY % spacing}px`,
  }
}, [...])
```
Container div: `className="h-full overflow-hidden relative bg-background"`.

- `Sheet` type (`src/types/index.ts`): `{ id, title, description?, widgetOrder, createdAt, updatedAt }`.
- Sheet tabs: `src/components/sheets/sheet-sidebar.tsx` - each tab has a per-tab actions dropdown (existing Radix dropdown-menu) and active-tab indicator bars (`bg-primary` divs at lines ~159-162).
- Persisted store: `sheets`, `canvasState`, `themeSettings` etc.; version 5 after 027. Theme: light/dark via `useTheme()` (`resolvedTheme`), tokens are CSS vars (`--background`, `--border`).

## Design

```ts
// src/types/index.ts
export type BackgroundPattern = "grid" | "dots" | "none"
export interface CanvasBackground {
  color: string          // preset id, NOT a raw hex
  pattern: BackgroundPattern
}
```

- Store: `canvasBackground: CanvasBackground` (global default, `{ color: "default", pattern: "grid" }`), action `setCanvasBackground(partial)`. `Sheet.background?: Partial<CanvasBackground>` override, action `setSheetBackground(sheetId, partial | null)` (null clears). Effective value = `{ ...global, ...sheet.background }`. Background changes are NOT undoable (no history entries) - like canvas view state.
- Color presets in `src/lib/backgrounds.ts`: 6 preset ids -> `{ light: string, dark: string }` CSS color pairs (e.g. default (token `--background`), slate, warm sand, forest, ocean, plum - pick tasteful muted values for both themes; the pattern line color stays `--border`-based so it reads on any preset). Export `resolveBackgroundColor(presetId, isDark)`.
- Pattern rendering in `canvas/index.tsx`: `grid` = existing two linear-gradients; `dots` = `radial-gradient(circle, hsl(var(--border) / 0.45) 1px, transparent 1px)` with the same `backgroundSize`/`backgroundPosition` math; `none` = no overlay. `gridEnabled` is SUBSUMED by pattern: migrate `gridEnabled: false` -> effective global pattern `"none"`, then remove `gridEnabled` from `CanvasState`. The `spacing >= 4` guard stays for both patterns.
- Container color: `style={{ backgroundColor: resolveBackgroundColor(effective.color, isDark) }}` replacing the `bg-background` class only when preset != "default".
- UI:
  - Global: a small popover from a new icon button next to the existing controls in `zoom-controls.tsx` - color swatch row + pattern segmented control (grid/dots/none). Reuse existing Radix popover already in deps.
  - Per-sheet: new "Background" item in the sheet tab's existing actions dropdown, opening the same picker targeted at the sheet, plus a "Use default" reset. Extract the picker as a shared component (`src/components/canvas/background-picker.tsx`).
  - Tab tint: when a sheet has a color override, show a small round swatch dot before the title in its tab (color = resolved preset). No dot when inheriting.
- Migration v5 -> v6: add `canvasBackground` default; map `canvasState.gridEnabled === false` to `canvasBackground.pattern = "none"`; strip `gridEnabled`. Sheets: no change needed (`background` optional).

## Steps

1. Types + presets lib (+ unit test for `resolveBackgroundColor` fallback to default on unknown id).
2. Store fields/actions + migration v5->v6 (+ migration test: gridEnabled false -> pattern none; gridEnabled stripped; default injected).
3. Canvas rendering (patterns + color). Check `gridEnabled` consumers first (`grep -rn gridEnabled src/`) and update all (zoom-controls may have a grid toggle - repurpose it to cycle pattern or remove in favor of the picker; report which you found).
4. `background-picker.tsx` + zoom-controls entry (global) + sheet dropdown entry (per-sheet) + tab swatch dot.
5. Tests per steps 1-2; typecheck/lint/test gates.
6. **Runtime verification** (REQUIRED):
   - Global picker: switch to dots - dots render, spacing tracks zoom, pattern scrolls with pan (backgroundPosition math). Switch color - canvas tint changes in light AND dark theme.
   - Per-sheet: override one sheet to ocean+none; switch sheets back and forth - each sheet keeps its own background; overridden sheet's tab shows the swatch dot; "Use default" clears dot and background.
   - Old persisted state with `gridEnabled: false` migrates to pattern "none", no console errors.
   - Reload: global + per-sheet choices survive.
7. **Screenshots** (UI change): dots pattern + a colored sheet vs default sheet with tinted tab visible.

## Gates & conventions

`npm install` first. Typecheck clean; tests green (baseline = 027's count + new). Pre-existing lint failure only in `theme-toggle.tsx`. Double quotes, no semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only: `src/types/index.ts`, `src/lib/backgrounds.ts` (+test), `src/store/index.ts` (+test), `src/components/canvas/index.tsx`, `src/components/canvas/zoom-controls.tsx`, `src/components/canvas/background-picker.tsx` (new), `src/components/sheets/sheet-sidebar.tsx`, `docs/screenshots/`. All step-6 checks reported.

## STOP conditions

Drift check fails; persist version on base is not 5; `gridEnabled` has consumers whose behavior you cannot map; picker requires a new dependency (it must not - Radix popover + existing tokens suffice).

## Out of scope

Custom hex color input; background images; pattern spacing/size settings; per-widget backgrounds (colorTheme already exists).
