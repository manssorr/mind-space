# Plan 022: Marquee multi-select, cmd/ctrl+click toggle, Figma-style pan/zoom remap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first, after Step 0's merge)**: open
> `src/hooks/use-canvas-gestures.ts`, `src/components/widgets/base-widget.tsx`,
> `src/store/index.ts` and compare against the excerpts below. Any unexplained
> mismatch is a STOP condition.

## Status

- **Priority**: P2 (feature)
- **Effort**: M
- **Risk**: MED (changes default empty-canvas drag behavior)
- **Depends on**: branches `advisor/009-persistent-delta-undo-history` (@ `3898c09`) and `advisor/006-canvas-render-perf` (@ `5e57c74`) - Step 0 merges them
- **Category**: feature / interaction
- **Planned at**: 2026-07-11. Decisions confirmed with the maintainer: Figma-style gesture layout (plain drag on empty canvas = marquee; pan via space+drag, middle-click drag, trackpad two-finger scroll; zoom via ctrl/cmd+wheel or pinch); cmd/ctrl+click aliases shift+click selection toggle.

## Why this matters

The store already models multi-select (`selectedWidgetIds: string[]`, shift+click toggles) but there is no way to select several widgets fast, and the only pointer gesture on empty canvas is pan. This plan adds marquee (rubber-band) selection as the default empty-canvas drag, adds cmd/ctrl+click as a selection toggle, and remaps pan/zoom to the layout every mainstream canvas tool uses. It also creates the ephemeral interaction store that plans 023 (snap guides) and 024 build on.

## Current state (verified excerpts)

### Branch topology

- `advisor/009-persistent-delta-undo-history` (@ `3898c09`) = main + 001 tests (vitest, `npm run verify`, 45 tests) + 004 history overhaul + delta-entry history. Its `src/hooks/` has NO `use-canvas-gestures.ts` and its `base-widget.tsx` still subscribes to the full `selectedWidgetIds` array.
- `advisor/006-canvas-render-perf` (@ `5e57c74`) = main + 004 + gesture consolidation (`use-canvas-gestures.ts`) + render-perf work (Canvas subscribes to `widgetOrder` only, `BaseWidget` subscribes to a derived `isSelected` boolean). It does NOT have the delta history or the tests.
- Neither is an ancestor of the other (verified with `git merge-base --is-ancestor`). Both contain the same 004 commits, so the merge surface is: 009's store/history/tests vs 006's components/hooks.

### `src/hooks/use-canvas-gestures.ts` (006 branch, will exist after Step 0)

- `onPointerDown` (lines 31-68): tracks `activePointers` for pinch; if pointerdown is on a `[data-widget]` element and Space is not held, bails. Otherwise calls `deselectAll()` when not on a widget, then starts panning:
  ```ts
  if (!onWidget) {
    deselectAll()
  }
  isPanning.current = true
  lastPointer.current = { x: e.clientX, y: e.clientY }
  e.currentTarget.setPointerCapture(e.pointerId)
  ```
- `onPointerMove` (lines 70-104): pinch-zoom branch, then pan:
  ```ts
  const dx = (e.clientX - lastPointer.current.x) / state.scale
  const dy = (e.clientY - lastPointer.current.y) / state.scale
  setCanvasState({ offsetX: state.offsetX + dx, offsetY: state.offsetY + dy })
  ```
  NOTE the `/ state.scale` - see Step 4's investigation; the canvas transform is `translate(offsetX, offsetY) scale(scale)` with `transformOrigin: "0 0"` (`src/components/canvas/index.tsx`, ~line 85-92 on the 006 branch), which means `offsetX/offsetY` are SCREEN-space pixels. Dividing pointer deltas by scale makes pan lag the cursor at zoom != 1. The wheel-zoom re-anchoring math (lines 166-180) treats offsets as screen px, which is consistent with the transform, not with the pan math.
- Space key handling (lines 145-164): `spaceHeld` ref, cursor `grab`.
- `handleWheel` (lines 166-180): EVERY wheel event zooms (`zoomFactor = Math.exp(-e.deltaY * 0.001)`, clamp `[0.1, 5]`, anchored at cursor). There is currently no wheel-pan at all; "two-finger scroll pans" is false today.

