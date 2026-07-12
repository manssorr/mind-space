# Plan 040: Subtask hierarchy - parentId, per-parent order, tree render, migration

> **Executor instructions**: Follow step by step; verification binding; STOP
> conditions hard. Update `plans/README.md` row when done.
> **Executor model: opus-class** (entity model + migration + history = the
> high-risk core of the PRD).
>
> **Drift check (run first)**: base = tip of `advisor/036-todo-hub` after the
> 036 resume addendum AND plan 039 landed (rebase order: 036R -> 039 -> this).
> Confirm: `src/types/index.ts` has `ListItem { id, listId, text, status,
> order: string, tags, createdAt, completedAt? }` and NO `parentId`;
> `src/store/index.ts` has `PERSIST_VERSION = 7` and `migratePersistedState`
> with sequential `if (version < N)` blocks; `src/lib/order-key.ts` exports
> `orderKeyBetween`. Mismatch = STOP.

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: HIGH | **Category**: migration/feature
- **Depends on**: 036 addendum DONE, 039 DONE
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part C + B3 (read both). Locked maintainer decisions (2026-07-12):
  **complete-parent cascades done DOWN to descendants; un-complete does NOT
  cascade up. Max nesting depth = 5. Alt+move at a sibling boundary STOPS.**

## Why this matters

Subtasks are the foundation for the whole advanced-todo PRD (keyboard
indent/outdent, lifecycle cascades, context-menu actions). This plan makes
hierarchy a first-class, migrated, undoable part of the entity model with
flat-list parity - visible change is minimal (indent + chevrons), every later
plan builds on these invariants.

## Current state

- `src/types/index.ts:36-45` - `ListItem` as in drift check. `List` =
  `{ id, name, createdAt }`.
- `src/store/index.ts` - every list/item action follows: capture
  `prevTrio = trioOf(state)`, build next collections immutably, `return
  ...pushHistoryEntry(state, prevTrio, nextTrio)`. Actions: `createList`
  (~1311, returns new id), `renameList`, `deleteList` (~1337, cascades its
  items), `addListItem(listId, text)` (~1355, appends via
  `orderKeyBetween(lastOrder, null)`), `updateListItem(id,
  Partial<Pick<..., "text"|"tags">>)`, `cycleListItemStatus(id)` (~1395,
  todo->progress->done->todo, sets/clears `completedAt`),
  `deleteListItem(id)`, `moveListItem(id, beforeId, afterId)` (~1427,
  `orderKeyBetween(beforeOrder, afterOrder)`).
- History: `src/lib/history-diff.ts` - `diffCollection` diffs by object
  REFERENCE per id; `listItems` is one of the diffed collections. A
  `parentId` change produces a new item object, so deltas capture it with no
  history-code changes - but prove it by test, don't assume.
- Persist: `PERSIST_VERSION = 7` (`store/index.ts:269`);
  `migratePersistedState` (~270-392) exported and unit-tested; new migration
  = one more `if (version < 8)` block before `return state`.
- Render (`src/components/widgets/todo-widget.tsx`): flat `activeOrderedIds`
  sorted by `order`; drag targets any `[data-item-id]` row;
  `neighborsForDrop` in `src/lib/list-reorder.ts` computes flat before/after
  ids. Completed section = separate flat list below, per-widget
  `completedOpen` React state (the collapse-state convention to copy).
- Hub (`src/components/widgets/todo-hub-widget.tsx`): per-list groups reuse
  `TodoRow`, sorted flat by `order`.
- Conventions: double quotes, no semicolons; vitest tests in
  `src/store/index.test.ts` + `src/lib/*.test.ts`; model new lib tests after
  `src/lib/list-placement.test.ts`.

## Commands

| Purpose | Command | Expect |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | green; new tests included |
| Dev | `npm run dev` | for runtime verification |

## Scope

**In scope**: `src/types/index.ts`, `src/store/index.ts` (+`index.test.ts`),
`src/lib/list-tree.ts` (new, +test), `src/lib/list-reorder.ts` (+test),
`src/components/widgets/todo-widget.tsx`,
`src/components/widgets/todo-hub-widget.tsx`, `docs/screenshots/`.
**Out of scope**: keyboard bindings (042), item selection (043), status
extension (044), context menu (045), `src/lib/history-diff.ts` (must NOT
change - STOP if it must), persistence machinery beyond the one migration
block.

## Steps

### Step 1: data model + migration v7->v8

- `ListItem` gains `parentId: string | null`. Ordering INVARIANT (comment at
  the type): `order` is unique among items sharing (`listId`, `parentId`);
  flattened position = DFS over per-parent sibling order, so moving a
  parent's order key moves its whole subtree with zero child writes.
- `PERSIST_VERSION = 8`; migration block: every persisted item gets
  `parentId: item.parentId ?? null`. Belt-and-braces `?? null` anywhere raw
  persisted items are read.
- `MAX_ITEM_DEPTH = 5` exported constant (depth 0 = top level).
**Verify**: typecheck; migration unit test (v7 payload -> v8 adds
`parentId: null`, nothing else changes; undo stacks preserved).

### Step 2: tree selectors (`src/lib/list-tree.ts`, pure + tested)

Exports (pure, no store imports):
- `buildVisibleRows(items: ListItem[], collapsedIds: Set<string>):
  Array<{ item: ListItem; depth: number; hasChildren: boolean }>` - DFS,
  siblings by `order`, skips descendants of collapsed ids. Defensive: an item
  whose `parentId` points at a missing item OR would form a cycle is treated
  as top-level (never dropped, never infinite-loops).
