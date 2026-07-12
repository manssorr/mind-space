# Plan 036: Todo hub widget - all lists in one place, list management, re-attach (central-lists P3)

> **Executor instructions**: Follow step by step; verification commands binding.
> Reviewer maintains `plans/README.md`. Design source of truth:
> `plans/033-central-lists-design.md`.
>
> **Drift check (run first)**: base branch `advisor/035-todo-ux-rebuild`
> @ `7062a52`. Confirm: `WidgetType` is an enum and `WIDGET_DEFS:
> Record<WidgetType, WidgetDef>` in `src/components/widgets/widget-registry.tsx`
> drives creation + rendering; `TodoRow` is an exported/extractable component
> from the 035 rebuild; store has `lists`/`listItems` + list CRUD +
> `moveListItem`; `TodoWidgetData` view union has `{ source: { listId } }` AND a
> typed-but-unimplemented `{ all: true }`. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: L | **Risk**: MED
- **Depends on**: plan 035 (branch above)
- **Planned at**: 2026-07-12. This is the user's original headline ask: "a
  central place to have all todo lists all around the sheet, maybe cross sheets".

## Why this matters

Lists are now entities that can outlive and span widgets, but there is no way to
SEE them all or manage them. The hub is a widget type whose source is
`{ all: true }`: it lists every list with its items, grouped, with a source
badge showing where each list is placed. It is the payoff of normalization and
the home for list management (create/rename/delete) and re-attaching an orphaned
list to a new todo widget.

## Design (from 033; implement exactly)

- New `WidgetType.TodoHub` (or reuse the todo widget with an `{ all: true }`
  view - DECISION: a distinct widget type, cleaner registry entry + default
  size, and the todo widget stays a single-list view). Add to the enum,
  `WIDGET_DEFS` (label "All Todos", an icon, default size ~320x420,
  `defaultData: { view: { source: { all: true } } }`), and the add-widget menu.
- Hub renders: for each list (sorted by createdAt), a collapsible group header
  (list name, open-count, a source badge) followed by that list's items using
  the SAME `TodoRow` component from 035 (write-through: toggling/editing/
  deleting an item here mutates the one entity, reflected everywhere live).
  Adding an item inside a group uses the same ghost row, scoped to that list.
- **Source badge** per list group: the sheet/widget where the list is shown.
  Compute at render: find a widget whose `data.view.source.listId === list.id`;
  if found, badge = that sheet's title (look up the sheet containing the widget
  in `widgetOrder`); if none, badge = "Unplaced". A list can appear in multiple
  widgets - show the first, or "N places" if >1 (keep simple: first sheet name,
  "+N" suffix if multiple).
- **List management** (hub-only actions): create list (a "+ New list" affordance
  -> creates an empty list, appears as a new group); rename list (click the
  group header name -> inline edit -> `renameList`); delete list (per-group
  action -> confirm dialog "Delete list and its N items?" -> `deleteList`
  cascade, undoable). These are the ONLY places lists are created/deleted by
  name (todo widgets still auto-create a list on add, per 034).
- **Re-attach flow**: when adding a NEW todo widget (the single-list type), the
  add flow offers "New list" (default, current behavior) OR "Existing list"
  picking an unplaced/any list -> the widget's `data.view.source.listId` points
  at the chosen list. Minimal UI: a small popover/select in the add path, or a
  per-list "Add to canvas" action in the hub that spawns a todo widget bound to
  that list on the current sheet. Pick the hub-action approach (simpler, keeps
  the add-widget menu unchanged): each hub group gets an "Place on canvas"
  button -> creates a todo widget on the current sheet whose source is that
  listId, at a grid-legal spawn position.

## Steps

1. UI/UX pre-review (gates): enumerate risks - hub item write-through vs the
   source widget re-rendering, badge lookup cost (O(widgets) per list per
   render - memoize a listId->placement map once per render), collapsible group
   state (per-hub React state, not persisted), delete-list confirm vs undo,
   "Place on canvas" spawn position + grid. Write the list into your report.
2. Enum + registry + add-widget menu entry for the hub. A hub cannot be created
   by the todo auto-create path; it has no backing list of its own.
