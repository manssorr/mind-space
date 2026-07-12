# Plan 023: Snap-to-alignment guides between widgets during drag

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: this plan stacks on `advisor/022-multi-select-marquee`.
> Confirm `src/store/interaction.ts` exists and `src/hooks/use-widget-drag.ts`
> matches the excerpt below. Unexplained mismatch = STOP.

## Status

- **Priority**: P2 (feature)
- **Effort**: M
- **Risk**: MED (touches the hot drag path)
- **Depends on**: plans/022-multi-select-marquee.md (branch `advisor/022-multi-select-marquee`)
- **Category**: feature / interaction
- **Planned at**: 2026-07-11. Maintainer decisions: object snapping ON by default; holding cmd/ctrl during drag disables it (XOR convention used by tldraw and excalidraw). No settings UI in this plan.

## Why this matters

Widgets can only be aligned by eye or by the coarse grid snap. Every canvas tool (Figma, tldraw, excalidraw) snaps a dragged item to the edges/centers of nearby items and shows guide lines. Prior art was researched (2026-07-11): no adoptable open-source package exists - react-moveable owns the pointer pipeline and is unmaintained since 2023-12, interact.js is grid-only and abandoned with an open prototype-pollution report, dnd-kit has no sibling awareness, react-flow paywalls its helper lines. The algorithm is small and well documented (Konva "Objects Snapping" recipe; excalidraw `snapping.ts`, MIT), so we implement it in a pure lib inside our existing drag hook, which keeps full control of store-write timing and undo.

Reference semantics adopted from excalidraw/tldraw (verified in their sources 2026-07-11):
- Threshold is 8 screen px, converted to world units as `8 / scale` - constant feel at any zoom.
- Compare, per axis independently, the dragged bounds' `[left, centerX, right]` (resp. `[top, centerY, bottom]`) against the same three values of every candidate; nearest match within threshold wins; snap is applied as a delta correction to the drag offset.
- Multi-widget drags snap as ONE rigid unit via the combined bounding box.
- Per axis: object snap beats grid snap; grid applies only on an axis where object snap found nothing.
- Guide lines are computed AFTER applying the snap delta (second pass) so drawn lines exactly match final positions.

## Current state (verified excerpts)

### `src/hooks/use-widget-drag.ts` (identical on 009 base; 022 does not modify it)

```ts
const handlePointerMove = useCallback(
  (e: React.PointerEvent) => {
    if (!isDragging.current) return
    const state = useStore.getState()
    if (dragIds.current.length === 0) {
      useStore.getState().recordSnapshot()
      const selectedIds = state.selectedWidgetIds
      dragIds.current =
        selectedIds.includes(widgetId) && selectedIds.length > 1
          ? selectedIds
          : [widgetId]
      for (const id of dragIds.current) {
        const w = state.widgets[id]
        if (w) widgetsStart.current[id] = { x: w.x, y: w.y }
      }
    }
    const dx = (e.clientX - startPos.current.x) / state.canvasState.scale
    const dy = (e.clientY - startPos.current.y) / state.canvasState.scale
    for (const [id, start] of Object.entries(widgetsStart.current)) {
      let newX = start.x + dx
      let newY = start.y + dy
      if (state.canvasState.snapToGrid) {
        const grid = state.canvasState.gridSize
        newX = Math.round(newX / grid) * grid
        newY = Math.round(newY / grid) * grid
      }
      state.moveWidget(id, newX, newY)
    }
  },
  [widgetId]
)
```

`handlePointerUp` only flips `isDragging.current = false`.

### Store / types

- `Widget`: `{ id, type, title, x, y, width, height, zIndex, collapsed, data, colorTheme? }` - world units (`src/types/index.ts:26-38`).
- `CanvasState`: `{ offsetX, offsetY, scale, gridEnabled, snapToGrid, gridSize }` (`src/types/index.ts:49-56`). Persisted inside the main store (persist `version: 3` on this base).
- Current sheet's widget ids: `state.sheets.find(s => s.id === state.currentSheetId)?.widgetOrder`.
- `src/store/interaction.ts` (from plan 022): ephemeral store with `marquee` - extend it here.
- History: `moveWidget` is silent unless a `recordSnapshot()` is pending (see excerpt above; the drag hook already calls it once at drag start). Snapping changes only the numbers passed to `moveWidget` - the history model is untouched.

### Conventions

Double quotes, no semicolons. Pure logic in `src/lib/` with vitest tests in `src/lib/__tests__/` (pattern: `src/lib/__tests__/history-diff.test.ts` from the 009 base). No reactive subscriptions in pointermove paths.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Full gate | `npm run verify` | green before and after |
| Tests | `npm run test` | all green |
| Dev server | `npm run dev` | :3000 |

