# Plan 043: Item multi-selection - click/shift/cmd, shift+arrows, group drag

> **Executor instructions**: step by step; verification binding; STOP hard.
> Update `plans/README.md` row when done. **Executor model: sonnet-class.**
>
> **Drift check (run first)**: base = tip of plan 042's branch
> (`advisor/043-item-multi-selection` stacked on it). Confirm: todo rows have
> the 042 focus model (`focusedItemId`, row `tabIndex={-1}`,
> `data-item-id`); `src/lib/list-tree.ts` exports `buildVisibleRows` +
> `descendantIds`; store has `moveListItem`/`deleteListItem` (cascade) per
> plan 040. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED | **Category**: feature
- **Depends on**: 042 DONE (hard - reuses focus model). Can run parallel with
  044 (different store + todo-widget regions; land 043 first, 044 rebases -
  expect a small todo-widget.tsx conflict only).
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part E (read it). Mirror the WIDGET selection semantics (plan 022) for
  consistency - the exemplars below are the law.

## Why this matters

Bulk operations (delete, status, indent, move-to-list in 045) need item
multi-selection. The PRD requires it to feel identical to widget selection:
shift = range, cmd = toggle, drag one selected = drag all.

## Current state

- Widget-selection exemplars to MIRROR (read them first):
  - `src/components/widgets/base-widget.tsx:51-90` - pointerdown: modifier
    (`e.shiftKey || e.metaKey || e.ctrlKey`) -> `addToSelection` if not
    selected, else defer removal via `pendingDeselect` ref resolved on
    pointerup ONLY if travel < 4px (click, not drag-start). Plain click on a
    selected widget defers collapse-to-single the same way.
  - Store selection actions (`src/store/index.ts:1149-1174`): plain `set`,
    NO history entries - `selectWidget`, `addToSelection`,
    `removeFromSelection`, `deselectAll`, `setSelection`.
- Item selection is EPHEMERAL per-widget UI state (PRD): React state in the
  todo widget - `selectedItemIds: Set<string>` + `selectionAnchorId` - NOT
  the store, NOT persisted, NOT undoable (matches the marquee/guides
  precedent documented in `src/store/interaction.ts:12-14`).
- 042 provides: `focusedItemId`, row keydown dispatch, catalog rows,
  `buildVisibleRows` ordering.
- Drag reorder (039/040): handle pointerdown -> dragState -> drop via
  `neighborsForDrop` -> `moveListItem`. Batch precedent for one-entry
  multi-mutations: `moveWidgets` (plan 023's atomic batch action).
- Conventions: double quotes, no semicolons, vitest + Playwright (038).

## Commands

Install/typecheck/tests/e2e/dev - same as plan 042's table.

## Scope

**In scope**: `src/components/widgets/todo-widget.tsx`,
`src/store/index.ts` (+test: batch actions ONLY - `moveListItems`,
`deleteListItems`), `src/lib/list-tree.ts` (+test: pure range helper),
`src/lib/shortcuts.ts` (catalog rows), `tests/e2e/`, `docs/screenshots/`.
**Out of scope**: hub selection (follow-up), context menu (045), status
actions (044), marquee-over-items (not in PRD), widget selection code.

## Steps

### Step 1: selection state + click semantics

Per-widget `selectedItemIds: Set<string>` + `selectionAnchorId`. On row
pointerdown (row/text area, NOT the drag handle or buttons): plain click =
select only this row (defer collapse if already multi-selected, 4px
pointerup rule - copy base-widget's `pendingDeselect` pattern); cmd/ctrl
click = toggle (anchor moves); shift+click = range from anchor over
`buildVisibleRows` order (pure helper `visibleRangeIds(rows, anchorId,
targetId)` in list-tree.ts, unit-tested). Selected rows get a selection
background consistent with the widget selection ring color family, both
themes; selection clears on click in empty widget space.
**Verify**: helper unit tests; runtime click matrix.

### Step 2: keyboard extension

Catalog + dispatch (041 rules): Shift+ArrowUp/Down = extend selection by
focus movement (focus moves, anchor stays); Cmd/Ctrl+A (item scope, row
focused) = select all items in THIS list; Escape (item scope) = clear
selection then blur row; Delete/Backspace with multi-selection = ONE confirm
("Delete N items?" via `useConfirm`, only when any has children) -> batch
delete. **Verify**: catalog uniqueness green; e2e keyboard spec.

### Step 3: batch store actions (one history entry each)

- `deleteListItems(ids: string[])` - union of ids + all `descendantIds`,
  single `prevTrio -> pushHistoryEntry`.
- `moveListItems(ids: string[], beforeId, afterId)` - move selected ids
  (visible order preserved; subtree rule: a selected child of a selected
  parent is NOT double-moved - dedupe to topmost selected ancestors) as a
  contiguous block into the slot; single entry. Model on `moveWidgets`.
**Verify**: store tests - one entry each, undo restores exact prior orders +
parents; parent+child dedupe case.

### Step 4: group drag

Dragging the handle of a SELECTED row drags the whole selection (block
insert via `moveListItems`); the 039 ghost shows an "N items" pill when
N > 1. Dragging an UNSELECTED row's handle drags just it (selection
collapses to it on pointerup-without-drag, consistent with Step 1).
**Verify**: runtime - select 3 spanning different parents, drag to a new
slot: block lands in visible order, ONE undo restores everything.

### Step 5: gates + evidence

Typecheck/tests/lint baseline; e2e `tests/e2e/todo-selection.spec.ts`
(range, toggle, shift+arrows, batch delete single-undo, group drag); runtime
UX pass per README gates both themes; screenshots `docs/screenshots/043-*`;
README row.

## Test plan

Unit: `visibleRangeIds` (in-order, reversed, collapsed-subtree skip). Store:
Step 3 list (>= 6 cases). E2E: Step 5 spec. Runtime matrix in PR body.

## Done criteria

- [ ] typecheck + tests + e2e green
- [ ] Selection is React state only (`grep -n "selectedItemIds" src/store/index.ts` -> no hits)
- [ ] Batch delete/move = exactly one history entry each (tests)
- [ ] Click/shift/cmd/shift+arrow semantics match widget selection (runtime matrix in PR)
- [ ] Group drag runtime-verified; screenshots committed

## STOP conditions

- Drift fails; 042 focus model missing pieces (report, don't rebuild it).
- Block-move semantics for non-contiguous cross-parent selections turn
  ambiguous beyond the Step 3 dedupe rule -> STOP, present 2 options with
  examples instead of choosing silently.

## Maintenance notes

- 045's context menu consumes `selectedItemIds` + the batch actions - keep
  them reachable from the row component.
- Hub multi-select deferred; reuse `visibleRangeIds` when it lands.
- Reviewer: the parent+child double-move dedupe is the classic bug here -
  demand the test.
