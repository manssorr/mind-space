# Design 033: Central lists - items as entities, widgets as views, cross-sheet hub, tags

Status: DESIGN APPROVED 2026-07-12 (maintainer decisions locked below). Executable
plans: 034 (P1 normalize), 035 (P2 todo widget UX rebuild), 036 (P3 hub), 037 (P4
tags/filters). This document is the shared context those plans reference - they
must stay self-contained, but this is the source of truth for intent.

## Problem

Todo items live inside `widget.data.items` - anonymous JSON owned by one widget
on one sheet. Consequences: no cross-sheet visibility, no "all my todos" view, a
list dies with its widget, no tags, no reorder (no order field), no showing the
same list in two places. The user wants: a central place for all todo lists
across sheets, widgets that can display any list (or a filtered slice), tags.

## Prior art (researched 2026-07-12, full reports in session transcripts)

Every mature system splits ENTITY STORE from VIEWS:
- Notion: data sources hold rows; views are per-embed settings (filter/sort)
  over shared sources; edits anywhere write through. View CONFIG is local,
  DATA is shared - we adopt exactly this.
- Linear: issues normalized from day one; teams/projects are reference fields;
  saved views came cheap because of early normalization.
- Trello: the cautionary tale - cards nested in lists in boards (like our
  widgets), cross-board aggregation later bolted on as a paid power-up.
- Things 3: ships ZERO user-defined queries (tags + 4 fixed smart views) and is
  beloved - MVP restraint benchmark.
- Todoist: project (single owner) + label (flat many-to-many) + date carry 90%
  of usage; filter grammar is a power feature, not core.

## Decisions (maintainer, 2026-07-12)

1. Todo add UX: persistent ghost "+ Add task" row at list bottom; Enter commits
   and keeps focus in a fresh row (chain capture); Escape/blur-empty closes.
2. Completion: strikethrough, stays in place ~1s, then slides into a collapsed
   "Completed (N)" section at the bottom. No separate archive.
3. Widget delete = VIEW delete only. Lists and items survive, visible in the
   hub as "unplaced", re-attachable to new widgets.
4. Sequencing: P1 normalize -> P2 todo UX rebuild -> P3 hub -> P4 tags/filters.
5. (Earlier decisions that interact: hard grid lock, delta undo history,
   Base UI for new menus, sonner toasts.)

## Entity model

```ts
export interface List {
  id: string            // crypto.randomUUID()
  name: string
  createdAt: number
}

export interface ListItem {
  id: string
  listId: string        // single-parent ownership (Things/Todoist model)
  text: string
  status: "todo" | "progress" | "done"  // 3-state, matches shipped TodoStatus cycle
  order: string         // fractional index key (lexicographic), NOT array position
  tags: string[]        // P4; empty array from P1 so no later migration
  createdAt: number
  completedAt?: number
}
```

Store additions (normalized, persisted):
```ts
lists: Record<string, List>
listItems: Record<string, ListItem>
```

Ordering uses fractional/lexicographic keys (generate-between strings) so drag
reorder writes ONE item, not the whole array, and order survives aggregation
views. A tiny `src/lib/order-key.ts` (generateKeyBetween) - implement the
simple midpoint-string algorithm, no dependency needed.

## View model

Todo widget `data` becomes:
```ts
interface TodoViewData {
  view: {
    source: { listId: string } | { all: true }
    filter?: { status?: "todo" | "done"; tags?: string[] }   // AND-combined (P4)
    sort?: "manual" | "created" | "status"
  }
}
```
- View config is PER WIDGET (Notion embed model). Never shared view objects.
- The hub (P3) is a widget type whose default view is `{ all: true }` with
  source badges; it is the same machinery, not a special case.
- Multiple widgets can point at one `listId` - live, write-through.

## Semantics

- Editing/checking/deleting an item ANYWHERE mutates the one entity; every view
  reflects it (single store, single client - no sync protocol needed).
- Delete item = global delete (undoable). Delete list = explicit action in the
  hub only, confirm dialog, cascades items (undoable). Delete widget = view
  removal only (decision 3).
- List identity: creating a todo widget creates a new list named after the
  widget title by default; rename widget offers to rename list (they are
  distinct - a list can outlive/precede any widget).
- Undo: `HistoryTrio` extends to include `lists` and `listItems`;
  `diffForHistory`/`applyHistoryEntry` extend accordingly. Persist version
  bumps at P1. This is the riskiest seam - P1's plan gates on the existing 45+
  history tests plus new characterization tests BEFORE the swap.