## Steps

### Step 1 - pure snap lib

Create `src/lib/snap-align.ts`. No React, no store imports.

```ts
export interface Rect { x: number; y: number; width: number; height: number }
export interface GuideLine {
  axis: "x" | "y"        // "x" = vertical line at position (x const), "y" = horizontal
  position: number       // world coordinate on the snapped axis
  start: number          // extent along the other axis (world)
  end: number
}
export interface SnapResult { dx: number; dy: number; guides: GuideLine[] }

export const SNAP_THRESHOLD_PX = 8

export function computeSnap(moving: Rect, candidates: Rect[], threshold: number): SnapResult
```

Algorithm (implement exactly):

1. Edge values of a rect per axis: `xs = [x, x + width / 2, x + width]`, `ys = [y, y + height / 2, y + height]`.
2. For the X axis: for every candidate edge `cx` and every moving edge `mx`, if `abs(cx - mx) < bestDx` where `bestDx` starts at `threshold`, record `dx = cx - mx` and update `bestDx = abs(dx)`. Same independently for Y. Result: at most one `dx` and one `dy` (0 when no match). Ties: first-found at equal distance is fine.
3. Second pass for guides: shift `moving` by `(dx, dy)`. For each axis with a snap (`dx !== 0 || matched at distance 0`), find ALL candidates having an edge within `EPS = 0.5` of the snapped moving edge value; emit one `GuideLine` per distinct edge value, with `start/end` spanning `min/max` over (snapped moving rect ∪ matching candidates) extents on the perpendicular axis.
   - Track "matched" explicitly (boolean per axis), not via `dx !== 0` - an exact overlap gives `dx === 0` but still matched.
4. Return `{ dx, dy, guides }`; `{ dx: 0, dy: 0, guides: [] }` when nothing within threshold.

Keep it under ~120 lines. This mirrors the Konva objects-snapping recipe and excalidraw's per-axis nearest-point selection; gap/distribution snapping is deliberately NOT included (out of scope).

### Step 2 - snap settings flag

Add `snapToObjects: boolean` to `CanvasState` (`src/types/index.ts`), default `true` in `defaultCanvasState` (`src/store/index.ts`).

Persistence: existing users have a persisted `canvasState` WITHOUT this key; zustand's shallow merge would leave it `undefined`. Bump persist `version` 3 -> 4 with a migration that sets `canvasState.snapToObjects = true` when missing (follow the existing v2->v3 migration pattern in `src/store/index.ts`). ALSO read it defensively at the use site as `state.canvasState.snapToObjects !== false`.

### Step 3 - extend interaction store

In `src/store/interaction.ts` add:

```ts
guides: GuideLine[]
setGuides: (guides: GuideLine[]) => void
```

Set to `[]` initially. Import the type from `@/lib/snap-align`.

### Step 4 - integrate into the drag hook

In `src/hooks/use-widget-drag.ts`, inside `handlePointerMove` after computing raw `dx/dy`:

1. On first move (where `dragIds` resolve), also cache in refs: `candidates` = rects of all widgets on the current sheet NOT in `dragIds` (they cannot move mid-drag, cache once), and `unionStart` = combined bounding box of the dragged widgets' start rects (min x/y, max right/bottom - width/height of dragged widgets don't change mid-drag).
2. Each move:
   ```ts
   const snapEnabled = state.canvasState.snapToObjects !== false && !(e.metaKey || e.ctrlKey)
   let snapDx = 0, snapDy = 0
   if (snapEnabled) {
     const movingNow = { ...unionStart.current, x: unionStart.current.x + dx, y: unionStart.current.y + dy }
     const r = computeSnap(movingNow, candidates.current, SNAP_THRESHOLD_PX / state.canvasState.scale)
     snapDx = r.dx; snapDy = r.dy
     setGuides(r.guides)          // interaction store, imported once at module level
   } else {
     setGuides([])                 // skip the write if already empty (cheap guard)
   }
   ```
3. Per-widget position: `newX = start.x + dx + snapDx`, `newY = start.y + dy + snapDy` - the whole set moves rigidly.
4. Grid interplay (replace the existing grid block): round to grid ONLY on an axis where object snap did not match:
   ```ts
   if (state.canvasState.snapToGrid && !(e.metaKey || e.ctrlKey)) {
     if (!snappedX) newX = Math.round(newX / grid) * grid
     if (!snappedY) newY = Math.round(newY / grid) * grid
   }
   ```
   (`snappedX/snappedY` = the per-axis matched booleans; expose them on `SnapResult` if needed - adjust the interface accordingly.) Note cmd/ctrl now also suppresses grid snap (consistent "free drag" modifier, same as excalidraw).
