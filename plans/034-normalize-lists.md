# Plan 034: Normalize todos into List/ListItem entities (central-lists P1)

> **Executor instructions**: Follow step by step; verification commands are
> binding. This is the riskiest plan in the central-lists track - it rewires
> data storage AND undo history. Honor every STOP condition. Reviewer maintains
> `plans/README.md`. Design context (intent, not instructions):
> `plans/033-central-lists-design.md`.
>
> **Drift check (run first)**: base branch named by reviewer at dispatch.
> Confirm: persist version is 6; `src/lib/history-diff.ts` exports
> `diffForHistory`, `applyHistoryEntry`, `isValidHistoryEntry`, types
> `HistoryEntry`, `HistoryTrio` where `HistoryTrio = { sheets, widgets, currentSheetId }`;
> todo items live in `widget.data.items` with shape `{ id, text, done?, status? }`
> where `status` is the 3-state `TodoStatus = "todo" | "progress" | "done"`
> (todo-widget.tsx:10) cycled by `getNextTodoStatus` (todo-widget.tsx:36-40) -
> the 3-state cycle and its "progress" amber visuals MUST survive this plan
> unchanged. Mismatch = STOP.
>
> Re-dispatch note (2026-07-12): a first executor correctly STOPPED on a spec
> bug here - the plan originally typed status as binary. Fixed; migration test
> below MUST include a "progress" item round-tripping losslessly.

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: HIGH (persist migration + history model change)
- **Depends on**: 031 (chain), design 033
- **Planned at**: 2026-07-12

## Why this matters

Todo items are JSON blobs owned by one widget (`widget.data.items`). The
approved design moves them to normalized entities so lists outlive widgets,
appear on multiple sheets, aggregate into a hub, and later take tags/filters.
THIS plan is the invisible foundation: after it ships, the app must look and
behave EXACTLY as before (parity is the acceptance bar), but data lives in
entity stores and every todo widget is an "identity view" over its own list.

## Target model (from the approved design; implement exactly)

```ts
// src/types/index.ts
export interface List { id: string; name: string; createdAt: number }
export interface ListItem {
  id: string
  listId: string
  text: string
  status: "todo" | "progress" | "done"   // 3-STATE - matches the shipped TodoStatus
  order: string          // fractional key, lexicographic sort
  tags: string[]         // always [] in this plan; field exists to avoid a later migration
  createdAt: number
  completedAt?: number   // set only when status becomes "done"; cleared otherwise
}
```

Store (persisted): `lists: Record<string, List>`, `listItems: Record<string, ListItem>`.
Todo widget data becomes `{ view: { source: { listId: string } } }` (identity
view; `{ all: true }` sources and filters are LATER plans - type the union now,
implement only `listId`).

## Steps

### Step 1 - order-key lib

`src/lib/order-key.ts`: `orderKeyBetween(a: string | null, b: string | null): string`
- midpoint-string algorithm over a base-36 (or a-z) alphabet: returns a key
  strictly between a and b; `(null, null)` -> initial key; append/prepend cases.
  Keep under ~60 lines; NO external dependency. Property tests: between-ness,
  repeated appends stay short-ish, repeated midpoints between two fixed keys
  always produce distinct ordered keys (loop 50x).

### Step 2 - store entities + actions

Add to the store interface + implementation (each mirrors existing action style):
- `createList(name) -> string`, `renameList(id, name)`, `deleteList(id)`
  (cascades its items; history entry).
- `addListItem(listId, text) -> string` (order = after current last),
  `updateListItem(id, updates)`, `cycleListItemStatus(id)` (todo -> progress ->
  done -> todo, mirroring `getNextTodoStatus` in todo-widget.tsx:36-40;
  `completedAt` set when entering "done", cleared when leaving it),
  `deleteListItem(id)`, `moveListItem(id, beforeId | null, afterId | null)`
  (order-key rewrite for ONE item).
- History: mutations push entries via the existing `pushHistoryEntry` pattern.

### Step 3 - history integration (THE risky seam; do this test-first)

1. Read `src/lib/history-diff.ts` fully.
2. Extend `HistoryTrio` to `{ sheets, widgets, currentSheetId, lists, listItems }`;
   extend `diffForHistory`/`applyHistoryEntry`/`isValidHistoryEntry`
   symmetrically with the EXISTING per-collection diff approach (study how
   `widgets` is diffed; `lists`/`listItems` follow the same shape).
