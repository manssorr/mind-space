# Plan 006: Cut canvas re-renders during drag; consolidate pointer gestures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/components/canvas/index.tsx src/components/widgets/base-widget.tsx src/hooks/use-keyboard-shortcuts.ts`
> Plan 004 may have touched hooks/widgets; reconcile against live code. Any
> unexplained mismatch with the excerpts below is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-verification-baseline.md, plans/004-history-undo-overhaul.md
- **Category**: perf
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

Every widget drag frame updates the store, and the `Canvas` component subscribes to the entire `widgets` record, so all canvas derivation re-runs per pointermove. Each `BaseWidget` also subscribes to the whole `selectedWidgetIds` array, so every selection change re-renders every widget. Separately, pointer gestures live in three places (Canvas React handlers, Canvas capture-phase listeners, and pointer listeners inside the keyboard-shortcuts hook). Runtime verification (2026-07-11, synthetic space+drag) showed the two pan handlers shadow each other rather than double-apply - each computes an absolute offset from its own snapshot, so pan speed is correct 1:1. The cost is redundant per-move work and fragile duplicated state, not a visible bug. This plan is a perf + consolidation refactor, not a bug fix.

## Current state

- `src/components/canvas/index.tsx`:
  - Lines 21-24, broad subscriptions:
    ```ts
    const currentSheetId = useStore((s) => s.currentSheetId)
    const sheets = useStore((s) => s.sheets)
    const widgetsRecord = useStore((s) => s.widgets)
    const canvasState = useStore((s) => s.canvasState)
    ```
  - Lines 34-40: `sheetWidgets` memo maps `currentSheet.widgetOrder` over `widgetsRecord` - invalidated on every widget change.
  - Lines 47-127: React `handlePointerDown/Move/Up` implementing pan + pinch. `handlePointerDown` starts panning for any primary-button press not on a `[data-widget]` element - it does NOT check whether Space-pan is active.
  - Lines 129-161: a `useEffect` adds capture-phase `pointerdown/up/cancel` listeners on the same container feeding the same `activePointers`/`isPinching` refs (touch-pinch support when the gesture starts over a widget).
  - Lines 204-224: renders `sheetWidgets.map(widget => ... <BaseWidget widgetId={widget.id} hideTitle={widget.type === "text"}><WidgetComponent widgetId={widget.id} /></BaseWidget>)` where `WidgetComponent = widgetComponents[widget.type as WidgetType]`, with an inline fallback block for unknown types (lines 211-220).
  - Line 227: empty state gated on `sheetWidgets.length === 0 && currentSheetId`.
- `src/components/widgets/base-widget.tsx`:
  - Line 20: `export const BaseWidget = memo(function BaseWidget(...)` - already memoized.
  - Lines 34-35:
    ```ts
    const widget = useStore((s) => s.widgets[widgetId])
    const selectedWidgetIds = useStore((s) => s.selectedWidgetIds)
    ```
  - Line 45: `const isSelected = selectedWidgetIds.includes(widgetId)`.
- `src/hooks/use-keyboard-shortcuts.ts` (attached by Canvas at line 27):
  - Lines 16-83: command shortcuts (Space cursor, Delete, undo/redo, duplicate, copy/paste) on `window` keydown.
  - Lines 97-126: `handlePointerDown/Move/Up` implementing SPACE-pan on the container (`spaceHeld` ref gate).
  - Lines 128-142: wheel-zoom handler.
  - Lines 144-160: listener registration for all of the above.
- `src/components/widgets/widget-registry.tsx`: `widgetComponents: Partial<Record<WidgetType, ComponentType<{ widgetId: string }>>>`.
- Conventions: hooks in `src/hooks/`, double quotes, no semicolons.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |
| Manual    | `npm run dev`          | behaviors in step 4 |

## Scope

**In scope** (the only files you should modify or create):
- `src/components/canvas/index.tsx`
- `src/components/widgets/base-widget.tsx`
- `src/hooks/use-canvas-gestures.ts` (create)
- `src/hooks/use-keyboard-shortcuts.ts`

**Out of scope** (do NOT touch):
- The store (`src/store/index.ts`) - selector-side changes only.
- Widget components other than `base-widget.tsx`.
- `use-widget-drag.ts` / `use-widget-resize.ts` (plan 004 owns their behavior).

## Git workflow

- Branch: `advisor/006-canvas-render-perf`
- Commits per step, style: `perf: ...` / `fix: remove space-pan double apply`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Narrow BaseWidget selection subscription

In `base-widget.tsx`, replace the `selectedWidgetIds` subscription + derived `isSelected` with a boolean selector:

```ts
const isSelected = useStore((s) => s.selectedWidgetIds.includes(widgetId))
```

Remove the now-unused `selectedWidgetIds` variable; update the `handlePointerDown` dependency array accordingly.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Stop Canvas from subscribing to the whole widgets record

Goal: `Canvas` re-renders on sheet/order/viewport changes only, not on every widget x/y update. Restructure:

1. Create a small `CanvasWidget` component (in `canvas/index.tsx` is fine) that owns per-widget lookups:
   ```tsx
   const CanvasWidget = memo(function CanvasWidget({ widgetId }: { widgetId: string }) {
     const type = useStore((s) => s.widgets[widgetId]?.type)
     const title = useStore((s) => s.widgets[widgetId]?.title)
     if (!type) return null
     const WidgetComponent = widgetComponents[type as WidgetType]
     return (
       <div data-widget>
         <BaseWidget widgetId={widgetId} hideTitle={type === "text"}>
           {WidgetComponent ? <WidgetComponent widgetId={widgetId} /> : /* existing fallback block, using type/title */}
         </BaseWidget>
       </div>
     )
   })
   ```
   Move the existing unknown-type fallback JSX (current lines 211-220) into it.
