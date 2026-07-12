# Plan 044: Item lifecycle - archived + cancelled statuses, buckets, batch status

> **Executor instructions**: step by step; verification binding; STOP hard.
> Update `plans/README.md` row when done. **Executor model: sonnet-class.**
>
> **Drift check (run first)**: base = tip of plan 040's lineage (branch
> `advisor/044-item-lifecycle-status`; if run parallel with 042/043, stack on
> 040 and expect a small todo-widget.tsx rebase when landing after them -
> land order 042 -> 043 -> 044). Confirm: `src/types/index.ts` has
> `ListItemStatus = "todo" | "progress" | "done"` and `ListItem.parentId`
> exists (040 landed); store has `cycleListItemStatus` with cascade-done and
> `PERSIST_VERSION = 8`. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED | **Category**: feature/data
- **Depends on**: 040 DONE (hard). 043 soft (batch status serves its
  selections; ship the action regardless).
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part D (data part; the menu is 045). Locked maintainer decisions
  (2026-07-12): **two buckets** - cancelled renders struck-through with a
  distinct icon INSIDE the existing Completed section; archived is fully
  hidden from the todo widget, reachable via a minimal "Archived (N)"
  disclosure in the HUB (full filters wait for 037). Keep the field name
  `completedAt` (no rename migration); semantics = "when the item left the
  active states".

## Why this matters

Items need a full lifecycle: done (finished), cancelled (won't-do, visible
record), archived (set aside, out of view). This is the data layer 045's
context menu and the 037 hub filters stand on.

## Current state

- `src/types/index.ts:34` - `ListItemStatus = "todo" | "progress" | "done"`.
- Store: `getNextListItemStatus` (`store/index.ts:22-26`) todo->progress->
  done->todo; `cycleListItemStatus` (~1395) sets/clears `completedAt`; 040
  added cascade-done-down. All actions: `prevTrio -> pushHistoryEntry`.
- Widening a union needs NO persist migration (old values stay valid) - do
  NOT bump PERSIST_VERSION; add a belt-and-braces status normalizer on read
  (unknown status string -> "todo") next to 040's `?? null` guards.
- Todo widget: active list = status !== "done"; Completed section (flat,
  `completedOpen` React state) = status === "done", with the ~1s
  stay-then-collapse motion (035, StrictMode-safe timers). Hub: groups show
  items flat by order, `openCount` = `status !== "done"`
  (`todo-hub-widget.tsx`).
- Row icons in use: `Check`, `Clock3` (lucide, imported in todo-widget.tsx).
  Use `XCircle` for cancelled, `Archive` for archived.
- Conventions: double quotes, no semicolons, vitest.

## Commands

Install/typecheck/tests/dev - same as plan 042's table.

## Scope

**In scope**: `src/types/index.ts`, `src/store/index.ts` (+test),
`src/components/widgets/todo-widget.tsx`,
`src/components/widgets/todo-hub-widget.tsx`, `src/lib/list-tree.ts` (only
if bucket selectors fit better there), `docs/screenshots/`.
**Out of scope**: context menu (045 - THE user-facing entry point; this plan
may ship with archived/cancelled reachable only via store/hub, that is
fine), keyboard bindings beyond keeping Cmd+Enter cycling the ACTIVE trio,
037 filters, persist version bump.

## Steps

### Step 1: type + transitions

`ListItemStatus = "todo" | "progress" | "done" | "archived" | "cancelled"`.
`cycleListItemStatus` cycles ONLY todo->progress->done->todo (archived/
cancelled are set explicitly, never entered by cycling; cycling an
archived/cancelled item revives it to "todo"). New actions (one entry each):
- `setListItemStatus(id, status)` - entering done/cancelled/archived sets
  `completedAt` (if absent); returning to todo/progress clears it. Cascade
  (consistent with locked done-cascade): setting done, cancelled, or
  archived on a parent applies the SAME status to all descendants; reviving
  does not cascade.
- `setListItemsStatus(ids, status)` - batch, one entry, parent/child dedupe
  as in 043's rule.
Status normalizer on persisted read: unknown -> "todo".
**Verify**: store tests - transition matrix, cascade down + no-revive-up,
completedAt set/clear, batch one-entry, normalizer.

### Step 2: buckets in the todo widget

Active list = status todo|progress. Completed section = done + cancelled
ordered by `completedAt` desc: done rows keep current treatment; cancelled
rows = `line-through` + `XCircle` + muted (distinct from done's check, both
themes). Archived items render NOWHERE in the todo widget. Header stays
"Completed (N)", N = done + cancelled. The 035 stay-then-collapse motion
applies to cancelled transitions too (same timer path).
**Verify**: runtime - cancel an item: lingers ~1s, moves to the section
struck-through with XCircle; archive an item (store call from console for
now): disappears from the widget entirely; one undo brings each back.

### Step 3: hub archived disclosure

Per hub list group: archived items are excluded from normal rows and
`openCount`; if any exist, render an "Archived (N)" disclosure row at the
group end (chevron + count, collapsed by default, React state like group
collapse) listing archived rows (no drag handle, muted, `Archive` icon) with
a per-row Unarchive button (`setListItemStatus(id, "todo")`).
**Verify**: runtime - archived items reachable + unarchivable from the hub,
invisible in the todo widget; both themes; hover UX pass.

### Step 4: gates + evidence

Typecheck/tests/lint baseline. Runtime per README gates (hover, both
themes). Screenshots `docs/screenshots/044-*` (cancelled in section,
archived disclosure open). README row. PR notes MUST state: statuses are
store-complete but menu-exposed only in 045 (temporary reachability gap by
design).

## Test plan

Store tests per Step 1 (>= 10 cases incl. cascade + batch + normalizer).
Bucket selector tests if extracted pure. Existing suite green (the bucket
refactor must not change flat behavior for todo/progress/done).

## Done criteria

- [ ] typecheck + tests green; PERSIST_VERSION still 8 (`grep -n "PERSIST_VERSION = " src/store/index.ts`)
- [ ] Cycle never lands on archived/cancelled (test)
- [ ] Cascade + completedAt + batch semantics proven by tests
- [ ] Widget buckets + hub disclosure runtime-verified both themes, screenshots
- [ ] Archived items invisible in todo widget, reachable in hub (runtime)

## STOP conditions

- Drift fails; a persisted-data shape actually changes (would need a version
  bump - report instead of bumping unilaterally).
- The 035 completion-timer path can't host cancelled without rework of the
  StrictMode-safe timer logic -> report; do not rewrite the timer system.

## Maintenance notes

- 045 wires the human entry points (Mark cancelled / Archive / Unarchive)
  and multi-select labels - keep `setListItemsStatus` exported.
- 037 replaces the hub disclosure with real filters; the disclosure is
  deliberately minimal.
- Reviewer: check `openCount` and "Completed (N)" math with mixed statuses,
  and that `completedAt` ordering keeps the section stable.
