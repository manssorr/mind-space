# Plan 004: Make timers stop destroying undo history; make drags undoable; timestamp-based timing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/store/index.ts src/components/widgets/timer-widget.tsx src/components/widgets/stopwatch-widget.tsx src/hooks/use-widget-drag.ts src/hooks/use-widget-resize.ts`
> Plans 001 and 003 are expected to have landed (test files exist, persist has
> `version: 1`). Any OTHER drift in these files vs the excerpts below is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-verification-baseline.md, plans/003-persistence-hardening.md
- **Category**: bug + perf
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

Three composed defects around one root cause - `updateWidget` pushes a full-state undo snapshot and clears the redo stack on EVERY call:

1. The timer widget calls `updateWidget` every 100 ms while running; the stopwatch every 10 ms. A running stopwatch fills the 50-entry undo stack in 0.5 s, so undo becomes useless for the whole app whenever any timer/stopwatch runs, and full-state serialization runs at 10-100 Hz.
2. The timer counts down by decrementing 0.1 per tick. Browsers throttle background-tab intervals to >= 1 s (or freeze them), so a timer in a background tab under-counts badly. (Runtime note 2026-07-11: not reproducible in the CDP automation browser, which never hides tabs - MED confidence, verify in a real browser. The timestamp redesign below is justified regardless: it makes remaining time survive reload/tab-close, and tick-decrement can never do that.)
3. Drags/resizes push NO snapshot at all, so a drag is not individually undoable: undo after a drag reverts the drag AND the action before it together.

Fix: widgets store timing as timestamps and only write to the store on state transitions; drags record exactly one snapshot at interaction start.

## Current state

- `src/store/index.ts`:
  - `takeSnapshot` (lines 66-68): `JSON.stringify({ sheets, widgets, currentSheetId })`.
  - `updateWidget` (lines 382-396) pushes `takeSnapshot(...)` onto `undoStack` and sets `redoStack: []` on every call.
  - `moveWidget` (452-463), `resizeWidget` (465-476), `reorderSheetWidgets` (354-360): no snapshot.
  - `undo` (699-710) / `redo` (712-723): `JSON.parse(undoStack[undoStack.length - 1])` with NO try/catch.
  - After plan 003: persist config has `version: 1` and a `migrate` that strips v0 history stacks.
- `src/components/widgets/timer-widget.tsx` - data shape `{ duration, remaining, running, paused }`; the ticking effect (lines 30-49):
  ```ts
  useEffect(() => {
    if (!running || paused) return
    const interval = setInterval(() => {
      const w = useStore.getState().widgets[widgetId]
      if (!w) return
      const d = getWidgetData<TimerData>(w)
      const newRemaining = Math.max(0, (d.remaining ?? duration) - 0.1)
      if (newRemaining <= 0) {
        updateWidget(widgetId, { data: { ...d, remaining: 0, running: false, paused: false } })
        clearInterval(interval)
      } else {
        updateWidget(widgetId, { data: { ...d, remaining: Number(newRemaining.toFixed(1)) } })
      }
    }, 100)
    return () => clearInterval(interval)
  }, [running, paused, widgetId, updateWidget, duration])
  ```
  Handlers: `handleStart`, `handlePause`, `handleResume`, `handleReset`, `handleFinishEdit` (sets `duration`).
- `src/components/widgets/stopwatch-widget.tsx` - data shape `{ elapsed, running, paused, laps }`; ticking effect (lines 48-58) calls `updateWidget(widgetId, { data: { ...d, elapsed: performance.now() - start } })` every **10 ms**.
- `src/hooks/use-widget-drag.ts` - `handlePointerMove` lazily initializes `dragIds.current` on the FIRST move event (lines 33-46), then calls `state.moveWidget(...)` per move. `handlePointerUp` (69-71) only resets `isDragging`.
- `src/hooks/use-widget-resize.ts` - `handlePointerDown` (27-44) captures start rect; `handlePointerMove` (46-89) calls `state.moveWidget` + `state.resizeWidget` per move. No "first move" latch exists yet.
- `src/lib/widget-utils.ts` - `getWidgetData<T>(widget)` casts `widget?.data ?? {}` to `T`.
- Conventions: double quotes, no semicolons; widgets are `memo(...)` function components reading their own slice via `useStore((s) => s.widgets[widgetId])`.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |
| Manual    | `npm run dev`          | behaviors in step 7 |

## Scope

