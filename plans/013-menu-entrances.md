# 013 — Entrance animation for the four hand-rolled menus

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 5 files (globals.css + 4 components), ~15 lines
- **Depends on**: plan 010 (`--ease-out` token)

## Problem

Four hand-rolled menus mount with zero animation — they pop into existence while dialogs and toasts (after plan 010) animate. Inconsistent, and popping popovers feel cheap:

- widget actions menu — `src/components/widgets/widget-toolbar.tsx:128-130` (`absolute right-0 top-full … bg-popover`)
- right-click context menu — `src/components/widgets/widget-context-menu.tsx:103-107` (`fixed … bg-popover` at cursor)
- add-widget menu — `src/components/canvas/add-widget-button.tsx:80-83` (`absolute bottom-full right-0 … bg-popover`)
- sheet tab actions menu — `src/components/sheets/sheet-sidebar.tsx:200-210` — this one already sets `origin-top-right` / `origin-bottom-right` (line 206) for a scale animation that was never written.

Per the physicality rule, popovers scale from their trigger, subtly (never `scale(0)`), 150-250ms, strong ease-out.

## Target

One shared entrance class in globals.css:

```css
@keyframes menu-in {
  from { opacity: 0; transform: scale(0.96); }
}

.menu-enter {
  animation: menu-in 150ms var(--ease-out) both;
}
```

Each menu gets `menu-enter` plus a `transform-origin` matching its trigger side. No exit animation (menus unmount on outside-click; instant close is fine and keeps scope tight).

## Repo conventions to follow

- Plain CSS animation classes live at the bottom of `src/app/globals.css` next to `.widget-enter` (plan 010's layout).
- Tailwind origin utilities (`origin-top-right` etc.) — the sheet menu already uses them.

## Steps

1. `src/app/globals.css`: add the `menu-in` keyframes and `.menu-enter` class after `.widget-enter`.
2. `widget-toolbar.tsx:129`: add `menu-enter origin-top-right` to the menu div's className (menu hangs below, right-aligned to the trigger).
3. `widget-context-menu.tsx:106`: add `menu-enter origin-top-left` (menu grows down-right from the cursor point).
4. `add-widget-button.tsx:82`: add `menu-enter origin-bottom-right` (menu opens upward from the + button).
5. `sheet-sidebar.tsx:204-207`: add `menu-enter` — but ONLY once positioned, or the animation plays while the menu is still `visibility: hidden` being measured. The div renders with `style={menuStyle ?? { visibility: "hidden" }}`; gate the class on that:

   ```tsx
   className={cn(
     "min-w-44 rounded-lg border bg-popover p-1 shadow-md",
     menuPlacement === "top" ? "origin-bottom-right" : "origin-top-right",
     menuStyle && "menu-enter",
   )}
   ```

   (Adding the class after mount restarts the animation from frame 0 — that's the wanted behavior.)

## Boundaries

- Do NOT convert these menus to Radix DropdownMenu/Popover — out of scope.
- Do NOT add exit animations.
- Do NOT touch the color-palette submenu swap inside the context menu (instant swap is fine).
- If a menu's positioning classes differ from those cited, STOP and report.

## Verification

- **Mechanical**: `npx next build` passes.
- **Feel check**: `npm run dev`, `/app`, DevTools Animations panel at 10% speed for each of the four menus:
  - widget "⋯" menu grows from its top-right corner (from the trigger, not the center),
  - right-click menu grows from the cursor corner,
  - add-widget menu grows upward from the + button (bottom-right corner pinned),
  - sheet tab chevron menu grows from the corner nearest the tab, with NO flash at the wrong position and no double-play,
  - all four start at 0.96 scale — no zoom-from-nothing.
- **Done when**: all four menus animate in ~150ms from their trigger side and close instantly.