3. BEFORE wiring the store: extend `src/lib/history-diff.test.ts` (or its
   actual filename) with round-trip cases for the new collections: add/remove/
   modify item; undo restores; redo mirrors; old entries WITHOUT the new
   collections still validate and apply (backward compat inside a session is
   not required across the version bump - see migration - but
   `isValidHistoryEntry` must reject malformed entries, not crash).
4. Then update `trioOf` in `src/store/index.ts` and every `pushHistoryEntry`
   call site compiles (TypeScript will enumerate them).

### Step 4 - migration v6 -> v7

In `migratePersistedState`: for every widget with `type === "todo"`:
- `createList`-equivalent inline (name = widget.title), hoist `data.items[]`
  to `listItems` (new ids, sequential order keys via `orderKeyBetween`,
  status LOSSLESS across all three states:
  `status: item.status === "progress" ? "progress" : (item.done || item.status === "done") ? "done" : "todo"`,
  `tags: []`,
  `createdAt: Date.now()` is NOT available in migrations if the codebase avoids
  it - check how existing migrations stamp times; if none do, use 0),
- widget data -> `{ view: { source: { listId } } }`.
- Drop old persisted `undoStack`/`redoStack` (delta entries reference the old
  trio shape - same precedent as the v3 history swap; check how that migration
  cleared stacks and mirror it).
- Migration tests: v6 fixture with 2 todo widgets (one with items covering ALL
  THREE statuses - todo, progress, done - plus a legacy `done: true` item
  without status, one empty widget) + a note widget -> lists/items hoisted with
  every status preserved exactly, orders sorted, non-todo untouched, stacks
  cleared.

### Step 5 - rewire the todo widget (parity, not redesign)

`todo-widget.tsx` reads via selectors: its list id from `data.view.source.listId`,
items = `Object.values(listItems).filter(i => i.listId === id).sort(by order)`
(memoized selector; keep per-widget subscriptions narrow - derive an ordered
id array selector and read item bodies per row if render perf needs it, but do
NOT over-engineer: parity first, measure later).
All handlers switch to the new store actions. The VISUALS AND INTERACTIONS DO
NOT CHANGE in this plan (redesign is plan 035). Widget deletion already leaves
lists intact by construction (deleteWidget knows nothing about lists) - assert
that in a test.
Also: `duplicateWidget(s)`/`duplicateWidgetsAt`/copy-paste of a todo widget now
must DUPLICATE THE LIST (new list + copied items), not share it - decide
nothing: this is the specified behavior (a duplicate is a fork, not a second
view; shared-view creation arrives with the hub in P3). Clipboard payloads for
todo widgets carry the items snapshot (extend ClipboardData minimally); old
persisted clipboards with `data.items` hoist on paste.

### Step 6 - gates + runtime parity verification

- `npm run verify`-equivalent: typecheck + tests (baseline = chain tip count,
  plus your new suites) green; only `theme-toggle.tsx` lint failure allowed.
- Runtime (dev server, chrome-devtools MCP; UI/UX gates per plans/README.md -
  this plan's UX bar is PARITY):
  - Fresh profile: seed todo widget works: add/toggle/edit/delete items exactly
    as before (screenshots before/after equivalent states).
  - v6 payload with todos: migrates - same items visible, done states kept,
    order preserved; zero console errors.
  - Undo/redo: item add/toggle/delete each one entry; drag a todo widget still
    one entry; sheet duplicate duplicates lists (fork semantics), cmd+D on a
    todo widget forks the list (edit the copy, original unchanged).
  - Reload mid-everything: state survives (persistence of new stores).
  - Two widgets CANNOT yet share a list (no UI for it) - confirm duplicating
    gives independent lists.

## Gates & conventions

`npm install` first. Style: double quotes, no semicolons, no em-dashes, no AI
signatures. Logical commits. Do not push.

## Done criteria

Diff touches only: `src/types/index.ts`, `src/lib/order-key.ts` (+test),
`src/lib/history-diff.ts` (+its test), `src/store/index.ts` (+test),
`src/components/widgets/todo-widget.tsx`, `docs/screenshots/`, plus minimal
`ClipboardData` handling in the store. All step-6 checks reported with numbers.
Mermaid-worthy architectural change: include a data-flow mermaid sketch in your
report for the PR body (entities -> views).

## STOP conditions

Drift check fails; `history-diff.ts`'s structure does not generalize to more
collections without redesign (report its actual shape); migration cannot
preserve item order deterministically; any existing test breaks in a way that
implies a behavior change beyond the storage swap (parity violations are STOP,
not fix-forward); persist version on base is not 6.

## Out of scope

Any visual/interaction change (035); hub (036); tags UI/filters (037);
`{ all: true }` source implementation; performance indexing.
