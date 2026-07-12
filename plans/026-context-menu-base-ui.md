# Plan 026: Context menu on Base UI - position fix, hover submenus, multi-select variant

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/025-gap-snapping` (stacked
> chain). Confirm `src/components/widgets/widget-context-menu.tsx` matches the
> excerpt below and `base-widget.tsx` has `handleContextMenu` setting
> `ctxMenu {open, x, y}` state. Mismatch = STOP.

## Status

- **Priority**: P1 (contains a confirmed bug fix) | **Effort**: M | **Risk**: LOW-MED
- **Depends on**: plan 025 branch (chain order only - no code dependency)
- **Planned at**: 2026-07-12

## Why this matters

Three user-reported issues, one component:

1. **BUG (runtime-confirmed 2026-07-12)**: the context menu opens far from the pointer when the canvas is panned/zoomed. Repro measured: at `translate(-259.9px, -185px) scale(1.35)`, right-click at client (-17, 38) rendered the menu at (-283, -134) - offset (-266, -172). Root cause: the menu div uses `position: fixed` with `left/top = clientX/Y`, but it renders INSIDE the canvas's transformed layer (BaseWidget subtree). A transformed ancestor becomes the containing block for fixed-position descendants, so the menu is shifted by the pan offset and scaled. At scale 1 / offset 0 the transform is identity and the bug is invisible.
2. Color palette is a stateful in-place swap ("Back" button); it should be a nested submenu opening on hover per menu UI conventions.
3. Right-click on a multi-selection shows the same menu; Rename makes no sense there, and labels should reflect the selection.

Library decision (maintainer-confirmed 2026-07-12): use **`@base-ui/react`** (v1.6+). shadcn/ui made Base UI its default library in July 2026; Base UI's `ContextMenu` renders via `Portal` (fixes the positioning bug structurally - the popup mounts at body level, outside the transform), has `SubmenuRoot`/`SubmenuTrigger` with `openOnHover`, pointer positioning via `Positioner`, and WAI-ARIA menu keyboard behavior built in. Existing Radix components stay - the two libraries coexist; do NOT migrate anything else.

## Current state (verified excerpts)

`src/components/widgets/widget-context-menu.tsx` (hand-rolled, ~200 lines):
- Props: `{ widgetId, open, x, y, onClose, onStartRename }`.
- Renders `<div role="menu" className="fixed z-50 min-w-[176px] rounded-lg border bg-popover p-1 shadow-md" style={{ left: x, top: y }}>` - the fixed-inside-transform bug.
- `showPalette` state swaps the menu body to `<WidgetColorPalette currentId onSelect>` with a Back button; color select calls `useStore.getState().updateWidget(widgetId, { colorTheme: id === "default" ? undefined : id })`.
- `handleAction(widgetId, selectedIds, onClose, action, multiAction)` already routes to `duplicateWidgets`/`deleteWidgets` when the target is part of a multi-selection - reuse this logic.
- Hand-rolled `useOutsideClick` + `useMenuKeyboard` (arrow/escape/focus) hooks - deleted with the rewrite.
- NOTE: this file carries one of the two known pre-existing `react-hooks/set-state-in-effect` lint errors; the rewrite should eliminate it naturally. (`theme-toggle.tsx` keeps the other - out of scope.)

`src/components/widgets/base-widget.tsx`: `handleContextMenu` does `e.preventDefault(); e.stopPropagation(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY })`; renders `<WidgetContextMenu widgetId={...} open x y onClose onStartRename={handleStartRename} />` inside the card (inside the transformed layer).

`src/components/widgets/widget-color-palette.tsx`: presentational swatch grid, `{ currentId, onSelect }` - reusable inside a submenu popup as-is.

Store: `updateWidget(id, updates)` pushes one history entry per call. For "color N widgets in one undo step" add `updateWidgets(ids: string[], updates)` - single `set()`, one `pushHistoryEntry`, modeled exactly on the existing `moveWidgets` batch action added by the 023 amendment (`src/store/index.ts`).

## Steps

1. `npm install @base-ui/react` (one package; check `package.json` diff shows only it + lockfile).
2. Read Base UI ContextMenu docs first: https://base-ui.com/react/components/context-menu (parts: Root, Trigger, Portal, Positioner, Popup, Item, Separator, SubmenuRoot, SubmenuTrigger with `openOnHover`).
3. **Rewrite `widget-context-menu.tsx`** on Base UI parts, styled with the existing tokens (`bg-popover`, `hover:bg-accent`, `text-destructive`, same paddings/rounding so it looks unchanged):
   - Single-widget menu: Rename / Duplicate / Color (submenu, `openOnHover`) / separator / Delete.
   - Color submenu popup hosts `WidgetColorPalette`; select applies and closes.
   - Multi-select variant (when `selectedWidgetIds.includes(widgetId) && length > 1`): NO Rename; items read `Duplicate <N> widgets`, `Color` (applies to all via new `updateWidgets`), `Delete <N> widgets`. Reuse/replace the `handleAction` routing.
4. **Trigger wiring in `base-widget.tsx`**: prefer Base UI's own `ContextMenu.Trigger` wrapping the card content (its `render` prop merges onto the existing div) so open/close state moves into the library; keep `e.stopPropagation()` so the canvas never sees widget right-clicks. If the render-prop merge fights the existing pointer handlers, fall back to controlled open + a `Positioner` anchored to the pointer coordinates - either way the popup MUST render through `Portal` (verify in DOM: popup is a child of body, not of the transformed layer). Remove the now-dead `ctxMenu` state if Trigger owns it.
5. **Store**: add `updateWidgets(ids, updates)` batch action + interface line, mirroring `moveWidgets` (one entry; skip unknown ids).
6. **Tests**: store test for `updateWidgets` (applies to all ids, ONE undo entry, undo restores all colorThemes). Component-level menu tests are not required (no component test infra exists) - runtime verification covers it.
7. **Runtime verification** (REQUIRED, record numbers):
   - THE BUG: pan the canvas ~(-260, -185) and zoom to ~135% (ctrl+wheel), right-click a widget: menu top-left corner within a few px of the pointer. Record click vs menu coords (before-fix repro was offset -266/-172).
   - Hover "Color": submenu opens on hover without click, swatches apply, menu closes.
   - Keyboard: arrows traverse, right-arrow enters submenu, Escape closes (Base UI built-ins - just confirm they work in-app).
   - Multi-select 3 widgets, right-click one: no Rename; "Duplicate 3 widgets" works; "Delete 3 widgets" works; Color applies to all 3 and ONE undo reverts all 3.
   - Right-click NOT on a selected widget while a selection exists: single-widget menu targets the clicked widget (matches current `handleAction` semantics).
   - Outside-click and Escape close; canvas marquee/pan don't fire while the menu is open.
8. **Screenshots**: menu with Color submenu open (hover); multi-select variant.

## Gates & conventions

`npm install` first. `npm run typecheck` clean; `npm run test` all green (baseline = 025's count + your new store test). Lint: `widget-context-menu.tsx`'s pre-existing error must be GONE after the rewrite; only `theme-toggle.tsx` may still fail. Double quotes, no semicolons, no em-dashes anywhere, no AI signatures. Do not push.

## Done criteria

Diff touches only: `package.json`+lockfile, `src/components/widgets/widget-context-menu.tsx`, `src/components/widgets/base-widget.tsx`, `src/store/index.ts` (+ its test), optionally `src/components/widgets/widget-color-palette.tsx` (only if submenu embedding needs a prop), `docs/screenshots/`. Popup verified to mount outside the transformed layer. All step-7 checks reported.

## STOP conditions

Drift check fails; `@base-ui/react` ContextMenu API differs materially from the docs above (report what you found); Base UI popup cannot be made to position at the pointer under pan/zoom (report measurements); any temptation to migrate other Radix components.

## Out of scope

Migrating existing Radix components; canvas-level (empty area) context menu; touch long-press menu.
