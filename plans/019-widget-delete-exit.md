# 019 — Exit animation for widget delete

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 4-5 files (store, globals.css, base-widget.tsx, delete call sites), ~40 lines
- **Depends on**: plan 010 (`--ease-out`)

## Problem

Deleting a widget removes it from the store instantly (`deleteWidget` / `deleteWidgets`, `src/store/index.ts:398-450`) — the card vanishes with no confirmation of the destructive act. A brief scale-down+fade (the inverse of `widget-enter`) closes the loop.

## Target

- CSS:

  ```css
  @keyframes widget-exit {
    to { opacity: 0; transform: scale(0.95); }
  }
  .widget-exit {
    animation: widget-exit 150ms var(--ease-out) both;
    pointer-events: none;
  }
  ```

  Reduced-motion block (plan 014): redefine `@keyframes widget-exit { to { opacity: 0; } }`.
- Store: mark ids as exiting, remove for real after 160ms. History/undo unchanged — the snapshot is still taken by the existing delete actions at actual-removal time.

## Steps

1. `src/app/globals.css`: add keyframes + class near `.widget-enter`.
2. `src/store/index.ts`: add ephemeral `exitingWidgetIds: string[]` (initial `[]`, NOT in `partialize`) and two orchestration actions that wrap the existing ones (do not modify `deleteWidget`/`deleteWidgets` themselves):

   ```ts
   deleteWidgetAnimated: (sheetId, widgetId) => {
     const { exitingWidgetIds } = get()
     if (exitingWidgetIds.includes(widgetId)) return
     set({ exitingWidgetIds: [...exitingWidgetIds, widgetId] })
     setTimeout(() => {
       get().deleteWidget(sheetId, widgetId)
       set((s) => ({ exitingWidgetIds: s.exitingWidgetIds.filter((x) => x !== widgetId) }))
     }, 160)
   },
   deleteWidgetsAnimated: (sheetId, widgetIds) => { /* same shape over the array */ },
   ```

   Add both to the store interface.
3. `src/components/widgets/base-widget.tsx`: `const isExiting = useStore((s) => s.exitingWidgetIds.includes(widgetId))`; add `isExiting && "widget-exit"` to the root `cn`.
4. Swap call sites to the animated variants (keep args identical):
   - `src/components/widgets/widget-toolbar.tsx:156-157`
   - `src/components/widgets/widget-context-menu.tsx:190-191`
   - `src/hooks/use-keyboard-shortcuts.ts` — locate the Delete/Backspace handler calling `deleteWidget`/`deleteWidgets` and swap it.
   Then `grep -rn "deleteWidget" src/` — every remaining non-store hit must be intentional (e.g. none expected).

## Boundaries

- Do NOT change the history/snapshot logic inside the original delete actions.
- Do NOT persist `exitingWidgetIds`.
- Sheet deletion (`deleteSheet`) stays instant — out of scope.
- If an exiting widget's sheet is switched away mid-animation, the timeout still fires and deletes — that's correct; do not add sheet checks.

## Verification

- **Mechanical**: `npx next build`; localStorage has no `exitingWidgetIds`.
- **Feel check**: delete a widget from the toolbar menu → it shrinks/fades 150ms then disappears; clicks on it during exit do nothing. Multi-select 3 widgets, press Delete → all three exit together. Spam delete on the same widget → single deletion, no error. Ctrl+Z → widget returns (statically, per plan 012).
- **Done when**: every delete path plays the exit, undo restores exactly one state step, double-delete is a no-op.