3. `todo-hub-widget.tsx`: the grouped render using `TodoRow` + a `ListGroup`
   subcomponent. Selectors: subscribe to `lists` (ids+names) and derive a
   listId->items map narrowly; each `TodoRow` subscribes to its own item as in
   035. Placement map computed from `sheets`+`widgets` once per render, memoized.
4. List CRUD affordances + confirm dialog (reuse the existing confirm-dialog
   component). "Place on canvas" action -> new todo widget bound to the list.
5. `store`: no new entity actions expected (034 has list CRUD). If "place on
   canvas" needs a variant of addWidget that takes a preset view, add a thin
   `addTodoWidgetForList(sheetId, listId)` mirroring addWidget - keep history
   one-entry.
6. Tests: placement-map derivation as a pure helper (`src/lib/`, tested:
   list with a widget -> sheet name; no widget -> unplaced; multiple ->
   first + count). "Place on canvas" store action test (creates a widget
   bound to the listId, one undo entry).
7. Runtime verification (dev server, chrome-devtools MCP, real input; record):
   - Add a hub widget -> shows all existing lists with items and source badges
     (place a todo widget on sheet A, its list shows badge "A"; create a list
     in the hub with no widget -> badge "Unplaced").
   - Write-through: check an item in the hub -> the todo widget on the canvas
     reflects it live, and vice versa; one undo reverts from either surface.
   - Create/rename/delete list from the hub (delete asks to confirm, cascades,
     undoes in one step).
   - "Place on canvas" -> a todo widget bound to that list appears on the
     current sheet, on-grid; editing it and the hub stay in sync.
   - Cross-sheet: a list placed on sheet B still shows in the hub on sheet A
     with badge "B".
   - Both themes; UX pass (hover/keyboard, no leaks).
8. Screenshots: hub with multiple lists + badges; unplaced list; delete-confirm;
   a placed-from-hub widget next to the hub showing sync.

## Gates & conventions

`npm install` first. Typecheck clean; tests green (baseline 163 + new helpers).
Lint baseline: theme-toggle.tsx only. Double quotes, no semicolons, no
em-dashes, no AI signatures. Do not push. Include a mermaid (hub -> entities ->
widgets, write-through) in your report for the PR body.

## Done criteria

Diff touches only: `src/types/index.ts` (enum), `src/components/widgets/widget-registry.tsx`,
`src/components/widgets/todo-hub-widget.tsx` (new) + any `ListGroup` split,
`src/components/canvas/add-widget-button.tsx` (menu entry), `src/store/index.ts`
(+test, only if the thin place-on-canvas action is needed), `src/lib/` placement
helper (+test), `docs/screenshots/`. All step-7 checks reported.

## STOP conditions

Drift check fails; write-through requires store/history changes beyond a thin
add action (report); placement-map lookup is O(widgets*lists) hot enough to jank
with many lists (report - then memoize harder).

## Out of scope

Tags/filters (037); saved filtered hub views; drag reorder ACROSS lists;
moving an item between lists; hub as a full-screen route (it is a widget).

---

## RESUME ADDENDUM - 2026-07-12 code review (authoritative for pickup)

Reviewed at branch tip `8b3e1c2` (4 commits on base `7062a52`). Steps 2-6 of
the main plan are substantially done and match the locked design (distinct
`WidgetType.TodoHub`, registry entry, `ListGroup` + `TodoRow` reuse, list CRUD,
confirm-dialog delete, place-on-canvas re-attach). The add-widget menu iterates
`WIDGET_DEFS` (`src/components/canvas/add-widget-button.tsx:87`), so the hub
menu entry exists with zero menu edits - that done-criteria line is satisfied
implicitly. What remains: review fixes R1-R5 below, then main-plan steps 1, 7,
8 (pre-review notes, runtime verification, screenshots) and the PR.

Executor model: **sonnet-class**. Continue on `advisor/036-todo-hub`. Run the
main plan's drift check first, then:

### Step R0: gates baseline

`npm install`, then `npm test` (expect 163 baseline + 7 `list-placement` + 2
store hub tests, all green - record exact count), `npm run typecheck` (clean).
Lint: the only allowed pre-existing error is `theme-toggle.tsx`
(react-hooks/set-state-in-effect). Any other failure = STOP.

### Step R1 (MED): replace hand-rolled place-on-canvas with a thin store action

