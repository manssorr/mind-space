# Plan 003: Stop persisting undo history, add persist versioning, surface storage failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/store/index.ts src/app/layout.tsx src/components/ui/toast.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md
- **Category**: bug
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

The store persists its undo and redo stacks: up to 100 full-state JSON snapshots are written to localStorage on every change, so the stored payload is roughly 50-100x the actual state size. localStorage quotas (typically ~5 MB) get hit quickly, and every write failure is a silent `catch {}` - the user keeps editing while nothing is being saved. There is also no persist `version`/`migrate`, so the first future schema change will rehydrate stale shapes into the store unchecked. This plan shrinks the persisted payload, adds a migration seam, and makes storage failure visible.

## Current state

All in `src/store/index.ts` unless stated.

- `partialize` (lines 728-737) currently persists the history stacks:
  ```ts
  partialize: (state) => ({
    sheets: state.sheets,
    currentSheetId: state.currentSheetId,
    widgets: state.widgets,
    canvasState: state.canvasState,
    themeSettings: state.themeSettings,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    clipboard: state.clipboard,
  }),
  ```
- The persist config (lines 725-746) has NO `version` and NO `migrate`. Its `name` is `"mind-space-store"`.
- Silent failure sites - both swallow quota errors with an empty comment:
  - `flushPendingWrites` (lines 155-164): `try { localStorage.setItem(name, value) } catch { /* storage full or unavailable */ }`
  - `debouncedStorage.setItem` (lines 183-194): same pattern inside a 300 ms `setTimeout`.
- `flushPendingWrites` clears `pendingWrites` but not `debounceTimers`, so after a flush the timer still fires and writes the same value again (harmless duplicate write today, but fix while here).
- `onRehydrateStorage` (lines 738-745) seeds default content via `setTimeout(initializeDefaultState, 0)` when `sheets.length === 0`.
- `src/app/layout.tsx` - root layout; providers nest as `ThemeProvider > ConfirmProvider > ToastProvider > {children}` (lines 36-40). A new listener component can be mounted inside `ToastProvider`.
- `src/components/ui/toast.tsx` (89 lines, not excerpted here) - the existing toast system. Open it and use whatever hook/API it exports. If it does not export a usable imperative API, see the escape hatch in step 4.
- Behavior change accepted by the maintainer: undo history will no longer survive a page reload. In-memory undo/redo is untouched.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope** (the only files you should modify or create):
- `src/store/index.ts`
- `src/store/persistence.test.ts` (create)
- `src/components/storage-error-listener.tsx` (create)
- `src/app/layout.tsx` (mount the listener only)

**Out of scope** (do NOT touch):
- Undo/redo action logic (`undo`, `redo`, `takeSnapshot`, the per-action snapshot pushes) - that is plan 004.
- Multi-tab sync (`storage` events) - known limitation, deferred.
- `partialize` handling of `clipboard` - keep persisting it.

## Git workflow

- Branch: `advisor/003-persistence-hardening`
- Commit style: `fix: stop persisting undo stacks, version the store, surface storage errors`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drop history stacks from persistence

In `partialize`, remove the `undoStack` and `redoStack` lines. Everything else stays.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Add version + migrate

In the persist config object, add:

```ts
version: 1,
migrate: (persisted: unknown, version: number) => {
  const state = persisted as Record<string, unknown>
  if (version < 1) {
    // v0 blobs carried full undo/redo history; strip it.
    delete state.undoStack
    delete state.redoStack
  }
  return state
},
```

Note: zustand persist stores `{ state, version }`; blobs written before this change have version 0, so existing users flow through the `version < 1` branch once.

**Verify**: `npm run typecheck` -> exit 0.

### Step 3: Make storage failures observable

- Add near the top of the module (after `pendingWrites`):
  ```ts
  let storageErrorReported = false
  function reportStorageError() {
    if (storageErrorReported || typeof window === "undefined") return
    storageErrorReported = true
    window.dispatchEvent(new CustomEvent("mind-space:storage-error"))
  }
  ```
- Call `reportStorageError()` inside BOTH empty catch blocks (in `flushPendingWrites` and in `debouncedStorage.setItem`'s timer). Keep the existing swallow-and-continue behavior otherwise.
- In `flushPendingWrites`, also clear the matching debounce timer for each flushed name: `clearTimeout(debounceTimers[name])` inside the loop, so the write is not repeated.

**Verify**: `npm run typecheck` -> exit 0.

### Step 4: Toast listener component

Create `src/components/storage-error-listener.tsx`: a `"use client"` component that returns `null`, and in a `useEffect` subscribes to `window` `"mind-space:storage-error"` and shows a persistent warning like: "Storage is full - recent changes may not be saved. Export or delete some content." Use the toast API exported by `src/components/ui/toast.tsx` (open it; find its hook/context and one existing usage via `grep -rn "toast" src/ --include="*.tsx" -l`).

Escape hatch: if the toast module has no callable API from an arbitrary component, instead render a fixed-position dismissible banner div styled with the repo's Tailwind utility conventions (see `src/components/ui/empty-state.tsx` for tone). Note which path you took in your report.

Mount it in `src/app/layout.tsx` inside `ToastProvider`, next to `{children}`. Touch nothing else in the layout.

**Verify**: `npm run build` -> exit 0.

### Step 5: Tests

Create `src/store/persistence.test.ts` (see Test plan).

**Verify**: `npx vitest run` -> all pass, including plan-001 suite (regression gate: dropping stacks from partialize must not break existing store tests).

## Test plan

In `src/store/persistence.test.ts`, reuse the `beforeEach` fixture pattern from `src/store/index.test.ts` (plan 001):

1. Persisted shape: after a store action, inspect what would be persisted. Simplest reliable route: call the exported migrate logic and partialize indirectly - set state with non-empty `undoStack`, run `useStore.persist.rehydrate()` against a seeded localStorage blob, or directly test that `JSON.parse(localStorage.getItem("mind-space-store")!).state` (after flushing with vitest fake timers past the 300 ms debounce) contains NO `undoStack`/`redoStack` keys.
2. Migration: seed `localStorage.setItem("mind-space-store", JSON.stringify({ state: { sheets: [...], widgets: {...}, currentSheetId: "s1", undoStack: ["x"], redoStack: [] }, version: 0 }))`, call `useStore.persist.rehydrate()`, assert the rehydrated store has `sheets` intact and empty in-memory `undoStack`.
3. Storage error event: stub `localStorage.setItem` to throw (`vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })`), add a window listener for `"mind-space:storage-error"`, trigger a store write plus fake-timer advance, assert the event fired exactly once across two failing writes.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -n "undoStack" src/store/index.ts` shows no match inside the `partialize` body
- [ ] Persist config contains `version: 1` and a `migrate` function
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the live code (drift), especially if plan 004 landed first and already changed the persist config - reconcile version numbers with what exists before writing anything.
- `useStore.persist.rehydrate()` is not available on the store instance (zustand persist API differs) after checking the installed zustand version's docs once.
- Plan-001 store tests fail after your changes.

## Maintenance notes

- Every future change to persisted shapes MUST bump `version` and extend `migrate`. Plan 004 bumps to version 2 for timer/stopwatch data - if you are executing after 004, versions must be sequential and both migrations must chain.
- Reviewer focus: the migrate function must never throw on garbage input (wrap risky access defensively).
- Deferred: multi-tab last-writer-wins clobbering; module-scope `window` listeners never unregistered (dev-HMR-only annoyance).
