# 012 — Play widget-enter only for newly created widgets

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 2 files (store/index.ts, base-widget.tsx), ~25 lines

## Problem

Every `BaseWidget` root unconditionally carries the entrance animation class:

```tsx
// src/components/widgets/base-widget.tsx:97-101 — current
<div
  className={cn(
    "absolute rounded-xl border bg-card text-card-foreground shadow-sm select-none group flex flex-col widget-enter",
    isSelected && "shadow-md"
  )}
```

`widget-enter` (globals.css) animates 200ms zoom+drop on mount. Widgets remount whenever their sheet renders fresh — so **every sheet switch replays the entrance on every widget on the target sheet**, and undo/redo of deletions replays it too. Sheet switching is a tens-of-times-per-day action; per the frequency rule that motion has to go. The animation should mark one thing: "this widget just came into existence."

## Target

The store tracks which widget ids were just created (add / duplicate / paste). Only those get `widget-enter`, and the marker clears when the animation finishes, so later remounts (sheet switch, undo) render statically.

## Repo conventions to follow

- Ephemeral UI state lives in the store but stays OUT of `partialize` (`src/store/index.ts:728-737`) — `selectedWidgetIds` is the precedent. Do NOT add the new field to `partialize`.
- Actions are defined inline in the `persist(...)` factory; follow the style of `deselectAll` (`store/index.ts:608-610`).

## Steps

1. `src/store/index.ts`: add to the store interface (near `selectedWidgetIds`):

   ```ts
   enteringWidgetIds: string[]
   clearEnteringWidget: (id: string) => void
   ```

   Initialize `enteringWidgetIds: []` next to the other initial state, and implement:

   ```ts
   clearEnteringWidget: (id) => {
     set((state) => ({
       enteringWidgetIds: state.enteringWidgetIds.filter((x) => x !== id),
     }))
   },
   ```

2. Mark new ids in the creating actions (each already exists; add one property to the object each returns from `set`):
   - `addWidget` (line 362): `enteringWidgetIds: [...state.enteringWidgetIds, widget.id],`
   - `duplicateWidget` (line 520): same with the newly generated id,
   - `duplicateWidgets` (line 478): spread all newly generated ids,
   - if a paste action exists (`pasteWidgets` near `copyWidgets`, line 628): same with the pasted ids.
3. `src/components/widgets/base-widget.tsx`:
   - subscribe: `const isEntering = useStore((s) => s.enteringWidgetIds.includes(widgetId))`
   - line 99: remove `widget-enter` from the static string; add `isEntering && "widget-enter"` as a `cn` argument.
   - on the same root div add:

     ```tsx
     onAnimationEnd={(e) => {
       if (e.animationName === "widget-enter") {
         useStore.getState().clearEnteringWidget(widgetId)
       }
     }}
     ```

## Boundaries

- Do NOT touch `partialize` — the field must not persist.
- Do NOT change the `widget-enter` CSS itself (plan 010 owns globals.css).
- Do NOT alter undo/redo logic or history snapshots.
- If store line numbers have drifted, locate actions by name; if an action's shape differs materially from described, STOP and report.

## Verification

- **Mechanical**: `npx next build` passes. `localStorage` entry `mind-space-store` contains no `enteringWidgetIds` key after adding a widget.
- **Feel check**: `npm run dev`, `/app`:
  - add a widget → it plays the 200ms entrance once,
  - switch to another sheet and back → NO widget animates,
  - duplicate a widget → only the copy animates, not the original,
  - delete a widget, Ctrl+Z → the restored widget appears without the entrance animation,
  - reload the page → nothing animates in.
- **Done when**: the entrance plays exactly once per created widget and never on sheet switch, undo, or reload.