- `descendantIds(items, id): string[]` (DFS order).
- `itemDepth(items, id): number`.
- `canIndent(items, id)` / `canOutdent(items, id)`: indent = has a previous
  sibling AND resulting max depth of (self + descendants) <= MAX_ITEM_DEPTH;
  outdent = has a non-null parent.
**Verify**: unit tests - ordering, collapse, orphan-as-root, cycle-as-root
(a,b pointing at each other), depth math, guards at the depth cap.

### Step 3: store actions

Same `prevTrio -> pushHistoryEntry` pattern, ONE history entry each:
- `addListItem(listId, text, opts?: { parentId?: string | null; afterId?:
  string | null })` - extend backward-compatibly (existing callers unchanged
  = append top-level). `afterId` inserts as next sibling after that id.
- `indentListItem(id)` - new parent = previous sibling; children ride along
  (their parentId untouched); order appends at end of new parent's children.
  No-op (no history entry) when `canIndent` is false.
- `outdentListItem(id)` - new parent = old parent's parent; order =
  immediately after the old parent among its siblings. No-op at top level.
- `deleteListItem(id)` - now cascades: id + `descendantIds`.
- `cycleListItemStatus(id)` - when the transition lands on `done`, set every
  descendant done (+`completedAt`); leaving done does NOT touch descendants
  (locked decision).
- `moveListItem(id, beforeId, afterId)` - signature unchanged (sibling
  reorder). Guard: if neighbors carry a different parentId than the item,
  adopt the neighbors' parentId (this is the drag drop-adoption path, Step 4).
**Verify**: store tests per action - single undo entry; undo of indent
restores BOTH parentId and order; delete-cascade undo restores the subtree;
cascade-done sets descendants and undo restores mixed statuses; no-op guards
push nothing.

### Step 4: parent-aware drag drop

`neighborsForDrop` gains flattened-tree context: dropping before/after a row
adopts THAT row's `parentId` (become its sibling there). Return
`{ beforeId, afterId }` of true same-parent neighbors for the adopted slot;
store guard (Step 3) sets parentId. Depth rule: if the adopted position would
push the dragged subtree past MAX_ITEM_DEPTH, clamp to the deepest legal
ancestor along that slot's chain (silent clamp, no new UI).
**Verify**: `list-reorder.test.ts` cases: drop between two children of X ->
parent X; drop at a boundary between X's last child and a top-level row ->
the target row's own parent; depth-clamp case.

### Step 5: render - todo widget + hub

- Replace the flat map with `buildVisibleRows` (active items; done items keep
  rendering flat in the completed section as today).
- `TodoRow` gains `depth: number` (indent `paddingLeft: depth * 12`) and
  `hasChildren`/`collapsed`/`onToggleCollapse` -> chevron button before the
  drag handle (same hit-area treatment as 039 controls); rows without
  children render a same-width spacer.
- Collapse state: per-widget React `Set<string>` (NOT persisted - same
  convention as `completedOpen`).
- Hub: same `buildVisibleRows` per group.
**Verify**: flat lists (all parentId null) render EXACTLY as before this plan
(pixel-parity screenshot vs 039 baseline); a nested fixture indents and
collapses.

### Step 6: gates + runtime verification + evidence

Full suite + typecheck + lint baseline. Runtime (dev server, real input, both
themes, README UI/UX gates): build a 3-level tree, verify indent render,
collapse/expand, drag a parent -> subtree travels, delete parent -> subtree
gone -> ONE undo restores, complete parent -> descendants done -> undo
restores. Reload mid-tree (migration + persist round trip). Screenshots
`docs/screenshots/040-*`. Mermaid of the entity model for the PR body.
Update README row.

## Test plan

New vitest: `src/lib/list-tree.test.ts` (Step 2 cases),
`src/lib/list-reorder.test.ts` additions (Step 4), `src/store/index.test.ts`
additions (Step 3 list PLUS one history-integration test proving a bare
`parentId` change is undoable via the existing reference-diff). Migration
test in the existing migration describe block. Pattern:
`src/lib/list-placement.test.ts`. Expect >= 20 new tests.

## Done criteria

- [ ] typecheck + full suite green with >= 20 new tests
- [ ] `PERSIST_VERSION = 8` + migration test proves v7 payload upgrade
- [ ] Flat-list pixel parity confirmed (screenshot pair in PR)
- [ ] Undo restores parentId+order for indent/outdent/move/delete-cascade (tests)
- [ ] Runtime list from Step 6 reported with evidence
- [ ] `src/lib/history-diff.ts` untouched (`git diff --stat`)

## STOP conditions

- Drift check fails, or history-diff.ts needs modification for parentId to
  undo correctly (the reference-diff assumption is this plan's spine).
- Per-parent order invariant conflicts with existing data (e.g. the v6->v7
  migration produced colliding sibling orders) -> report the data shape.
- Any step's verification fails twice.

## Maintenance notes

- Plans 042/043/044/045 consume `buildVisibleRows`, `canIndent/canOutdent`,
  `descendantIds`, extended `addListItem` - treat their signatures as API.
- Reviewer scrutiny: migration block ordering (`< 8` after `< 7`),
  cascade-done + undo interaction, cycle guard (corrupted persisted data must
  never hang render).
- Deferred deliberately: "delete parent, promote children" (a 045 menu
  action); boundary-escape on Alt+move (locked: stop at boundary).