**In scope** (the only files you should modify or create):
- `src/store/index.ts`
- `src/components/widgets/timer-widget.tsx`
- `src/components/widgets/stopwatch-widget.tsx`
- `src/hooks/use-widget-drag.ts`
- `src/hooks/use-widget-resize.ts`
- `src/store/history.test.ts` (create)
- `src/store/index.test.ts` (only if a characterization case must be updated - document each change)

**Out of scope** (do NOT touch):
- `partialize` / storage plumbing (plan 003 owns it).
- Canvas/selector rendering (plan 006).
- Any other widget component.

## Git workflow

- Branch: `advisor/004-history-undo-overhaul`
- Commits per step, style: `fix: <what>` (e.g. `fix: record undo snapshot at drag start`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add non-snapshotting update + explicit snapshot actions to the store

In `src/store/index.ts`, add to the `StoreState` interface and implementation:

```ts
// interface
updateWidgetSilent: (id: string, updates: Partial<Widget>) => void
recordSnapshot: () => void

// implementation (next to updateWidget)
updateWidgetSilent: (id, updates) => {
  set((state) => {
    const widget = state.widgets[id]
    if (!widget) return state
    return { widgets: { ...state.widgets, [id]: { ...widget, ...updates } } }
  })
},

recordSnapshot: () => {
  set((state) => ({
    undoStack: [...state.undoStack, takeSnapshot(state.sheets, state.widgets, state.currentSheetId)].slice(-MAX_HISTORY),
    redoStack: [],
  }))
},
```

**Verify**: `npm run typecheck` -> exit 0; `npx vitest run` -> plan-001 suite still passes.

### Step 2: Guard undo/redo JSON.parse

Wrap the `JSON.parse` in both `undo` and `redo` in try/catch. On parse failure: drop the corrupt entry (pop it off the stack via a `set`) and return without applying. Shape:

```ts
undo: () => {
  const { undoStack, redoStack, sheets, widgets, currentSheetId } = get()
  if (undoStack.length === 0) return
  let previous: Snapshot
  try {
    previous = JSON.parse(undoStack[undoStack.length - 1])
  } catch {
    set({ undoStack: undoStack.slice(0, -1) })
    return
  }
  // ... unchanged rest
}
```

Mirror for `redo`.

**Verify**: `npm run typecheck` -> exit 0.

### Step 3: Timestamp-based timer

Rework `TimerData` to `{ duration: number; endsAt: number | null; pausedRemaining: number | null }`:

- Running: `endsAt` is an epoch-ms deadline; remaining = `(endsAt - Date.now()) / 1000`.
- Paused: `endsAt: null`, `pausedRemaining` holds seconds left.
- Stopped/idle: both null; remaining defaults to `duration`.

Component changes:
- The ticking effect keeps a 100 ms `setInterval`, but it only updates LOCAL state (`useState` holding the displayed remaining, computed from `endsAt`); it makes NO store call while ticking.
- When computed remaining hits <= 0 while running: one `updateWidget` (normal, snapshotting is fine here) setting `{ endsAt: null, pausedRemaining: null }` plus whatever completed-state display needs; keep the existing "complete" render (destructive color + pulse).
- `handleStart`: `updateWidget` with `endsAt: Date.now() + remainingSeconds * 1000`.
- `handlePause`: `updateWidget` with `endsAt: null, pausedRemaining: <computed remaining>`.
- `handleResume`: like start, from `pausedRemaining`.
- `handleReset` / `handleFinishEdit`: analogous, both null.
- Derive `running = endsAt != null`, `paused = pausedRemaining != null` for the existing button logic.
- Reload behavior for free: a timer that expired while the tab was closed shows 00:00 complete on next load (compute on mount).

**Verify**: `npm run typecheck` -> exit 0.

### Step 4: Timestamp-based stopwatch

Rework `StopwatchData` to `{ startedAt: number | null; accumulated: number; laps: number[] }` (`accumulated` in ms):

- Running: `startedAt` set; elapsed = `accumulated + (Date.now() - startedAt)`.
- Paused/stopped: `startedAt: null`; elapsed = `accumulated`.
- Ticking effect: local display state on a 50 ms interval, NO store writes while running.
- Start/stop/pause/reset/lap handlers: single `updateWidget` each. Laps push `elapsed` at that moment onto `laps` (read the rest of the current file for the lap/reset semantics and keep them).

**Verify**: `npm run typecheck` -> exit 0; `grep -n "updateWidget" src/components/widgets/stopwatch-widget.tsx` -> appears only in event handlers, not inside the interval callback. Same grep for `timer-widget.tsx`.

### Step 5: Migrate persisted widget data (version 2)

In the persist config (currently `version: 1` from plan 003): bump to `version: 2` and extend `migrate` so `version < 2` converts every widget's data:

- `type === "timer"`: `{ duration, remaining, running, paused }` -> `{ duration: duration ?? 300, endsAt: null, pausedRemaining: remaining ?? null }` (running timers become paused at their last remaining - safe default).
- `type === "stopwatch"`: `{ elapsed, running, paused, laps }` -> `{ startedAt: null, accumulated: elapsed ?? 0, laps: laps ?? [] }`.

Keep the `version < 1` branch intact; branches chain.

**Verify**: `npm run typecheck` -> exit 0.

### Step 6: One undo snapshot per drag/resize

- `use-widget-drag.ts`: inside the `if (dragIds.current.length === 0)` first-move block (before any `moveWidget` call), call `useStore.getState().recordSnapshot()`.
- `use-widget-resize.ts`: add a `hasResized = useRef(false)`; set false in `handlePointerDown`; in `handlePointerMove`, on the first actual move (`!hasResized.current`), call `recordSnapshot()` and set the ref true.
- `src/store/index.ts` `reorderSheetWidgets`: add the same snapshot push + `redoStack: []` the other snapshotting actions use.

**Verify**: `npx vitest run` -> plan-001 cases 5 and 6 still pass (moveWidget/resizeWidget themselves still snapshot-free; the snapshot comes from the hooks).

### Step 7: Manual behavior check

Run `npm run dev`, open http://localhost:3000/app (the canvas app route):

1. Start a stopwatch, wait 3 s, press Ctrl+Z once -> the stopwatch START action is undone; nothing else. Undo again -> the action before it undoes normally.
2. Start a timer, switch to another browser tab for ~65 s, return -> displayed remaining dropped by ~65 s (no freeze).
3. Drag a widget, release, Ctrl+Z -> widget returns exactly to its pre-drag position. Redo -> back to dropped position.
4. Resize a widget, Ctrl+Z -> pre-resize rect restored.

**Verify**: all four behaviors as described. If any fail, fix before proceeding; two failed fix attempts = STOP.

### Step 8: Tests

Write `src/store/history.test.ts` (see Test plan).

**Verify**: `npm run verify` -> exit 0; `npm run build` -> exit 0.

## Test plan

`src/store/history.test.ts`, reusing the plan-001 fixture pattern:

1. `updateWidgetSilent` changes the widget, `undoStack.length` unchanged, `redoStack` preserved.
2. `recordSnapshot` pushes one entry and clears `redoStack`; `undo` after `recordSnapshot` + `moveWidget` restores pre-move positions.
3. Corrupt-entry guard: `useStore.setState({ undoStack: ["not json"] })`, call `undo()` -> no throw, stack emptied, state otherwise unchanged.
4. `reorderSheetWidgets` pushes a snapshot; `undo` restores prior `widgetOrder`.
5. Migration v1 -> v2: seed a `mind-space-store` blob (version 1) containing one timer widget `{ duration: 60, remaining: 30, running: true, paused: false }` and one stopwatch `{ elapsed: 1234, running: true, laps: [100] }`; `useStore.persist.rehydrate()`; assert timer data is `{ duration: 60, endsAt: null, pausedRemaining: 30 }` and stopwatch is `{ startedAt: null, accumulated: 1234, laps: [100] }`.
6. Timer math (pure): fake `Date.now` via `vi.setSystemTime`; assert remaining derivation from `endsAt` (export a small helper from the widget file or `src/lib/` if needed to keep it testable).

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `grep -n "updateWidget(" src/components/widgets/timer-widget.tsx src/components/widgets/stopwatch-widget.tsx` -> no call sites inside `setInterval` callbacks
- [ ] Persist config shows `version: 2` with chained migrations
- [ ] Manual checks in step 7 all pass (state them in your report)
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 003 has not landed (persist config has no `version`) - execute 003 first or report.
- The live widget data shapes differ from the excerpts (drift).
- Undo behaves wrongly after step 6 in manual testing after two fix attempts.
- You find other components calling `updateWidget` in a loop/interval (grep first: `grep -rn "setInterval" src/components/`) - report them; do not expand scope.

## Maintenance notes

- Any future widget with continuous updates (drawing, drag-internal state) must use `updateWidgetSilent` + an explicit `recordSnapshot` at interaction start. Consider documenting this rule in AGENTS.md later.
- Reviewer focus: migration correctness (old running timers must not resurrect as running), and that `recordSnapshot` fires exactly once per drag (not per move event).
- Deferred: coalescing rapid consecutive text edits into one undo entry (note widget writes one snapshot per 400 ms debounce flush today - acceptable).