## Migration (P1, lossless)

For each todo widget: create `List { id, name: widget.title }`; hoist each
`data.items[i]` to `ListItem` (new id, `order` = sequential fractional keys,
status preserved losslessly across all THREE states incl. "progress", `tags: []`); widget data becomes the
identity view `{ view: { source: { listId } } }`. Non-todo widgets untouched.
Old clipboard payloads containing todo items: keep paste working by hoisting on
paste (paste of an old-format todo widget creates a fresh list).

## Phases -> plans

- **P1 = plan 034**: entities, store actions (addItem/updateItem/toggleItem/
  deleteItem/reorderItem/createList/renameList/deleteList), history integration,
  migration, identity views. NO visible UX change - the existing todo component
  re-wired to read/write entities. Gate: all existing tests + new entity/
  migration/undo characterization tests + runtime parity check (todo behaves
  exactly as before).
- **P2 = plan 035**: todo widget UX rebuild on the new model - ghost add row +
  Enter chaining, named-group per-item hover (audit offense #1), left-gutter
  drag handle + fractional reorder, single scroll container with pinned header
  and pinned add row, styled thin scrollbar, completed-section collapse
  (decision 2), 24px+ targets, empty state = ghost row + one muted line.
  Incorporates the widget-internals audit's todo items wholesale.
- **P3 = plan 036**: hub widget type ("All todos"): groups by list, source badge
  chips (list name; sheet name where a widget shows it, else "unplaced"),
  write-through editing using P2's item row component, list management (rename/
  delete list, create list), re-attach flow (widget view picker: choose an
  existing list when adding a todo widget).
- **P4 = plan 037**: tags on items (flat, freeform, `#tag` inline parse on the
  add row), per-widget view config UI (filter by tag/status, sort), AND-only
  combination. NO OR groups, NO saved named views, NO dates in this phase.

## P2 interaction spec (locked 2026-07-12, reviewer's picks from the UX research)

- Row hover (named groups, `group/item`): LEFT gutter shows a drag handle
  (grip dots) for reorder; RIGHT edge shows delete. Both fade in on that row
  only, 24px+ hit areas, transition-opacity.
- Inline edit: click the item text to edit in place; Enter saves, Escape
  cancels, empty-on-save cancels (keeps prior text). Blur saves.
- Ghost add row: pinned at the list bottom (never scrolls away), muted
  "+ Add task"; focused state is a real input; Enter commits and re-focuses a
  fresh ghost; Escape or blur-while-empty returns to ghost state.
- Completion: check -> strikethrough in place ~1s -> item animates into a
  "Completed (N)" collapsed disclosure pinned below active items (inside the
  scroll area, above the ghost row). Expanding it is per-widget UI state (not
  persisted). Unchecking restores the item to its ORDER-KEY position among
  active items (decided in 035: returns where it belongs, not bottom-appended).
- Scroll: ONE scroll container per widget (kill the double nesting) - the item
  list scrolls, header and ghost row stay pinned; thin styled scrollbar
  (globals.css utility); subtle top/bottom fade masks only while scrollable.
- Reorder: drag via the left handle within the list (fractional keys, single
  item write); no keyboard reorder in P2 (deferred).
- Counts: header badge shows open-item count only (done count lives on the
  Completed disclosure).

## Explicitly deferred (avoid building Notion)

OR/nested filter groups; user-saved named views; due dates + Today/Upcoming
smart views (high value - separate design when asked); typed properties;
multi-list membership; hierarchical tags; collaboration/sync.

## Top pitfalls being designed against

1. View-config duplication -> config is per-widget by design; only data shared.
2. O(views x items) refilter -> personal scale is fine; if it ever hurts, index
   items by listId/tag (noted in 034 maintenance section, not built now).
3. Migration data loss -> P1 is migration-first with characterization tests on
   real persisted payloads (v6 fixtures).
4. List-vs-tag conflation -> `listId` (one) and `tags` (many) are separate
   fields from P1.
5. Deletion ambiguity -> semantics pinned above (decision 3 + cascade rules).

## Interaction with the other tracks

- 031 (clipboard fidelity) ships before P1; P1's migration owns clipboard
  compat for todo payloads afterward.
- 032 quick-fix plan handles the audit items NOT tied to the data model
  (named-group scoping everywhere, quick-link tooltip/transition, timer cursor)
  so users get relief before P2 lands; P2 supersedes its todo portion.
- Widget registry (plan 007) provides the seam for the hub widget type.
