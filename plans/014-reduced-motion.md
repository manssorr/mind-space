# 014 — prefers-reduced-motion support

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (globals.css), ~15 lines
- **Depends on**: plan 010 (final keyframe names). Best done AFTER 013/019/020 so their keyframes exist; if they haven't run, skip their selectors and note it in the plan status.

## Problem

Zero `prefers-reduced-motion` handling in the repo (0 grep hits in `src/`). Toast slide (`translateX(100%)`), dialog zoom, `widget-enter` zoom+drop, and menu scale all impose movement on users who asked the OS to reduce it.

Reduced motion means gentler, not none: keep opacity fades (they aid comprehension), drop position/scale changes.

## Target

Redefine the movement keyframes inside a reduce media query — later `@keyframes` definitions win when the query matches, so every animation keeps its duration and opacity ramp but loses transform motion:

```css
/* src/app/globals.css — after all keyframe definitions */
@media (prefers-reduced-motion: reduce) {
  @keyframes zoom-in {
    from { opacity: 0; }
  }
  @keyframes zoom-out {
    to { opacity: 0; }
  }
  @keyframes slide-in-from-right {
    from { opacity: 0; }
  }
  @keyframes slide-out-to-right {
    to { opacity: 0; }
  }
  @keyframes widget-enter {
    from { opacity: 0; }
  }
  /* if plan 013 ran: */
  @keyframes menu-in {
    from { opacity: 0; }
  }
  /* if plan 019 ran: */
  @keyframes widget-exit {
    to { opacity: 0; }
  }
  /* if plan 020 ran — celebration is pure movement, drop it: */
  .habit-pop {
    animation: none;
  }
}
```

`fade-in`/`fade-out` stay as-is (opacity only already).

## Repo conventions to follow

- All motion CSS lives in `src/app/globals.css`; place this block last so it wins the cascade.

## Steps

1. `src/app/globals.css`: append the block above after the last keyframe/animation-class definition. Include only selectors/keyframes that exist in the file at execution time; list any skipped ones in the plan's Status line.

## Boundaries

- Do NOT use `animation: none` on enter/exit animations (that removes feedback entirely and can break Radix unmount timing which waits for animation end) — only `.habit-pop` may be disabled outright since nothing waits on it.
- Do NOT add JS `useReducedMotion` branches — CSS covers everything here.
- Do NOT change the non-reduced keyframes.

## Verification

- **Mechanical**: `npx next build` passes.
- **Feel check**: DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`, then on `/app`:
  - toasts fade in/out in place — no horizontal slide,
  - confirm dialog fades — no zoom,
  - new widgets fade in — no drop/zoom,
  - menus fade — no scale,
  - toast auto-dismiss still removes the element (Radix exit still fires animationend).
  Turn emulation off → full motion returns.
- **Done when**: with reduce emulated, nothing on screen translates or scales during enter/exit, but every fade still plays.