2. In `Canvas`, replace the `sheets`/`widgetsRecord` subscriptions with:
   ```ts
   const widgetOrder = useStore((s) => s.sheets.find((sh) => sh.id === s.currentSheetId)?.widgetOrder)
   ```
   and render `widgetOrder?.map((id) => <CanvasWidget key={id} widgetId={id} />)`.
   Caution: this selector returns an array reference that only changes when `sheets` changes - `moveWidget` does not touch `sheets`, so drags no longer re-render Canvas. Do NOT construct a new array inside the selector (no `.map`/`.filter` there), or it will re-render every store change and zustand v5 will warn about unstable snapshots.
3. Empty state: `widgetOrder.length === 0` replaces `sheetWidgets.length === 0`. Remove the now-dead `currentSheet`/`sheetWidgets` memos.

**Verify**: `npm run typecheck` -> exit 0; `npm run build` -> exit 0.

### Step 3: Consolidate gestures

Create `src/hooks/use-canvas-gestures.ts` that owns ALL pointer/space/wheel logic for the canvas container, merging:
- Canvas's React pan/pinch handlers (current lines 47-127),
- Canvas's capture-phase pinch listeners (129-161),
- the space-pan pointer handlers and wheel-zoom from `use-keyboard-shortcuts.ts` (97-142), plus the Space keydown/keyup pieces that manage `spaceHeld` and cursor (lines 21-28 and 85-95).

Shape: `useCanvasGestures(containerRef)` returns `{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }` for the container div and registers its own window/container listeners in one `useEffect` with full cleanup. Inside, ONE `isPanning` state serves both entry paths (empty-canvas drag, space+drag anywhere); a single pointermove applies the delta once. Behavior rules to preserve, verbatim from today:

- Two pointers anywhere -> pinch-zoom (scale clamp 0.1-5, midpoint-anchored), including when the gesture starts over a widget (that is what the capture-phase listeners enable).
- Primary-button drag on empty canvas -> pan; on a `[data-widget]` element -> no pan (unless Space held).
- Space held -> pan from anywhere, cursor `grab`/`grabbing`, and suppressed while typing in inputs (`isInput` check).
- Wheel -> zoom to cursor, `{ passive: false }` + `preventDefault`.
- `deselectAll()` on empty-canvas pointerdown (current Canvas behavior, line 67).

Then: strip everything pointer/wheel/Space-related from `use-keyboard-shortcuts.ts` (keep Delete/undo/redo/duplicate/copy/paste keydown handling), and replace Canvas's inline handlers + capture-effect with the new hook. `use-keyboard-shortcuts` keeps its name and remains attached in Canvas.

**Verify**: `npm run typecheck` -> exit 0; `grep -n "pointerdown" src/hooks/use-keyboard-shortcuts.ts` -> no matches.

### Step 4: Manual behavior check

`npm run dev`, open the app route:

1. Space+drag on empty canvas -> pan follows the cursor 1:1 (drag 200 px, content moves ~200 px at 100% zoom). This matched pre-refactor behavior in runtime verification; it must not regress when one handler replaces two.
2. Plain drag on empty canvas pans; drag on a widget moves the widget, never the canvas.
3. Wheel-zoom zooms toward the cursor; pinch works on a touch device/emulation, including starting over a widget.
4. Shift+click multi-select still works; Delete/Ctrl+Z/Ctrl+D/Ctrl+C/Ctrl+V still work; Space in a text input types a space (no pan).
5. With ~15 widgets on a sheet, dragging one is visibly smooth; React DevTools Profiler (if available) shows Canvas itself NOT re-rendering during the drag.

**Verify**: all behaviors as described; two failed fix attempts on any = STOP.

## Test plan

Gesture logic is DOM-event-heavy; automated coverage is limited to what plan-001 infrastructure supports without component testing:

- Existing store suites must stay green (`npx vitest run`).
- No new unit tests required by this plan; the manual checklist in step 4 is the acceptance gate. Record each item's result in your report.

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `grep -n "s.widgets)" src/components/canvas/index.tsx` -> no whole-record subscription remains
- [ ] `grep -c "addEventListener" src/hooks/use-keyboard-shortcuts.ts` -> 2 (keydown + keyup only)
- [ ] Manual checklist (step 4) reported item by item
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Pinch or space-pan cannot be reproduced/verified in your environment - deliver steps 1-2 only, mark step 3 BLOCKED in the index with the reason, and leave gesture files untouched.
- The zustand selector in step 2 warns about getSnapshot instability after one fix attempt.
- Keyboard shortcuts break in manual testing after gesture extraction.

## Maintenance notes

- Future gesture features (marquee selection, right-drag pan) belong in `use-canvas-gestures.ts` - one owner for pointer state.
- Reviewer focus: listener cleanup symmetry in the new hook (every add has a matching remove; capture flags match), and the `[data-widget]` hit-test semantics being unchanged.
- Deferred: `React.useSyncExternalStore`-level optimizations or transient (non-store) drag positions; only justified if profiling still shows jank after this lands.
