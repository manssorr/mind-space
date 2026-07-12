# Plan 009: Persist undo/redo history across reloads using delta entries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <merge-base with plans 003+004>..HEAD -- src/store/index.ts`
> This plan is written against the store AS LEFT BY plans 003 and 004
> (persist `version: 2`, `recordSnapshot`/`updateWidgetSilent` present,
> undo/redo stacks NOT persisted). If that is not the live state, STOP.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED-HIGH
- **Depends on**: plans/001-verification-baseline.md (HARD - real tests required, no skip override), plans/003-persistence-hardening.md, plans/004-history-undo-overhaul.md
- **Category**: direction
- **Planned at**: 2026-07-11 (post-003/004; update excerpt line numbers against the merged store)

## Why this matters

Plan 003 deliberately stopped persisting undo history because each entry was a full-state JSON snapshot: 100 entries meant a 50-100x localStorage payload and silent quota data loss (measured live: 105 KB blob after 3 s of stopwatch). The maintainer wants history to survive reloads. The safe way to get that back is to make history entries SMALL (deltas: only what changed), then persisting them is cheap. This reverses part of 003's tradeoff intentionally, at the cost of reworking how every snapshotting action records history.

## Current state (post-003/004 store)

All in `src/store/index.ts`:

- History is two string arrays: `undoStack: string[]`, `redoStack: string[]`; each entry is `JSON.stringify({ sheets, widgets, currentSheetId })` produced by `takeSnapshot(...)`, capped by `MAX_HISTORY = 50`.
- ~16 actions push snapshots inline (`addSheet`, `deleteSheet`, `updateSheet`, `duplicateSheet`, `reorderSheets`, `reorderSheetWidgets`, `addWidget`, `updateWidget`, `deleteWidget(s)`, `duplicateWidget(s)`, `toggleCollapse`, `renameWidget`, `pasteWidgets`) plus the explicit `recordSnapshot()` action (called by drag/resize hooks on first move).
- `undo`/`redo` JSON.parse the top entry (guarded try/catch since 004) and `set` the parsed trio wholesale.
- Persist config: `version: 2`, `migrate` chains `version < 1` (strip old stacks) and `version < 2` (timer/stopwatch data). `partialize` excludes the stacks.
- History-relevant state shape: `sheets: Sheet[]` (small - id/title/widgetOrder/timestamps), `widgets: Record<string, Widget>` (the bulk - note contents etc.), `currentSheetId: string | null`.

## Design (decided, not open)

Replace snapshot strings with inverse-delta entries. An entry stores only what is needed to restore the PREVIOUS state:

```ts
interface HistoryEntry {
  widgetsBefore: Record<string, Widget | null>  // per changed widget id: prior value, or null if it did not exist
  sheetsBefore: Sheet[] | null                  // prior sheets array if it changed, else null (sheets are small)
  currentSheetIdBefore: string | null | undefined // undefined = unchanged
}
```

- Producing an entry: a helper `diffForHistory(prev, next)` compares `prev.widgets` vs `next.widgets` by reference per id (all store updates are immutable spreads, so reference inequality = changed), records prior values and tombstones; compares `sheets` by reference; compares `currentSheetId`.
- Applying undo: for each `widgetsBefore` entry, restore the prior value (or delete the id when null); restore `sheetsBefore` when non-null; restore `currentSheetIdBefore` when not undefined. While applying, produce the mirror entry for the redo stack the same way.
- Persist both stacks again in `partialize`, still capped at `MAX_HISTORY = 50`. Typical entry = one widget's prior value; worst case (paste of N widgets) = N prior tombstones. No full-state copies anywhere.
- Persist `version: 3`; `migrate` for `version < 3` drops any legacy stack keys (defensive; v2 blobs have none).
- No new dependencies.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0 (or only the pre-existing baseline problems) |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/store/index.ts`
- `src/store/history.test.ts` (extend/create - this plan REQUIRES tests; plan 001 must be DONE)
- `src/lib/history-diff.ts` (create - the pure diff/apply helpers, unit-testable)

**Out of scope**:
- Widget components, hooks (004's `recordSnapshot` call sites keep working - the action's signature must not change).
- Any compression, IndexedDB migration, or history UI.

## Git workflow

- Branch: `advisor/009-persistent-delta-undo-history` (branch from wherever 003+004 have merged)
- Commits per step, style `feat: ...` / `refactor: ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure helpers in `src/lib/history-diff.ts`

