# Plan 030: Resize handle redesign - 3 styles behind a setting, collapsed-widget fix

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/029-sonner-toasts` (stacked
> chain). Confirm `src/components/widgets/selection-outline.tsx` matches the
> excerpt below (8 dot handles, 28px hit boxes) and that 028's
> `src/components/canvas/background-picker.tsx` popover exists. Mismatch = STOP.

## Status

- **Priority**: P2 (contains a bug fix) | **Effort**: M | **Risk**: LOW-MED
- **Depends on**: plan 029 branch (chain order); plan 028's picker popover (UI host)
- **Planned at**: 2026-07-12. Maintainer decisions: fix the collapsed-widget bug AND ship ALL THREE handle styles behind a user setting.

## Why this matters

Two user reports from live testing:
1. **BUG**: a collapsed widget shows all 8 resize dots. Collapsed widgets have auto height (`base-widget.tsx`: `height: widget.collapsed ? undefined : widget.height`), so n/s and all four corner handles are meaningless there - only east/west (width) resize is valid.
2. The 8-dot look "feels weird and off". Decision: replace with three selectable styles - `corners` (default; Figma-style ring + 4 small corner squares + invisible edge strips), `invisible` (ring only, all zones invisible with cursor feedback), `brackets` (nothing at rest; 4 corner brackets fade in on hover, macOS-screenshot style).

## Current state (verified excerpts)

`src/components/widgets/selection-outline.tsx` (61 lines): a `directions` array of 8 `{ dir, style }` entries (n/s/e/w/ne/nw/se/sw); `ResizeHandle` = 28x28 hit box (`margin: -14`) wired to `useWidgetResize(widgetId, dir)`, rendering a visible `h-3 w-3 rounded-full border-2 border-primary bg-background` dot; `SelectionOutline` = `border-2 border-primary` ring + the 8 handles. Rendered by `base-widget.tsx` only when selected: `{isSelected && <SelectionOutline widgetId={widgetId} />}`.

`src/hooks/use-widget-resize.ts`: `useWidgetResize(widgetId, dir: ResizeDirection)` per-direction pointer handlers - REUSED AS-IS, no changes.

Setting storage: the store's TOP-LEVEL persisted keys shallow-merge with defaults on rehydrate, so a NEW top-level field needs NO migration (unlike nested `canvasState` fields). No settings dialog exists in the app; 028 added an appearance popover (`background-picker.tsx`, opened from `zoom-controls.tsx`) - host the new control there.

## Design

```ts
// src/types/index.ts
export type ResizeHandleStyle = "corners" | "invisible" | "brackets"
```
- Store: top-level `resizeHandleStyle: ResizeHandleStyle` (default `"corners"`), action `setResizeHandleStyle`. Persisted via partialize. No migration (top-level merge covers old states) - verify with a rehydrate test.
- `selection-outline.tsx` rewrite:
  - `SelectionOutline` gains a `collapsed: boolean` prop (passed from `base-widget.tsx`, which already subscribes to the widget).
  - Active zones: `collapsed ? ["e", "w"] : all 8`. This filter applies to ALL three styles - the bug fix.
  - Hit zones replace the 28px dot boxes: edge zones are full-length strips (12px thick, centered on the border, `cursor-{n,s,e,w}-resize`); corner zones are 20x20 squares at the corners (only when not collapsed). Zones themselves render NO visuals.
  - Style variants layered on top (visuals only, `pointer-events-none`):
    - `corners`: 4 small squares (~8px, `rounded-sm border-2 border-primary bg-background shadow-sm`) at the corners. Hidden when collapsed (zones already filtered).
    - `invisible`: nothing.
    - `brackets`: 4 corner brackets (L-shaped, 2px `border-primary`, ~14px arms, rounded outer corner), `opacity-0` at rest, fade in via `group-hover:opacity-100 transition-opacity` (the widget root already has the `group` class - verify, it does per `base-widget.tsx` className) AND always visible while a resize is in progress is NOT required - hover-only is the accepted behavior.
  - The `border-2 border-primary` ring stays in all three styles.
  - Subscribe to `useStore((s) => s.resizeHandleStyle)` INSIDE `SelectionOutline` (only selected widgets mount it - narrow enough).
- UI control: in 028's picker popover, add a "Resize handles" section: 3-option segmented control (Corners / Invisible / Brackets) writing `setResizeHandleStyle`. Reuse the popover's existing section/label styling.

## Steps

1. Type + store field + action + partialize entry (+ test: default present, setter persists, rehydrate of a payload WITHOUT the field falls back to "corners").
2. Rewrite `selection-outline.tsx` per the design (zones + 3 visual variants + collapsed filter). Pass `collapsed` from `base-widget.tsx`.
3. Picker popover section in `background-picker.tsx`.
4. Tests: store test (step 1). Component tests not required (no infra).
5. **Runtime verification** (REQUIRED, record observations + screenshots):
   - Bug fix: collapse a selected widget - NO corner/n/s affordances in any style; e/w strips still resize width; expand - all 8 zones back.
   - `corners` (default): 4 squares visible, edges resize via invisible strips with correct cursors, corners resize diagonally.
   - Switch to `invisible` in the popover: ring only; all zones still work by cursor feel.
   - Switch to `brackets`: nothing at rest; hovering the selected widget fades brackets in; zones work.
   - Setting survives reload; old persisted state (field absent) defaults to corners without errors.
   - Resize behavior itself unchanged: grid-quantized steps, min sizes, undo in one step (spot-check one resize per style).
6. **Screenshots**: one per style on a selected widget + one collapsed-selected widget showing only the e/w affordance behavior (corners style).

## Gates & conventions

`npm install` first. Typecheck clean; tests green (baseline = 029's count + new). Pre-existing lint failure only in `theme-toggle.tsx`. Double quotes, no semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only: `src/types/index.ts`, `src/store/index.ts` (+test), `src/components/widgets/selection-outline.tsx`, `src/components/widgets/base-widget.tsx` (prop only), `src/components/canvas/background-picker.tsx`, `docs/screenshots/`. All step-5 checks reported.

## STOP conditions

Drift check fails; 028's popover missing on the base (report - the control has no host); the `group` class is absent from the widget root (report before improvising hover wiring); resize hit zones conflict with the drag header or widget content clicks (report with element measurements).

## Out of scope

Touch-specific handle sizing; per-widget style overrides; keyboard resize; changing `use-widget-resize.ts`.
