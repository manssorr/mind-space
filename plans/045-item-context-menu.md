# Plan 045: Item context menu - right-click lifecycle actions, multi-select aware

> **Executor instructions**: step by step; verification binding; STOP hard.
> Update `plans/README.md` row when done. **Executor model: sonnet-class.**
>
> **Drift check (run first)**: base = merged tip of 043 + 044 (+ 036 resume
> DONE - "Move to list" needs the hub-era store; branch
> `advisor/045-item-context-menu`). Confirm:
> `src/components/widgets/widget-context-menu.tsx` exists on Base UI
> (`@base-ui/react/context-menu` v1.6.x) with the body pointer-events lock
> (~39-46) and `blockCanvasGestures` stopPropagation (~81-91); store has
> `setListItemStatus`/`setListItemsStatus` (044), `deleteListItems`/
> `moveListItems` (043), `indentListItem`/`outdentListItem`/`addListItem`
> opts (040); todo widget has `selectedItemIds` (043). Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M-L | **Risk**: MED | **Category**: feature
- **Depends on**: 043 DONE + 044 DONE + 036 resume DONE (hard, for
  "Move to list")
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part D (menu half). Last PRD phase; exposes 044's statuses to humans.

## Why this matters

The full lifecycle (edit, status set, archive, subtask, indent, move across
lists, duplicate, delete) needs a mouse-reachable surface. It must reuse the
Base UI machinery from plan 026 EXACTLY - that plan already paid for three
portal/pointer-event bugs (position-in-transformed-layer, hover leak through
open menu, portal events bubbling to the canvas marquee); re-introducing any
of them fails review.

## Current state

- Exemplar (read fully, copy its patterns):
  `src/components/widgets/widget-context-menu.tsx` - Base UI
  ContextMenu.Root/Trigger/Portal/Positioner/Popup/Item/SubmenuRoot/
  SubmenuTrigger/Separator; body pointer-events lock in a useEffect on
  `open` (saves + sets "none" + restores, ~39-46; Base UI ContextMenu strips
  `modal`, so lock manually); `blockCanvasGestures = e.stopPropagation()`
  bound to `onPointerDown` on BOTH Positioners (~81-91, ~115) - portal
  events bubble through the REACT tree into the canvas marquee without it;
  submenu via `openOnHover` + `side="right"` `alignOffset={-4}`
  `sideOffset={-4}`.
- `useConfirm` (`src/components/ui/confirm-dialog.tsx`) for destructive
  confirms; `toast` from `"sonner"` for feedback if needed.
- Store surface (all one-entry): `setListItemStatus`/`setListItemsStatus`
  (044), `deleteListItems` (043), `moveListItems` (043),
  `indentListItem`/`outdentListItem` (040), `addListItem(listId, text,
  {parentId, afterId})` (040), `lists` map + `createList` (034/036).
- Selection: `selectedItemIds` React state in the todo widget (043); rows
  carry `data-item-id`.
- MISSING store actions this plan adds: `moveItemsToList(ids, targetListId)`
  and `duplicateListItems(ids)` (specs in Step 2).
- Conventions: double quotes, no semicolons, vitest + Playwright.

## Commands

Install/typecheck/tests/e2e/dev - same as plan 042's table.

## Scope

**In scope**: `src/components/widgets/todo-item-menu.tsx` (new),
`src/components/widgets/todo-widget.tsx` (mount menu on rows),
`src/components/widgets/todo-hub-widget.tsx` (same menu on hub rows -
actions are list-agnostic), `src/store/index.ts` (+test: the two new
actions), `tests/e2e/`, `docs/screenshots/`.
**Out of scope**: `widget-context-menu.tsx` (do not refactor the exemplar),
new keyboard bindings (Menu key = native contextmenu), new statuses, hub
filters (037).

## Steps

### Step 1: menu component + wiring

