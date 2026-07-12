# 015 — Scope transition-all to actual animated properties

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 4 files, ~8 line edits

## Problem

`transition-all` transitions unintended properties (some off-GPU) and, on the landing CTA, animates `gap` — a layout property that reflows on every hover frame:

```tsx
// src/app/page.tsx:123 (and identical at :205) — current
className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all hover:gap-3"
```

Others:
- `src/components/widgets/todo-widget.tsx:228` — `transition-all` but only opacity + colors change (delete button reveal),
- `src/components/widgets/widget-color-palette.tsx:34` and `:48` — `transition-all` but only border-color changes,
- `src/components/widgets/habit-widget.tsx:234` — `transition-all` but only background/text color change.

(`toast.tsx:63`'s `transition-all` is fixed in plan 011 — skip it here.)

## Target

Each transition names exactly what changes. Hero CTA arrow moves via transform on the icon instead of `gap` reflow.

## Steps

1. `src/app/page.tsx:123` and `:205` — both `Link` elements:
   - className: remove `transition-all hover:gap-3`, add `group transition-opacity`
     → `"group inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"`
   - the child `<ArrowRight className="size-4" />` becomes
     `<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />`
2. `todo-widget.tsx:228`: replace `transition-all` with `transition-[opacity,background-color,color]`.
3. `widget-color-palette.tsx:34` and `:48`: replace `transition-all` with `transition-colors`.
4. `habit-widget.tsx:234`: replace `transition-all` with `transition-colors`.

## Boundaries

- Do NOT touch toast.tsx (plan 011).
- Do NOT change durations or add easings here — property scoping only (plus the CTA icon transform).
- If a cited class string differs, STOP and report.

## Verification

- **Mechanical**: `npx next build` passes; `grep -rn "transition-all" src/` returns only toast.tsx (or nothing if plan 011 ran).
- **Feel check**: landing page — hover "Enter Mind Space": arrow glides right, button text/padding do not shift (no layout wobble). Todo hover: delete button fades in. Habit check + palette dots: color transitions unchanged.
- **Done when**: no `transition-all` outside toast.tsx; CTA hover causes no layout reflow (verify: DevTools Performance shows no Layout during hover).
