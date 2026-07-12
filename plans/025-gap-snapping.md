# Plan 025: Gap (equal-spacing) snapping between widgets

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/024-drag-modifiers` @ `1a5f30d`.
> Confirm `src/lib/snap-align.ts` exports `computeSnap(moving, candidates, threshold, lockedAxis?)`
> returning `{ dx, dy, snappedX, snappedY, guides }`, and `src/hooks/use-widget-drag.ts`
> caches `candidates`/`unionStart` refs at first move and calls `moveWidgets(batch)`.
> Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED (hot drag path)
- **Depends on**: plan 024 (branch `advisor/024-drag-modifiers`)
- **Planned at**: 2026-07-12, after user testing feedback: "snap didn't catch between space if multiple"

## Why this matters

Edge/center snapping landed in plan 023, but the third alignment primitive every canvas tool has is missing: snapping into EQUAL SPACING between existing widgets (drag C between A and B and it magnets to the midpoint; drag C to the right of an A-B pair and it magnets to the same gap). tldraw and excalidraw both ship this ("gap snaps"). Semantics to port (from excalidraw `snapping.ts`, MIT, and tldraw's `Gap` type - verified in their sources 2026-07-11):

- A **gap** exists between two candidate rects on an axis when their projections on the PERPENDICULAR axis overlap and there is positive space between them on the primary axis.
- Three snap cases per axis, each accepted only if its offset beats the current best (point snaps included) within the same threshold:
  1. **center-in-gap**: moving bbox center aligns with the gap's center.
  2. **side-right/bottom**: moving bbox placed AFTER the pair, replicating the gap (B.right + gap = moving.left).
  3. **side-left/top**: moving bbox placed BEFORE the pair (moving.right + gap = A.left).
- Guides for a matched gap: line segments drawn inside each equal gap, at the midline of the perpendicular overlap, so the user sees the equal spans.

## Current state (verified excerpts)

`src/lib/snap-align.ts` (from 023/024): pure lib, `Rect`, `GuideLine { axis, position, start, end }`, `SnapResult { dx, dy, snappedX, snappedY, guides }`, `SNAP_THRESHOLD_PX = 8`, `computeSnap(moving, candidates, threshold, lockedAxis?)` picks nearest per-axis edge/center match, second pass builds guides. Tests co-located in `src/lib/snap-align.test.ts` (11 cases).

`src/hooks/use-widget-drag.ts` first-move block caches `candidates.current` (rects of non-dragged widgets, fixed for the drag) and `unionStart.current` (combined bbox); each move calls `computeSnap` and applies `dx/dy` to the batch, guides go to the interaction store, grid rounds unmatched axes.

## Steps

1. **Gap model in the lib** (`src/lib/snap-align.ts`):
   - `interface Gap { start: number; end: number; breadthMin: number; breadthMax: number }` per axis (start/end = facing edges of the pair on the primary axis; breadth = perpendicular overlap range).
   - `computeGaps(candidates: Rect[]): { x: Gap[]; y: Gap[] }` - all pairs whose perpendicular projections overlap and whose facing edges have positive distance. O(n^2) over sheet widgets is fine at this app's scale; do NOT prematurely optimize.
   - Extend `GuideLine` with `kind?: "edge" | "gap"` (default "edge" - existing renderer keeps working).
2. **Gap matching inside `computeSnap`**: accept a new optional param `gaps?: { x: Gap[]; y: Gap[] }`. After point-snap selection per axis, test the three gap cases; a gap match REPLACES the axis result only if its |offset| is strictly smaller than the point match (or there is no point match) and within threshold. Locked axis skips gaps too. Guides for gap matches: for each equal span produced, one `GuideLine` with `kind: "gap"` positioned at the perpendicular-overlap midline, spanning the gap's start/end on the primary axis (2+ lines: the original gap and the replicated one).
3. **Drag hook**: at first move, also cache `gapsRef.current = computeGaps(candidates.current)`; pass into `computeSnap`. No other changes - `moveWidgets` batching and history stay untouched.
4. **Renderer** (`src/components/canvas/snap-guides.tsx`): `kind === "gap"` lines render the same red but thinner span with small perpendicular end-ticks (two 6px-screen ticks at each end; divide by scale like the 1px line thickness). Keep it one memoized component.
5. **Tests** (`src/lib/snap-align.test.ts`): computeGaps finds a gap only with perpendicular overlap; center-in-gap offset math; side-replication math (both directions); gap beats point snap only when strictly closer; lockedAxis skips gaps; guide kind/extents. Minimum 7 new cases.
6. **Runtime verification** (REQUIRED, dev server + browser, record numbers):
   - Place A and B 80px apart on one row; drag C between them: C magnets to equal 
     spacing, gap guides visible in both spans; release lands exact.
   - Drag C to the right of B: magnets to B.right + 80; guides show both equal gaps.
   - Same vertically.
   - Gap + edge snap coexist: y edge-snaps while x gap-snaps in one drag.
   - cmd/ctrl suppresses gap snapping; shift-lock skips gaps on the locked axis.
   - Undo after a gap-snapped drag restores in one step.
7. **Screenshots** for the PR: gap guides with ticks visible mid-drag (horizontal case).

## Gates & conventions

`npm install` first (fresh worktree). `npm run typecheck` clean; `npm run test` = 68 baseline + new, all green. Known pre-existing lint failures ONLY in `theme-toggle.tsx`/`widget-context-menu.tsx`; touched files lint-clean. Double quotes, no semicolons, no em-dash characters anywhere, no AI signatures in commits. Do not push.

## Done criteria

Diff touches only: `src/lib/snap-align.ts`, `src/lib/snap-align.test.ts`, `src/hooks/use-widget-drag.ts`, `src/components/canvas/snap-guides.tsx`, `docs/screenshots/`. All step-6 checks observed and reported with numbers.

## STOP conditions

Drift check fails; gap matching makes drags visibly janky with ~15 widgets; any need to touch the store or history files.

## Out of scope

Gap snapping during resize; distribution across 3+ widgets beyond pairwise replication; viewport culling.
