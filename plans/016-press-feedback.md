# 016 — Press feedback on buttons

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 4 files, ~8 line edits
- **Depends on**: plan 010 (strong `--ease-out` makes Tailwind's `ease-out` utility use the upgraded curve)

## Problem

No pressable element in the app has press feedback — buttons only change color on hover. Tap-heavy controls (counter +/−, habit check, all IconButtons) feel dead on click/touch.

Rule: `scale(0.97)` on `:active`, transform transition 100-160ms, ease-out, subtle (0.95-0.98 range only).

## Target / Steps

The pattern (replace `transition-colors` so transform is included; single utility, no second transition class):

```
transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]
```

1. `src/components/ui/icon-button.tsx:26` (IconButton): `"flex items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] shrink-0"`.
2. `icon-button.tsx:57` (RoundButton): same replacement of `transition-colors` + add `active:scale-[0.97]`.
3. `src/components/widgets/counter-widget.tsx:61`, `:70`, `:79`: in each button className replace `transition-colors` with the pattern above.
4. `src/components/widgets/habit-widget.tsx:234`: add `active:scale-[0.97]` and extend the transition to include transform (if plan 015 ran it's `transition-colors` → make it `transition-[color,background-color,transform] duration-150 ease-out`).
5. `src/components/widgets/todo-widget.tsx:262` and `src/components/widgets/calendar-widget.tsx:186` (the two "Add" buttons): replace `transition-colors` with the pattern.

## Boundaries

- Scale 0.97 exactly — nothing bouncier; this is a crisp dashboard.
- Do NOT add press feedback to menu items, tabs, or links.
- Do NOT touch drag handles (widget header, sheet tabs) — scale there fights the drag gesture.

## Verification

- **Mechanical**: `npx next build` passes.
- **Feel check**: hold mouse down on counter "+": button sinks to 0.97 and stays; release: returns in ~150ms. Rapid-click: never sticks mid-scale (transitions retarget). Habit check press feels tactile. IconButtons everywhere (zoom controls, sheet bar, widget toolbar) sink on press.
- **Done when**: every listed control visibly responds to pointer-down, and hover color behavior is unchanged.
