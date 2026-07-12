# 020 — Habit check celebration pop

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (habit-widget.tsx, globals.css), ~15 lines
- **Depends on**: plan 010 (`--ease-in-out`)

## Problem

Completing a habit — the single rare, earned-delight moment in the app (streak goes up) — is just a background-color swap on the check button:

```tsx
// src/components/widgets/habit-widget.tsx:228-243 — current (excerpt)
<button onClick={(e) => { e.stopPropagation(); toggleToday() }}
  className={cn(
    "flex h-12 w-12 items-center justify-center rounded-full transition-all",
    isTodayCompleted ? "bg-primary text-primary-foreground" : "bg-muted ..."
  )}>
```

Frequency: once per habit per day → delight budget applies. Unchecking must stay plain (it's a correction, not a win).

## Target

```css
/* globals.css */
@keyframes habit-pop {
  0% { transform: scale(1); }
  35% { transform: scale(0.92); }
  70% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
.habit-pop {
  animation: habit-pop 350ms var(--ease-in-out);
}
```

Reduced-motion block (plan 014): `.habit-pop { animation: none; }` — pure decoration, nothing waits on it.

## Steps

1. globals.css: add keyframes + class.
2. `habit-widget.tsx`:
   - `const [popping, setPopping] = useState(false)` (add `useState` to imports if missing).
   - in the button's onClick, before `toggleToday()`: `if (!isTodayCompleted) setPopping(true)` (only when transitioning to completed).
   - button className: add `popping && "habit-pop"` to the `cn` call.
   - button prop: `onAnimationEnd={(e) => { if (e.animationName === "habit-pop") setPopping(false) }}`.

## Boundaries

- Only the today-check button pops — not calendar day cells, not the streak label.
- No confetti, no color flashes — one scale pop, 350ms, max overshoot 1.08.
- Do NOT change `toggleToday` or any store logic.

## Verification

- **Mechanical**: `npx next build` passes.
- **Feel check**: check today's habit → button dips then overshoots once and settles; color change rides along. Uncheck → no pop. Re-check → pops again (state resets via animationend). At 10% speed: single overshoot, no double bounce. Reduced-motion emulation → color swap only.
- **Done when**: pop plays exactly on the uncompleted→completed transition and never elsewhere.