Implement `diffForHistory(prev, next): HistoryEntry | null` (null when nothing history-relevant changed) and `applyHistoryEntry(state, entry): { restored, mirror }` where `mirror` is the entry that reverses the application. Both pure, no store imports.

**Verify**: `npm run typecheck` exit 0.

### Step 2: Unit tests for the helpers FIRST

In `src/store/history.test.ts` (or `src/lib/history-diff.test.ts`): single-widget edit diff; widget add (tombstone null restores by deletion); widget delete (prior value restores); multi-widget paste; sheet reorder (sheetsBefore path); currentSheetId change; apply+mirror round-trip returns the original state (deep-equal) for every case above.

**Verify**: `npx vitest run` - new tests pass.

### Step 3: Swap the store's history plumbing

- Change stack types to `HistoryEntry[]`. Replace every inline `takeSnapshot` push with a shared internal `withHistory(state, nextPartial)` helper (or compute the diff inside `recordSnapshot` and each action) so each snapshotting action stores `diffForHistory(prevTrio, nextTrio)`.
- `recordSnapshot()` (used by drag/resize): must capture the pre-interaction trio and, on the NEXT mutation, produce the diff. Simplest faithful approach: `recordSnapshot` stores a pending deep-reference copy of the trio (`{sheets, widgets, currentSheetId}` - references, not clones; immutability makes that safe), and the first subsequent state change materializes the diff entry. If this two-phase approach proves too invasive, the fallback that preserves the public API: `recordSnapshot` stores `{ widgetsBefore: <all current widget refs>, sheetsBefore, currentSheetIdBefore }` scoped down at apply time - but document which you chose in NOTES.
- Rework `undo`/`redo` to `applyHistoryEntry` + push mirror to the other stack. Corrupt-entry guard: entries are objects now; guard against malformed persisted entries (missing keys) by dropping them, same policy as 004.
- Re-add `undoStack`/`redoStack` to `partialize`. Bump `version: 3`, extend `migrate`.

**Verify**: `npm run typecheck` exit 0; `npx vitest run` - ALL suites pass including plan-001 characterization tests (cases 5/6: moveWidget/resizeWidget still push nothing; case 7/8 semantics unchanged from the user's perspective).

### Step 4: Size proof

Add a test asserting payload economy: seed 10 widgets with ~1 KB note content each, perform 50 single-widget edits, assert `JSON.stringify(persisted undoStack).length` is under 100 KB (it would be ~500 KB+ under the old full-snapshot scheme) and that a full-state snapshot string does NOT appear in any entry.

**Verify**: `npx vitest run` passes; `npm run build` exit 0.

## Test plan

Covered in steps 2-4. Additionally: reload survival - seed store, edit, flush persistence (fake timers past 300 ms debounce), `useStore.persist.rehydrate()` on a fresh store instance, assert `undo()` restores the pre-edit widget.

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `grep -n "takeSnapshot" src/store/index.ts` -> no full-trio stringify pushes remain (function deleted or repurposed)
- [ ] `partialize` includes `undoStack`/`redoStack`; persist `version: 3` with chained migrate
- [ ] Size-proof test passes
- [ ] Undo history demonstrably survives rehydrate (test from Test plan)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 001 not DONE (no vitest in repo) - hard prerequisite, do not improvise around it.
- Plans 003/004 not merged into your base (store lacks `version: 2` or `recordSnapshot`).
- The `recordSnapshot` two-phase rework requires changing hook call sites (`use-widget-drag.ts` / `use-widget-resize.ts` are out of scope) - stop and report which API change would be needed.
- Any plan-001 characterization test needs its ASSERTION semantics changed (not just types) to pass.

## Maintenance notes

- Every future snapshotting action MUST go through the shared diff path; a raw stack push of anything but a `HistoryEntry` reintroduces the blowup.
- Reviewer focus: the apply+mirror round-trip property (step 2's last case) is the correctness heart - undo(undo(x)) via redo must be identity.
- Deferred: history entry coalescing (N keystrokes -> one entry), history UI, IndexedDB for very large canvases.