### `src/components/widgets/base-widget.tsx` (009 branch shown; 006 differs - see Step 0)

- `handlePointerDown` (lines 52-68):
  ```ts
  if (e.button === 0) {
    if (e.shiftKey) {
      if (isSelected) {
        removeFromSelection(widgetId)
      } else {
        addToSelection(widgetId)
      }
    } else {
      selectWidget(widgetId)
    }
  }
  e.stopPropagation()
  ```
- On 009 this file computes `isSelected` from a full-array subscription (line 35 `s.selectedWidgetIds`, line 45 `.includes`); on 006 it subscribes to the boolean directly. **Take the 006 version in the merge** and apply this plan's edit to it.

### `src/store/index.ts` (009 branch)

- Selection actions: `selectWidget(id)` -> `[id]`; `addToSelection(id)`; `removeFromSelection(id)`; `deselectAll()`. Plain state updates, no history involvement (selection is not undoable).
- `SelectionBox` type already exists and is unused: `src/types/index.ts:64-69`, `{ x, y, width, height }`.
- Persist: `partialize` excludes undo/redo stacks; persisted `version: 3`. Do not touch persistence in this plan.

### Conventions

- Double quotes, no semicolons, hooks in `src/hooks/`, `"use client"` at top of client files.
- Perf rules from the 006 branch (do not regress): gesture code reads transient state via refs and `useStore.getState()`, never reactive selectors inside pointermove; new per-widget subscriptions must be narrow (booleans, not arrays); do not add subscriptions to `Canvas` for drag-only data.
- Vitest tests live in `src/**/__tests__/` (see the 001-branch tests after the merge for the exemplar pattern; follow their setup style, including `__resetPendingSnapshotForTests()` usage where store history is exercised).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | clean install |
| Full gate | `npm run verify` | typecheck + lint + 45 existing tests pass (before your changes), more after |
| Tests only | `npm run test` | all green |
| Dev server | `npm run dev` | serves on :3000 |

## Steps

### Step 0 - integration branch

1. `git checkout -b advisor/022-multi-select-marquee advisor/009-persistent-delta-undo-history`
2. `git merge advisor/006-canvas-render-perf`
3. Conflict policy:
   - `src/store/index.ts`: take the 009 side wholesale (delta history). 006 made no store changes beyond what 004 already has; if a hunk conflicts, 009 wins.
   - `src/components/widgets/base-widget.tsx`, `src/components/canvas/index.tsx`, `src/hooks/use-canvas-gestures.ts`, `src/components/widgets/canvas-widget.tsx` (if present): take the 006 side (perf work). The 006 `base-widget.tsx` uses `recordSnapshot`-era drag hooks that exist identically on 009 - compatible.
   - Tests (`src/**/__tests__/`, `vitest.config.*`): 009 side (006 has none).
4. `npm install && npm run verify` - MUST pass with all 45 tests before any feature work. If tests fail after a clean-looking merge, STOP.

### Step 1 - ephemeral interaction store

Create `src/store/interaction.ts`:

- A second, tiny zustand store (NOT persisted, NOT in history):
  ```ts
  interface InteractionState {
    marquee: SelectionBox | null
    setMarquee: (box: SelectionBox | null) => void
  }
  ```
- Plain `create<InteractionState>()` - no `persist`, no middleware. Import `SelectionBox` from `@/types`.
- Why a separate store: marquee/guide state changes per pointermove; putting it in the main store would (a) trigger the persist debounce writes and (b) risk widening subscriptions. Plan 023 extends this store with snap-guide state.

Verification: `npm run typecheck` passes.

### Step 2 - cmd/ctrl+click selection toggle

In `base-widget.tsx` `handlePointerDown`, change the modifier condition:

```ts
if (e.shiftKey || e.metaKey || e.ctrlKey) {
  // existing toggle branch
```

