# PRD: Advanced Todo - hierarchy, keyboard, lifecycle, multi-select

Status: **SPEC ONLY - do not implement.** Parked 2026-07-12 for the next
Fable / Sol (GPT competitor to Fable) session. When picked up, decompose into
plans in the 037+ range and run through the standard executor pipeline (each
phase: plan -> executor in worktree -> reviewer runtime-verify -> PR). The
UI/UX review gates and PR evidence rules in `plans/README.md` apply.

Baseline this builds on: the todo widget rebuilt in plan 035 (branch
`advisor/035-todo-ux-rebuild`, PR #25) - ghost add row, per-row hover with left
drag handle + right delete, drag reorder via fractional order keys, ~1s
completion motion into a "Completed (N)" section, one scroll container. Items
are `ListItem` entities (plan 034): `{ id, listId, text, status: todo|progress|done,
order, tags, createdAt, completedAt? }`. The todo hub (plan 036) is PARKED
mid-build on branch `advisor/036-todo-hub`; several items below ("move to list",
cross-list ops) depend on it, so resume 036 first or fold it in.

---

## Part A - Bug fixes (cheap, do these FIRST before the features)

These are small and shipped-broken in 035; fix them as a bug plan before the big
features, they are not worth blocking the features on.

### A1. Text baseline misaligned with checkbox, handle, and delete icon
Screenshots (2026-07-12): the item text sits lower than the checkbox circle, the
6-dot drag handle, and the delete trash icon - nothing shares a baseline. Root
cause to investigate: the row is likely `items-start` or the text has default
line-height/padding pushing it down while the controls are `items-center`; or
the inline-edit input and the static text have different vertical metrics.
Expected: checkbox, text, handle, delete all vertically centered on one row axis
at every text length (single and wrapped lines - for wrapped text, controls
align to the FIRST line, top-aligned, not centered on the block).

### A2. Excessive internal padding / not compact enough
Screenshot: large vertical gaps between rows and generous row padding make the
list feel sparse. Reduce row height and inter-row spacing to a compact density
(reference: Todoist/Linear list density) WITHOUT breaking the drag handle hit
area or the 24px touch targets from plan 032 - i.e. keep the hit zones, shrink
the visual padding (hit area can exceed the visual row via negative margin). A
density that fits ~40% more rows in the same widget height is the target; tune
live.

### A3. Drag preview should be a ghost of the item, not an insertion line
Currently reorder shows a thin insertion line between rows. Replace with: the
dragged row renders as a semi-transparent "shadow" copy following the cursor at
the exact position it will land, while the original row's slot shows a gap
(standard Notion/Linear drag affordance). Keep the pointer-events + fractional-
order-key reorder logic from 035; this is a rendering change to the drag
feedback only. Must stay functional (drop still calls `moveListItem`, single
undo entry).

---

## Part B - The keyboard + shortcuts system (Fable owns this; strict rules)

The user delegated the full shortcut catalog with a mandate to own it under
strict rules preventing inconsistency/conflict. These are the governing rules,
then the todo-specific bindings.

### B0. Shortcut governance rules (apply to the WHOLE app, not just todos)
1. **Context scopes**, checked in order; a key resolves in the first scope that
   claims it: (1) text-editing (an input/textarea/contentEditable is focused) -
   only editing keys + Escape act; (2) item-focused (a todo item is the active
   element, not being edited); (3) widget-focused; (4) canvas (nothing focused).
   The existing `isInput` guard is the scope-1 gate; extend it into an explicit
   scope resolver rather than ad-hoc checks.
2. **Modifier meanings are fixed app-wide** and never reused for a conflicting
   purpose: `Cmd/Ctrl` = app/document command (save, undo, duplicate, select-all);
   `Shift` = extend/range (extend selection, promote to a "bigger" variant like
   subtask, range-select); `Alt/Option` = alternate/structural (move, clone,
   secondary action); `Cmd+Shift` = command variant. Pick per-binding using
   these meanings; if a desired binding violates them, rename the action, don't
   overload the modifier.
3. **No binding may mean two things in the same scope.** Maintain the catalog
   (Part B4) as the single registry; adding a binding requires checking it.
4. **Discoverability**: every shortcut appears in a `?`-triggered help overlay
   (a separate small plan - the app already has ~7 undocumented shortcuts per an
   earlier audit finding; this overlay covers all of them).
5. **Reduced-motion / a11y**: keyboard paths must reach every action a hover
   reveals (delete, handle-drag equivalent = keyboard move).

### B1. Enter to create sibling; Shift+Enter to create subtask
While editing an item, Enter commits and creates a NEW sibling item directly
below, entering edit on it (chains, matching the ghost-row capture from 035 but
now from WITHIN a list, mid-position). **Shift+Enter** commits and creates a
CHILD (subtask) of the current item, indented one level, entering edit on it.
This introduces hierarchy - see Part C for the data model.
- Empty-commit rule: pressing Enter on an empty item (no text) OUTDENTS it one
  level if nested, or exits edit if already top-level (Notion/Workflowy
  convention).
- Backspace at start of an empty item deletes it and focuses the previous item's
  end.

### B2. Move item with arrow keys (Alt+Up / Alt+Down) - reorder
When an item is focused (scope 2, not editing), **Alt+ArrowUp / Alt+ArrowDown**
moves the item up/down among its siblings, carrying its subtree. Reorders via
`moveListItem` (one undo entry per move). At the top/bottom of its sibling group,
a further move either stops or (decision to make in the plan) escapes to the
parent's level - default: stop, keep it simple; escaping is a later refinement.
- Plain ArrowUp/ArrowDown (no modifier) = move FOCUS between visible items
  (navigation, not reorder).
- **Alt+ArrowLeft / Alt+ArrowRight** = outdent / indent (change parent), the
  structural sibling of B1's Shift+Enter. Indent = become a child of the
  previous sibling; outdent = become a sibling of the parent. Guarded against
  invalid moves (can't indent the first child, etc).

### B3. Edge cases the implementation MUST handle (parent/child)
- Moving a parent moves its whole subtree (contiguous order-key block).
- Indenting an item with children: children go with it (depth of all descendants
  +1); enforce a max depth (propose 5) to bound UI.
- Deleting a parent: prompt or default - default cascade-delete the subtree
  (undoable), matching list delete. A "delete just this, promote children"
  variant can be a context-menu action (Part D).
- Completing a parent: decision - completing a parent auto-completes descendants?
  Propose YES with the parent's completion, but un-completing the parent does NOT
  auto-uncomplete children (they were independently done). Flag as a real product
  choice for the implementing session.
- Order keys must stay valid within a sibling group; hierarchy adds a `parentId`
  and ordering is per-parent (see Part C).

### B4. Shortcut catalog (todo scope, initial - the registry to maintain)
| Keys | Scope | Action |
|---|---|---|
| Enter | editing | commit + new sibling below (edit it) |
| Shift+Enter | editing | commit + new subtask (edit it) |
| Escape | editing | cancel edit (keep prior text) |
| Backspace (empty, at start) | editing | delete item, focus prev |
| Enter (empty) | editing | outdent, or exit if top-level |
| ArrowUp / ArrowDown | item | move focus between items |
| Alt+ArrowUp / Alt+ArrowDown | item | move item (with subtree) among siblings |
| Alt+ArrowLeft / Alt+ArrowRight | item | outdent / indent |
| Cmd/Ctrl+Enter (or a key TBD) | item | cycle status todo->progress->done |
| Shift+ArrowUp / Shift+ArrowDown | item | extend multi-selection (Part E) |
| Cmd/Ctrl+A | item | select all items in the list |
| Delete/Backspace | item (not editing) | delete selected item(s) |
| Right-click / Menu key | item | open item context menu (Part D) |

Conflicts to resolve when planning: Alt+Arrow reorder vs any existing canvas
Alt-drag; the status-cycle key (Cmd+Enter is a candidate but verify no
conflict). The catalog is authoritative - update it, don't fork it.

---

## Part C - Data model change: hierarchy (subtasks)

`ListItem` gains `parentId: string | null` (null = top-level). Ordering becomes
per-parent: an item's `order` key is unique among items sharing its `parentId`.
Selectors build a tree; render is a flattened visible list (respecting collapse
state) so keyboard nav and the single scroll container still work.
- Collapse/expand a parent (chevron on rows with children) - collapse state is
  per-widget React state, NOT persisted (consistent with the Completed section
  in 035).
- Migration: existing items get `parentId: null` - trivial, no data change, but
  bump persist version and add the field with a default (belt-and-braces read
  `?? null`).
- History: `parentId` and per-parent order participate in the delta diff (the
  `listItems` collection already diffs by id; a `parentId` change is just a field
  change - verify the diff catches it, add a test).
- The hub (036) renders hierarchy too (indented), write-through unchanged.

---

## Part D - Item lifecycle + context menu

Items get a full lifecycle beyond todo/progress/done. Proposed `status` union
extension (decision for the implementing session; this is the recommendation):
`todo | progress | done | archived | cancelled`.
- **done**: completed normally (existing), shows in "Completed (N)".
- **archived**: hidden from the active list, kept in the data, reachable via a
  filter/hub view (037) or an "Archived" disclosure. Distinct from done: done =
  finished, archived = set aside / no longer relevant but keep the record.
- **cancelled**: struck through with a distinct treatment (not a success),
  moves out of active like done but into a "Cancelled" bucket or the Completed
  section with a different icon. Semantics: won't-do.
- `completedAt` generalizes to `resolvedAt` (set when leaving the active
  todo/progress states); keep `completedAt` as an alias or migrate.

### Item context menu (right-click on an item; also a hover "..." button)
Actions, all multi-selection aware (operate on the whole selection when >1
selected, singular labels become "N items"):
- Edit (enter inline edit)
- Cycle / set status: Mark todo / in progress / done / cancelled
- Archive / Unarchive
- Add subtask
- Indent / Outdent
- Move to list... (requires the hub / list registry from 036 - a submenu of
  target lists; grays out if only one list exists)
- Duplicate item (with subtree)
- Delete (with subtree; confirm if it has children)
Built on the SAME Base UI context-menu machinery as the widget menu (plan 026) -
reuse the portal/pointer-events-lock patterns so we don't re-introduce the
hover-leak / positioning bugs already solved there.

---

## Part E - Multi-selection of items

Item selection is per-list (or per-hub-group), separate from widget selection.
- Click selects one; Shift+click range-selects; Cmd/Ctrl+click toggles
  (mirroring the widget selection semantics from plan 022 for consistency).
- Shift+ArrowUp/Down extends selection by focus movement.
- Selected items get a selection background; the context menu and keyboard
  actions (status, delete, indent, move, archive) apply to all selected.
- Drag one selected item -> drags the whole selection (like widget group-drag,
  plan 022/023).
- Selection is ephemeral (not persisted, not undoable) - same category as widget
  selection and marquee.

---

## Suggested phase breakdown (for the implementing session)

1. **Bug plan** (Part A) - alignment, density, ghost drag preview. Small, ship first.
2. **Hierarchy foundation** (Part C) - parentId, per-parent order, tree
   selectors, flattened render, collapse, migration, history. Invisible-ish;
   parity for flat lists.
3. **Keyboard system** (Part B) - scope resolver + governance + the todo
   bindings (Enter/Shift+Enter, Alt+arrows, indent/outdent) + the `?` help
   overlay. Depends on hierarchy.
4. **Item selection** (Part E) - depends on nothing but pairs well before the
   context menu.
5. **Lifecycle + context menu** (Part D) - status extension, archive/cancel,
   the Base-UI item menu, multi-select actions, "move to list" (needs hub 036).
6. Resume/finish **hub 036** at whatever point "move to list" needs it.

Each phase is its own plan + PR. Estimate: this is several sessions of work; the
hierarchy + keyboard phases are the hard, high-risk ones (they touch the entity
model and the app-wide shortcut scoping).

## Open product decisions to confirm with the user before building
- Parent completion auto-completing children (Part B3): recommend yes-down,
  no-up.
- The archived vs cancelled distinction and their buckets (Part D).
- Max nesting depth (proposed 5).
- Whether Alt+Arrow at a sibling boundary stops or escapes to parent level (Part B2).
- The status-cycle keyboard binding (Cmd+Enter candidate).