`todo-item-menu.tsx`: Base UI ContextMenu wrapping a row (Trigger = the row
element). Right-clicking a row NOT in the current selection first selects it
alone; right-clicking inside the selection keeps the selection (standard).
Items (multi-aware labels; N = selection size):
- Edit (N=1 only; hidden otherwise) -> enter inline edit
- Status > Mark todo / in progress / done / cancelled -> setListItemsStatus
- Archive (or Unarchive when all selected are archived) -> batch
- Add subtask (N=1) -> addListItem({parentId: id}) + enter edit (042 flow)
- Indent / Outdent (disabled per canIndent/canOutdent across the selection)
- Move to list > submenu of OTHER lists by name (+ "New list..." at the
  bottom -> createList then move); disabled when no other list exists
- Duplicate (with subtree)
- Delete ("Delete N items?" via useConfirm when any selected has children)
Copy the exemplar's pointer-events lock + blockCanvasGestures VERBATIM onto
both Positioners. Also add a hover "..." button on rows (same reveal pattern
as the delete button) opening the same menu anchored at the button; if a
controlled-open anchor fights the contextmenu trigger in Base UI, SKIP the
button and report - right-click + Menu key suffice.
**Verify**: menu opens at the pointer under canvas pan+zoom (repro the 026
transform case: pan, zoom 1.35, menu lands AT the cursor); menu clicks do
NOT start a canvas marquee; nothing behind the open menu reacts to hover.

### Step 2: the two new store actions (+tests)

- `moveItemsToList(ids, targetListId)` - dedupe to topmost selected
  ancestors (043 rule); moved roots get `parentId: null` (cross-list move
  flattens roots to top level; subtree STRUCTURE below each root is
  preserved and every descendant's `listId` updates); orders append at
  target end in visible order; one entry; no-op if target === source list.
- `duplicateListItems(ids)` - dedupe to topmost; deep-copy each root's
  subtree (new ids, same text/status/tags, fresh createdAt, `completedAt`
  carried), inserted directly after the source root among its siblings; one
  entry.
**Verify**: store tests - subtree integrity for both, listId updated on
every descendant, one entry each, undo restores exactly.

### Step 3: hub parity

Mount the same menu on hub rows (actions are item-scoped and list-agnostic;
"Move to list" works from the hub too). Hub has no item selection (043
deferred it) - the menu operates on the single right-clicked row there.
**Verify**: runtime in the hub - status set, move to list, delete w/confirm.

### Step 4: gates + runtime verification + evidence

Typecheck/tests/lint baseline. E2E `tests/e2e/todo-item-menu.spec.ts`: open
menu, set status, move to list (item leaves widget A, appears in B),
duplicate, delete-with-confirm, multi-select "N items" label. Runtime UX
pass per README gates: hover-leak behind open menu (the 026 origin bug),
both themes, transformed-canvas positioning. Screenshots
`docs/screenshots/045-*`. README row + PR mermaid (menu -> store actions).

## Test plan

Store tests per Step 2 (>= 8 cases). E2E per Step 4. Runtime matrix in the
PR body. Catalog test untouched (no new keyboard bindings).

## Done criteria

- [ ] typecheck + tests + e2e green
- [ ] Menu positions correctly under pan+zoom (runtime-proven, the 026 case)
- [ ] No hover leak behind open menu; no marquee from menu clicks (runtime)
- [ ] moveItemsToList/duplicateListItems subtree integrity proven by tests
- [ ] Multi-select labels verified with a 3-item selection
- [ ] Screenshots committed; README row updated

## STOP conditions

- Drift fails; Base UI version differs from the exemplar's API surface.
- The hover "..." trigger fights the contextmenu trigger (skip it, report).
- Cross-list move semantics beyond Step 2's flatten rule turn out to be
  needed (e.g. preserving nesting under a target item) -> report, don't
  invent.

## Maintenance notes

- 037 (tags/filters) will likely add "Tag >" here - keep the item list
  data-driven enough to extend.
- Reviewer: the three 026 bug classes are the checklist; demand the
  transformed-canvas repro + hover-leak check in PR evidence.
- Keyboard navigation inside the menu is Base UI native - verify, don't
  reimplement.