- Platform note: on macOS, ctrl+click is delivered as a context-menu / non-primary click by the browser, so in practice cmd is the macOS path and ctrl the Windows/Linux path. Do not add code for that distinction; the condition above covers both.
- Update the callback dep array if lint asks.

Verification: `npm run verify`; runtime check in Step 6.

### Step 3 - marquee select replaces empty-canvas pan

All in `src/hooks/use-canvas-gestures.ts`. Add refs: `isMarqueeing`, `marqueeStartWorld`, `marqueeStartClient`, `initialSelection: string[]`, `marqueeAdditive: boolean`.

1. **pointerdown** (empty canvas, `e.button === 0`, Space NOT held): instead of starting pan:
   - Capture `initialSelection = useStore.getState().selectedWidgetIds` and `marqueeAdditive = e.shiftKey || e.metaKey || e.ctrlKey`.
   - If NOT additive, keep the existing `deselectAll()` call (preserves click-empty-deselects behavior).
   - Compute world coords of the pointer: `const rect = container.getBoundingClientRect(); const wx = (e.clientX - rect.left - state.offsetX) / state.scale; const wy = (e.clientY - rect.top - state.offsetY) / state.scale` - matching the `translate(offset) scale(scale)` transform.
   - Set `isMarqueeing.current = true`, store start points, `setPointerCapture`.
   - Space+drag pan path stays exactly as today (`spaceHeld` -> pan even over widgets).
2. **NEW middle-button pan**: `e.button === 1` on pointerdown (anywhere, including over widgets - check before the `[data-widget]` bail) starts the existing pan path. `e.preventDefault()` to stop autoscroll.
3. **pointermove** while `isMarqueeing`:
   - Convert current pointer to world coords the same way (read `canvasStateRef.current`).
   - Normalize into `SelectionBox` (`x = min(startX, curX)` etc.) and `setMarquee(box)` on the interaction store.
   - Live selection: hit-test all widgets on the current sheet - overlap rule, plain AABB intersection (widgets are unrotated rects):
     ```ts
     const hit = w.x < box.x + box.width && w.x + w.width > box.x &&
                 w.y < box.y + box.height && w.y + w.height > box.y
     ```
     Selected set = `marqueeAdditive ? union(initialSelection, hits) : hits`. Write via a new store action `setSelection(ids: string[])` (add to main store: plain `set({ selectedWidgetIds: ids })`, no history). Skip the write if the id set is unchanged from the current selection (cheap length + every check) to avoid redundant renders.
   - Read widget geometry via `useStore.getState()` inside the handler - no new subscriptions.
4. **pointerup / pointercancel**: `isMarqueeing.current = false; setMarquee(null)`. If total pointer travel < 4px (compare against `marqueeStartClient`), treat as a plain click: selection outcome is whatever pointerdown already did (deselect or nothing when additive) - do not apply a zero-area marquee hit-test.
5. Marquee must NOT start when pinch begins (2 pointers) - the existing `activePointers.size === 2` early-return already precedes this; on `startPinch()` also clear any live marquee (`isMarqueeing = false; setMarquee(null)`).

### Step 4 - fix pan math, remap wheel

1. **Pan math investigation (runtime, do this before editing)**: run the app, zoom to ~200% with ctrl+wheel or zoom buttons, space+drag 100px. If the canvas visibly lags the cursor, the `/ state.scale` in the pan delta is the bug predicted by the transform math. Fix: pan deltas become raw screen deltas:
   ```ts
   setCanvasState({ offsetX: state.offsetX + (e.clientX - lastPointer.current.x), offsetY: state.offsetY + (e.clientY - lastPointer.current.y) })
   ```
   Verify at scale 0.5, 1, 2: content tracks the cursor 1:1 at all three. If the runtime check shows pan already tracks 1:1 at zoom 2 (i.e. the prediction is wrong), STOP and report - do not change the math.
