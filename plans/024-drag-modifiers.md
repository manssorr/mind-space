# Plan 024: Shift axis-lock and alt-drag duplicate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: stacks on `advisor/023-snap-alignment`. Confirm
> `src/lib/snap-align.ts` exists, `use-widget-drag.ts` contains the snap
> integration from plan 023, and the store excerpts below match. Mismatch = STOP.

## Status

- **Priority**: P2 (feature)
- **Effort**: S-M
- **Risk**: MED (undo-history interaction is the delicate part)
- **Depends on**: plans/023-snap-alignment.md (branch `advisor/023-snap-alignment`)
- **Category**: feature / interaction
- **Planned at**: 2026-07-11. Maintainer decision: ONE-WAY alt-duplicate (excalidraw model - once cloned, releasing alt keeps the clone), NOT tldraw's live toggle. Alt is sampled when the drag set resolves (first pointermove); pressing alt later in the drag does nothing (documented simplification).

## Why this matters

Two standard drag modifiers are missing: shift to constrain movement to one axis, and alt/option to drag out a copy. Both live entirely in `use-widget-drag.ts` plus one new store action. The undo requirement: an alt-drag-duplicate must be ONE undo entry (undo removes the clones; originals never moved), which the delta-history model gives us for free if the clone action is sequenced correctly - that sequencing is the core of this plan.

## Current state (verified excerpts)

### History model (`src/store/index.ts`, 009 base)

- Module-level two-phase snapshot:
  ```ts
  let pendingSnapshot: HistoryTrio | null = null
  ```
  `recordSnapshot()` captures the pre-interaction trio into `pendingSnapshot` (store lines ~457-464). The FIRST subsequent mutation that calls `pushHistoryEntry(...)` diffs `pendingSnapshot ?? prevTrio` against the post-mutation state, pushes ONE `HistoryEntry`, and clears `pendingSnapshot` (lines ~90-102).
- `moveWidget(id, x, y)` (lines ~520-536): if `pendingSnapshot` is null -> silent position write, NO history. If pending -> materializes the entry via `pushHistoryEntry`.
- `moveWidgets(moves: {id, x, y}[])` (added by the 023 amendment): batch variant, ONE `set()` for all dragged widgets, same pending-snapshot pattern. The drag hook now builds a batch array per pointermove and calls `moveWidgets` ONCE (this fixed multi-drag undo - only the first mutation after recordSnapshot materializes the entry, so all widgets must change in that one mutation). Your alt-duplicate work must keep this batching intact.
- `duplicateWidgets(sheetId, widgetIds)` (lines ~556-597): clones with `+24 + index*8` offset, `title: \`${original.title} (copy)\``, `zIndex: maxZ + 1 + index`, appends to `widgetOrder`, calls `pushHistoryEntry`. Does NOT change selection and does NOT return the new ids - unusable as-is for alt-drag (offset, rename, no ids back).
- Undo applies the entry's inverse and computes the redo mirror from current state (`applyHistoryEntry` returns `{ restored, mirror }`), so an entry that records "these widgets were added" undoes to "widgets removed" and redoes to "widgets re-added at their CURRENT (post-drag) geometry". This is exactly the one-way alt-duplicate semantics we need - the plan exploits it; do not "fix" it.

### Drag hook first-move block (`src/hooks/use-widget-drag.ts`, after plan 023)

The first pointermove resolves the drag set:
```ts
if (dragIds.current.length === 0) {
  useStore.getState().recordSnapshot()
  const selectedIds = state.selectedWidgetIds
  dragIds.current = selectedIds.includes(widgetId) && selectedIds.length > 1 ? selectedIds : [widgetId]
  // ...captures widgetsStart, and (plan 023) candidates + unionStart refs
}
```
Then computes `dx/dy`, applies snap (plan 023), grid, builds a batch array and calls `moveWidgets(batch)` once per pointermove (023 amendment).