5. `handlePointerUp` and `onPointerCancel`: `setGuides([])` and clear the cached refs.
6. Perf constraints: `computeSnap` is pure math over ~N candidate rects per move - fine for this app's widget counts. No new reactive subscriptions in this hook. `setGuides` writes the ephemeral store only; the only subscriber is the overlay from Step 5.

### Step 5 - guide rendering

New `src/components/canvas/snap-guides.tsx`, mounted by `Canvas` inside the transformed layer (next to `MarqueeOverlay` from plan 022):

```tsx
"use client"
const guides = useInteractionStore((s) => s.guides)
const scale = useStore((s) => s.canvasState.scale)
// per guide: absolutely-positioned div, red, 1 screen px thick:
// axis "x": left: g.position, top: g.start, width: 1/scale, height: g.end - g.start
// axis "y": top: g.position, left: g.start, height: 1/scale, width: g.end - g.start
```

`className="absolute bg-red-500 pointer-events-none"`, high zIndex, `memo`-wrapped. Red per excalidraw's guide color convention; 1/scale keeps 1px on screen at any zoom.

### Step 6 - tests + runtime verification

1. Unit tests `src/lib/__tests__/snap-align.test.ts` (follow `history-diff.test.ts` style), minimum cases:
   - Left-edge to left-edge within threshold snaps; beyond threshold does not.
   - Center-to-center match; right-to-left (adjacency) match.
   - X and Y snap independently in one call.
   - Nearest of two candidates wins.
   - Exact overlap (`dx === 0`) still reports matched + guide.
   - Guide `start/end` spans the union of participating rects.
   - Empty candidates -> zero result.
2. Store migration test: persisted v3 state without `snapToObjects` migrates to `snapToObjects: true` (follow the existing migration tests if present; else add one in the store test file).
3. `npm run verify` green.
4. Runtime verification (REQUIRED, record observations):
   - Drag widget near another's left edge: it snaps and a red vertical line spans both; release keeps snapped position.
   - Center alignment snap works; horizontal (Y) snap works.
   - Holding cmd (mac) / ctrl during drag: no snapping, no guides.
   - Zoom to 50% and 200%: snap engages at the same ~8px SCREEN distance (i.e. the world capture range differs), guides stay 1px thin.
   - Multi-select drag: the group snaps as a unit, no per-widget jitter.
   - With `snapToGrid` enabled (set `useStore.setState({canvasState: {...current, snapToGrid: true}})` in the console if there is no UI): object snap wins on the matched axis, grid rounds the other.
   - Undo after a snapped drag restores the pre-drag position in ONE step (history unaffected).
5. Screenshots for the PR: guide lines visible mid-drag (one vertical, one horizontal case).

## Done criteria

- `npm run verify` green; snap lib tests + migration test present and green.
- Diff touches only: `src/lib/snap-align.ts` (new), `src/lib/__tests__/snap-align.test.ts` (new), `src/store/interaction.ts`, `src/store/index.ts` (flag + migration), `src/types/index.ts` (CanvasState field), `src/hooks/use-widget-drag.ts`, `src/components/canvas/snap-guides.tsx` (new), `src/components/canvas/index.tsx` (mount), store test file, `docs/screenshots/`, `plans/README.md`.
- All runtime checks in Step 6.4 observed and reported.

## Out of scope

- Gap/distribution snapping ("equal spacing" guides), snap during RESIZE (`use-widget-resize.ts` untouched - candidate follow-up), snap while drawing marquee, settings UI toggle for `snapToObjects`, viewport culling of candidates (add only if a sheet ever has hundreds of widgets).

## STOP conditions

- Base branch missing plan 022's deliverables (interaction store, merged 006 gestures).
- `use-widget-drag.ts` differs materially from the excerpt.
- Runtime check shows guides misaligned with final positions by more than 1px at zoom 1 (indicates the two-pass ordering is wrong - report with numbers, don't patch blindly).
- Persist migration conflicts (someone else bumped to v4 already): STOP, needs renumbering.

## Maintenance notes

- Plan 024 passes a `lockedAxis` into this snap path (shift axis-lock) - keep `computeSnap` signature extensible (it already handles per-axis independence; 024 just skips an axis).
- If resize-snapping is added later, reuse `computeSnap` with the resized bounds; only the delta application differs.
- The `!== false` defensive read means the migration is belt-and-braces; do not remove either side.