2. **Wheel remap** in `handleWheel`:
   - `e.ctrlKey || e.metaKey` -> existing zoom formula unchanged (trackpad pinch sets `ctrlKey: true` automatically; cmd+wheel gives mouse users precision zoom).
   - Otherwise -> pan: `setCanvasState({ offsetX: state.offsetX - e.deltaX, offsetY: state.offsetY - e.deltaY })` (screen-px offsets per the transform; keep `e.preventDefault()`).
   - Behavior change to note in the PR body: bare mouse-wheel now pans vertically instead of zooming (Figma convention); zoom remains on ctrl/cmd+wheel, pinch, and the zoom buttons.

### Step 5 - marquee rendering

New `src/components/canvas/marquee-overlay.tsx`, rendered by `Canvas` INSIDE the transformed layer (same container as widgets):

```tsx
"use client"
// subscribes only to the interaction store
const marquee = useInteractionStore((s) => s.marquee)
if (!marquee) return null
return (
  <div
    className="absolute border border-primary bg-primary/10 pointer-events-none"
    style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height, zIndex: 99999 }}
  />
)
```

`memo`-wrap it. `Canvas` renders `<MarqueeOverlay />` unconditionally (component itself no-ops when null) so `Canvas` gains no new subscription.

### Step 6 - tests + runtime verification

1. Unit tests (`src/lib/__tests__/` or alongside the existing store tests):
   - Extract the AABB-overlap hit test into `src/lib/geometry.ts` as `rectsIntersect(a: SelectionBox, b: SelectionBox): boolean` and test: overlap, containment, edge-touch (touching edges = NOT intersecting with strict `<`/`>` - assert whichever the implementation picks and document it), disjoint.
   - `setSelection` store test: sets array, replaces prior selection, no undo entry created (undoStack length unchanged).
2. `npm run verify` green.
3. Runtime verification (dev server + browser, REQUIRED before claiming done - record what you saw):
   - Drag on empty canvas draws marquee; widgets intersecting it get selection rings live; release keeps selection.
   - Shift+marquee adds to an existing selection; plain marquee replaces it.
   - Click (no drag) on empty canvas deselects; cmd/ctrl+click and shift+click on widgets toggle membership.
   - Space+drag pans (over widgets too); middle-button drag pans; two-finger scroll pans; pinch and ctrl+wheel zoom at cursor; zoom buttons still work.
   - Pan tracks cursor 1:1 at 50% and 200% zoom.
   - Multi-select then drag one selected widget header: all selected move together (pre-existing behavior in `use-widget-drag.ts` - must still work).
   - Undo/redo unaffected by selection changes (select things, cmd+Z - should undo the last real mutation, not selection).
4. Screenshots for the PR (`docs/screenshots/` on the branch): marquee mid-drag over widgets; multi-selection result.

## Done criteria (machine-checkable)

- `npm run verify` passes; new tests present and green.
- `git diff --stat` touches only: `src/hooks/use-canvas-gestures.ts`, `src/components/widgets/base-widget.tsx`, `src/store/index.ts` (setSelection only), `src/store/interaction.ts` (new), `src/lib/geometry.ts` (new), `src/components/canvas/marquee-overlay.tsx` (new), `src/components/canvas/index.tsx` (mount overlay), tests, `docs/screenshots/`, `plans/README.md`. Anything else = scope violation.
- All runtime checks in Step 6.3 observed and reported.

## Out of scope

- Snap guides (plan 023), alt-duplicate / axis lock (plan 024).
- Touch-screen marquee (single-finger touch on empty canvas may marquee as a side effect - acceptable; two-finger pinch must keep working).
- Selection persistence, selection undo, right-drag gestures, settings UI.

## STOP conditions

- Step 0 merge produces conflicts in files not listed in the conflict policy, or `npm run verify` fails on the merged base.
- Excerpts above materially mismatch the merged code.
- Pan math investigation contradicts the prediction (pan already 1:1 at zoom 2).
- Marquee live-selection causes visible jank with ~20 widgets (would need a different update strategy - report, don't improvise).

## Maintenance notes

- Plans 023/024 stack on this branch and extend `src/store/interaction.ts`.
- The pinch/pan/marquee interplay is the most fragile spot; any future gesture must go through `use-canvas-gestures.ts`, not new listeners elsewhere.
