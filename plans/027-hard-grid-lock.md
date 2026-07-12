# Plan 027: Hard grid lock - all widget geometry quantized to the grid

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/026-context-menu-base-ui`
> (stacked chain). Confirm: `use-widget-drag.ts` grid block gates on
> `state.canvasState.snapToGrid && !(e.metaKey || e.ctrlKey)` with `snappedX/snappedY`
> axis skips; `use-widget-resize.ts` has its own snap-to-grid rounding;
> `zoom-controls.tsx` has a snap-to-grid toggle button; persist version is 4.
> Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED (persist migration + touches every geometry write)
- **Depends on**: plan 026 branch (chain); persist-version serialization with it
- **Planned at**: 2026-07-12. Maintainer decision: HARD lock - no mid-grid-cell positions or sizes, ever; snapToGrid toggle removed; cmd/ctrl keeps bypassing OBJECT snap only, never the grid.

## Why this matters

User testing found the seed widgets sit off-grid (x/y = 150 with gridSize 20 - mid-cell), and free-form positioning lets everything drift off the visible grid. Decision: this is a widget dashboard, not a drawing tool - geometry is always grid-quantized. Benefits: everything aligns by construction, object/gap snapping always produces on-grid results, the "snap to grid" toggle disappears as a concept.

## Current state (verified excerpts)

- Grid: `canvasState.gridSize` default 20; `gridEnabled` controls the painted grid; `snapToGrid` controls quantization during drag/resize only.
- `src/store/index.ts` seeds (initializeDefaultState): Note at `x: 150, y: 150, width: 320, height: 280`; second widget `x: 530, y: 150, width: 300...` - 150 and 530 are NOT multiples of 20.
- `src/components/canvas/add-widget-button.tsx`: new widgets at `x/y = 100 + Math.random() * 100` (usually off-grid), sizes 280x240/340.
- `src/store/index.ts`: `duplicateWidgets` offsets `+24 + index * 8` (off-grid); `pasteWidgets` offsets `24 + index * 4` (off-grid); `duplicateWidgetsAt` clones in place (inherits alignment); `moveWidget`/`moveWidgets`/`resizeWidget` write raw values.
- `src/hooks/use-widget-drag.ts`: grid rounding only when `snapToGrid` on and no cmd/ctrl, per-axis skipped when object/gap snap matched or axis locked.
- `src/hooks/use-widget-resize.ts`: `MIN_WIDTH = 120, MIN_HEIGHT = 80` (both grid multiples); rounds position+size only when `snapToGrid`.
- `src/components/canvas/zoom-controls.tsx:85,122,124`: the snap-to-grid toggle button.
- Persist: version 4 (023 added `snapToObjects` via `migratePersistedState`, exported from `src/store/index.ts`). Persisted `canvasState` includes `snapToGrid`.

## Steps

1. **Quantize helper** in `src/lib/geometry.ts`:
   ```ts
   export function quantize(value: number, grid: number): number {
     return Math.round(value / grid) * grid
   }
   ```
2. **Store enforcement** (single choke points, so no caller can write off-grid):
   - `moveWidget`, `moveWidgets`, `resizeWidget`: quantize x/y (and width/height, clamped to mins AFTER quantizing) using `state.canvasState.gridSize` before writing.
   - `duplicateWidgets` offset `+24 + index*8` -> `+grid + index*grid` (grid = gridSize); `pasteWidgets` offset likewise `grid * (1 + index)`- keep the stagger, make it grid-sized.
   - `addWidget`/creation path (`add-widget-button.tsx`): quantize the random spawn position.
   - Seeds: change literals to grid multiples (150 -> 160, 530 -> 540, y 150 -> 160; keep sizes, they're already multiples; also the third seed widget - check and fix all).
3. **Drag hook**: grid rounding becomes UNCONDITIONAL (drop the `snapToGrid` read and the cmd/ctrl grid bypass; keep the per-axis skip when object/gap snapped or locked - those results are grid-aligned by construction post-migration). cmd/ctrl continues to suppress object/gap snap only.
4. **Resize hook**: rounding unconditional; min-clamp after rounding (existing order already does this - verify).
5. **Remove the toggle**: delete the snap-to-grid button from `zoom-controls.tsx`; remove `snapToGrid` from `CanvasState` type and `defaultCanvasState`.
6. **Migration v4 -> v5** in `migratePersistedState`: quantize every persisted widget's `x/y/width/height` (width >= 120, height >= 80 after rounding); delete `canvasState.snapToGrid` key. Follow the existing v3->v4 pattern; add a migration test (off-grid widget in, on-grid out; snapToGrid key stripped).
7. **Tests**: store tests - moveWidgets/resizeWidget quantize raw inputs; duplicate/paste offsets grid-aligned; migration test above.
8. **Runtime verification** (REQUIRED, record numbers):
   - Fresh profile: seed widgets land on multiples of 20, visually flush with the painted grid lines.
   - Drag anywhere (with and WITHOUT cmd held): drop position always multiples of 20.
   - Resize from corner and from n/w edges: sizes and positions step by 20; min sizes respected.
   - Add widget, duplicate (cmd+D), alt-drag clone, paste: all land on-grid.
   - Seed an OLD persisted state (localStorage version 4 with x:150) and reload: widget migrated to 160, no console errors, undo stack intact.
   - Snap toggle button gone from zoom controls; object snap + guides still work (drag near another widget - guides appear, result on-grid).
9. **Screenshots**: widgets flush on grid lines (before/after migration pair if convenient).

## Gates & conventions

`npm install` first. Typecheck clean; tests all green (baseline = 026's count + new). Known pre-existing lint failure only in `theme-toggle.tsx` (026 fixed the other); touched files lint-clean. Double quotes, no semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only: `src/lib/geometry.ts` (+test), `src/store/index.ts` (+test), `src/hooks/use-widget-drag.ts`, `src/hooks/use-widget-resize.ts`, `src/components/canvas/add-widget-button.tsx`, `src/components/canvas/zoom-controls.tsx`, `src/types/index.ts`, `docs/screenshots/`. Every geometry write path demonstrably quantized (step 8).

## STOP conditions

Drift check fails; persist version on the base is not 4 (someone else bumped - renumber, report); removing `snapToGrid` breaks a consumer you can't identify; object-snap results land off-grid after migration (indicates an unquantized candidate leaked - report, don't hack).

## Out of scope

Changing `gridSize` (stays 20) or exposing it in UI; sub-grid nudge via arrow keys; free-position escape hatch (decision: none exists).