Also from the 023 amendment: `base-widget.tsx` defers modifier-REMOVE from selection to pointerup-without-move (`pendingDeselect` ref), mirroring the existing `pendingCollapse` pattern - so ctrl/cmd+drag keeps the group. Do not disturb either deferred pattern.

### Undo-sequencing chain for alt-duplicate (why the ordering below is correct)

1. `recordSnapshot()` -> `pendingSnapshot` = state WITHOUT clones.
2. Clone action runs and calls `pushHistoryEntry` -> the single entry = "clones added" (diff of pending vs post-clone state); `pendingSnapshot` cleared.
3. All subsequent `moveWidgets` batch calls in this drag see `pendingSnapshot === null` -> silent. Clone positions change freely with no further entries.
4. Undo after drop: removes the clones (originals never moved, nothing else to restore). Redo: re-adds clones at their dropped position (mirror computed at undo time). ONE entry total.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Full gate | `npm run verify` | green |
| Tests | `npm run test` | green |
| Dev | `npm run dev` | :3000 |

## Steps

### Step 1 - store action `duplicateWidgetsAt`

Add to the main store (interface + implementation), modeled on `duplicateWidgets` but:

```ts
duplicateWidgetsAt: (sheetId: string, widgetIds: string[]) => string[]
```

- Clones IN PLACE: same `x`, `y`, `width`, `height`, `data` (deep-copy `data` the same way `duplicateWidgets` does - if it spreads shallowly, keep it consistent), same `title` (NO "(copy)" suffix), `zIndex: maxZ + 1 + index`, new `crypto.randomUUID()` ids.
- Appends new ids to the sheet's `widgetOrder`, bumps `updatedAt`.
- Sets `selectedWidgetIds` to the new ids (the user is now dragging the clones).
- Calls `pushHistoryEntry(state, prevTrio, nextTrio)` exactly like `duplicateWidgets` does - this consumes the pending snapshot per the chain above.
- Returns the new ids. Zustand pattern for actions returning values: compute `newIds` before `set(...)`, call `set` with the update, `return newIds` after (build `newWidgets`/`sheets` outside the `set` callback from `get()` state, or hoist `newIds` out of the callback - match whichever style keeps lint happy; the store's `set` calls are synchronous so both work).

### Step 2 - alt-duplicate in the drag hook

In the first-move block of `handlePointerMove`, AFTER `recordSnapshot()` and after resolving the tentative `dragIds`:

```ts
if (e.altKey) {
  const sheetId = state.currentSheetId
  if (sheetId) {
    const cloneIds = useStore.getState().duplicateWidgetsAt(sheetId, dragIds.current)
    if (cloneIds.length > 0) dragIds.current = cloneIds
  }
}
// then capture widgetsStart (and plan 023's candidates/unionStart) from
// useStore.getState() - AFTER the potential clone, so starts reflect the
// widgets actually being dragged, and the ORIGINALS become snap candidates.
```

Ordering constraints (this is the whole trick - verify against the chain in Current state):
- `recordSnapshot()` FIRST, clone SECOND, `widgetsStart`/`candidates` capture THIRD, the `moveWidgets` batch call LAST.
- Capture `widgetsStart` from fresh `useStore.getState()` (post-clone), not the stale `state` from the top of the handler.
- Plan 023's `candidates` ref must exclude the CLONES but include the ORIGINALS (originals stay put; the dragged clones should snap against them). Since candidates = "sheet widgets not in dragIds" computed post-clone, this falls out naturally - assert it in the runtime check.
- Alt sampled only here. Pressing alt mid-drag after the first move: no effect (dragIds already resolved). Releasing alt after the clone: no effect (one-way). Both documented.

### Step 3 - shift axis lock

In `handlePointerMove`, immediately after computing raw `dx/dy` and before snap:

```ts
let lockedAxis: "x" | "y" | null = null
if (e.shiftKey) {
  lockedAxis = Math.abs(dx) < Math.abs(dy) ? "x" : "y"
  if (lockedAxis === "x") dx = 0
  else dy = 0
}
```

- Re-evaluated every move from cumulative deltas (dominant axis wins; matches excalidraw/tldraw - direction can flip mid-drag if the user changes dominant direction).
- Snap interplay: pass `lockedAxis` so snapping skips the locked axis (extend `computeSnap` with an optional `lockedAxis?: "x" | "y"` param that skips that axis's comparison loop, or zero the result for that axis at the call site - prefer the param, it also suppresses that axis's guides).
- Grid interplay: skip grid rounding on the locked axis too (otherwise `start + 0` gets rounded and the widget creeps sideways on a locked axis if its start position is off-grid). Concretely: treat `lockedAxis === "x"` as `snappedX = true` for the grid gate from plan 023.
- Shift is also the multi-select-click modifier (`base-widget.tsx` pointerdown). No conflict: selection happens on pointerdown, axis lock on pointermove of an active drag. Verify both work in one gesture (shift+click a widget, keep holding, drag = added to selection AND axis-locked).

### Step 4 - tests + runtime verification

1. Store tests (in the existing store test file, using `__resetPendingSnapshotForTests()` in `beforeEach` per the established pattern):
   - `duplicateWidgetsAt`: clones in place (same x/y), no title suffix, selection = new ids, widgetOrder grows, returns ids.
   - Undo chain: `recordSnapshot()` -> `duplicateWidgetsAt(...)` -> several `moveWidget` calls on the clones -> `undoStack` grew by EXACTLY ONE entry; `undo()` removes the clones and leaves originals untouched; `redo()` re-adds clones at their final moved position.
   - Axis-lock math: if extracted to a pure helper, test it; if inline (3 lines), covered by runtime checks only - acceptable.
2. `npm run verify` green.
3. Runtime verification (REQUIRED, record observations):
   - Alt(option)-drag a widget header: original stays, a clone follows the cursor, clone is selected.
   - Drop, then cmd+Z ONCE: clone disappears, original untouched. cmd+shift+Z: clone returns at dropped position.
   - Alt-drag with a multi-selection: all selected widgets clone and move as a group; one undo removes all clones.
   - The dragged clone SNAPS against its own original (guides appear) - confirms candidate handling.
   - Shift-drag: movement constrained to dominant axis; crossing diagonal flips the axis; guides only on the free axis; with grid on, no creep on the locked axis.
   - Shift+click-and-drag in one gesture: widget joins selection, then drag is axis-locked.
   - Plain drag (no modifiers) unchanged; cmd/ctrl still suppresses snap (plan 023) - alt and cmd combos don't interfere.
4. Screenshots for the PR: mid alt-drag (original + clone visible), shift-locked drag with guide.

## Done criteria

- `npm run verify` green; new store tests green.
- Diff touches only: `src/store/index.ts` (one new action + interface line), `src/hooks/use-widget-drag.ts`, `src/lib/snap-align.ts` (lockedAxis param), snap/store test files, `docs/screenshots/`, `plans/README.md`.
- All runtime checks in Step 4.3 observed and reported.

## Out of scope

- tldraw-style live alt toggle (un-clone on alt release), alt sampled after first move, duplicate via drag on resize handles, escape-to-cancel drag, any keyboard-shortcut changes (cmd+D already exists and stays).

## STOP conditions

- Drift check fails (023 deliverables missing / excerpts mismatch).
- The undo-chain store test cannot be made to pass with exactly one entry - the sequencing assumption broke; report the observed stack contents, do not restructure history code.
- `duplicateWidgetsAt` needs to touch `src/lib/history-diff.ts` for any reason - STOP, that file is out of scope.

## Maintenance notes

- If tldraw-style live toggle is wanted later: it needs a "bail to mark" primitive in the history model (drop the materialized entry and restore the trio) - a store-level feature, not a drag-hook hack.
- Any future gesture that mutates widgets mid-drag MUST follow the same sequence: recordSnapshot -> structural mutation (materializes the single entry) -> silent moves.