`placeOnCanvas` in `src/components/widgets/todo-hub-widget.tsx` currently does
`recordSnapshot()` + `addWidget(...)` with a hand-built widget object
(hardcodes 280x240 duplicating the registry Todo `defaultSize`, `zIndex:
Date.now()`, random spawn `100 + Math.random()*100`). The extra
`recordSnapshot()` is harmless (history materializes `pendingSnapshot ??
prevTrio`, `src/store/index.ts:408`, so it is one entry either way) but the
duplication drifts if registry defaults change. Add to the store:
`addTodoWidgetForList(sheetId: string, listId: string, name: string)` - reads
`WIDGET_DEFS[WidgetType.Todo].defaultSize`, quantizes spawn x/y to
`canvasState.gridSize` (deterministic offset preferred over random - e.g.
100,100 plus a small per-call stagger), sets `data: { view: { source: {
listId } } }`, title = list name, exactly ONE history entry (same
`prevTrio -> pushHistoryEntry` pattern as every other action). Component calls
it; delete the local `recordSnapshot`/`addWidget`/`quantize` block and
now-unused imports.
**Verify**: typecheck clean; new store test (R4) passes.

### Step R2 (SMALL): kill the dead drag handle in hub rows

Hub passes `onHandlePointerDown: () => {}` so the handle shows `cursor-grab`
but does nothing. Add `showDragHandle?: boolean` (default `true`) to
`TodoRowProps` in `src/components/widgets/todo-widget.tsx`; when `false`,
render a same-size spacer (`h-6 w-6 shrink-0`) instead of the button so row
geometry stays identical. Hub passes `showDragHandle={false}`.
**Verify**: hub rows show no grab cursor on hover; todo widget rows unchanged.

### Step R3 (MED, perf): stop hub re-render on every widget drag frame

`TodoHubWidget` subscribes to the whole `widgets` + `sheets` maps for the
placement map, so any widget x/y drag re-renders the hub top level per frame
(memo'd children mostly bail, but the arrays rebuild per frame). Fix: add
`placementFingerprint(sheets, widgets): string` to `src/lib/list-placement.ts`
- concatenates, in sheet/widgetOrder order, only what the map depends on
(sheet id, sheet title, each Todo widget's bound listId). Subscribe to that
string; build the map in `useMemo` keyed on it via `useStore.getState()`
inside the memo. Unit-test the fingerprint: unchanged by x/y/zIndex mutation;
changed by retitle, rebind, add/remove.
**Verify**: new tests pass; manual - drag a widget while a hub is visible, no
hub re-renders (React DevTools profiler or a temporary render counter).

### Step R4 (SMALL): retarget the store test at the real path

`src/store/index.test.ts` "hub's place-on-canvas" tests plain `addWidget`.
Point it at `addTodoWidgetForList`: widget on sheet, correct
`data.view.source.listId`, size equals registry default, x/y % gridSize === 0,
exactly 1 undo entry, undo removes the widget while list + items survive.
**Verify**: `npm test` green.

### Step R5 (SMALL, optional): rename-on-create for New list

"New list" calls `createList("New list")` with no follow-up. `createList`
returns the new id - track it and open that group's rename input immediately
(hub-level `renamingListId` state passed down, replacing ListGroup's local
`renaming` init). If this turns invasive, SKIP and report - do not refactor
the store for it.

### Accepted deviations - do NOT "fix" these

- Hub-level `listItems` subscription (vs 035's per-row): accepted at current
  scale; revisit only if a hub with ~500+ items janks.
- Per-group `InlineInput` add row instead of 035's exact ghost-row: accepted.
- `TodoHubWidget` ignores `widgetId` (`void props`): fine, it is a global view.

### Then finish the main plan

Steps 1 (risk notes into PR body), 7 (full runtime verification list - the
UI/UX gates in `plans/README.md` apply: real-input hover, both themes), 8
(screenshots under `docs/screenshots/`). Update the 036 row in
`plans/README.md`, open the PR with the mermaid. Do not push without operator
permission.

### Additional STOP conditions

- `addTodoWidgetForList` cannot produce exactly one history entry without
  touching history internals -> STOP, report.
- Fingerprint approach still re-renders per drag frame (profiler) -> STOP,
  report findings instead of inventing a new subscription model.
