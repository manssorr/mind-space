# 010 — Register animation utilities and motion tokens (resurrect dialog/toast CSS)

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: HIGH
- **Category**: Cohesion & tokens / Easing & duration
- **Estimated scope**: 3 files (globals.css, confirm-dialog.tsx, toast.tsx), ~60 lines net

## Problem

The entire enter/exit animation system for dialogs and toasts is dead code. This repo uses Tailwind v4 (`@import "tailwindcss"` only, no `tw-animate-css`, no `@utility` definitions). Classes like `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-right-full` are NOT registered Tailwind utilities, so every `data-[state=…]:` variant of them compiles to **nothing**. Verified by compiling with the repo's own Tailwind: `data-[state=open]:animate-in`, `data-[state=open]:fade-in-0`, `data-[state=open]:zoom-in-95`, `data-[state=open]:slide-in-from-right-full` all produce zero CSS, while `transition-colors` compiles fine.

The manual selectors in `src/app/globals.css:163-180` never match either, because they require the literal class tokens (`animate-in fade-in-0`) in the class attribute, and the markup only ever contains the prefixed forms (`data-[state=open]:animate-in`):

```css
/* src/app/globals.css:163-180 — current (dead) */
.animate-in {
  animation-duration: 150ms;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
.animate-out {
  animation-duration: 150ms;
  animation-timing-function: ease-in;   /* also wrong: ease-in on an exit */
  animation-fill-mode: forwards;
}
.animate-in.fade-in-0 { animation-name: fade-in; }
.animate-out.fade-out-0 { animation-name: fade-out; }
.animate-in.zoom-in-95 { animation-name: zoom-in; }
.animate-out.zoom-out-95 { animation-name: zoom-out; }
.animate-in.slide-in-from-right-full { animation-name: slide-in-from-right; }
.animate-out.slide-out-to-right-full { animation-name: slide-out-to-right; }
```

Result: the confirm dialog (`src/components/ui/confirm-dialog.tsx:55-56`) and toasts (`src/components/ui/toast.tsx:63`) pop in and out with zero animation. The dialog markup also carries four classes that have no definition anywhere (`slide-out-to-left-1/2`, `slide-out-to-top-[48%]`, `slide-in-from-left-1/2`, `slide-in-from-top-[48%]`) — dead weight copied from shadcn.

There are also two fully unused keyframe pairs: `toast-slide-in`/`toast-slide-out` (`globals.css:102-122`) are referenced by nothing.

There are no shared easing tokens anywhere; `widget-enter` uses the weak built-in `ease-out` keyword.

## Target

Registered `@utility` rules (so `data-[state=…]:` variants work), strong easing tokens, exits on ease-out, one consolidated keyframe set. In `src/app/globals.css`:

```css
/* after the existing .dark block */
:root {
  /* Motion tokens. Intentionally override Tailwind's default --ease-out /
     --ease-in-out theme vars with stronger curves. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

Replace lines 102-180 (both toast-slide keyframe pairs, the fade/zoom/slide keyframes, `.widget-enter`, and all `.animate-in`/`.animate-out` rules) with:

```css
@keyframes fade-in {
  from { opacity: 0; }
}
@keyframes fade-out {
  to { opacity: 0; }
}
@keyframes zoom-in {
  from { opacity: 0; transform: scale(0.95); }
}
@keyframes zoom-out {
  to { opacity: 0; transform: scale(0.95); }
}
@keyframes slide-in-from-right {
  from { transform: translateX(100%); opacity: 0; }
}
@keyframes slide-out-to-right {
  to { transform: translateX(100%); opacity: 0; }
}
@keyframes widget-enter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
}

.widget-enter {
  animation: widget-enter 200ms var(--ease-out) both;
}

@utility animate-in {
  animation-duration: 200ms;
  animation-timing-function: var(--ease-out);
  animation-fill-mode: both;
}
@utility animate-out {
  animation-duration: 150ms;
  animation-timing-function: var(--ease-out); /* exits also start fast */
  animation-fill-mode: both;
}
@utility fade-in-0 { animation-name: fade-in; }
@utility fade-out-0 { animation-name: fade-out; }
@utility zoom-in-95 { animation-name: zoom-in; }
@utility zoom-out-95 { animation-name: zoom-out; }
@utility slide-in-from-right-full { animation-name: slide-in-from-right; }
@utility slide-out-to-right-full { animation-name: slide-out-to-right; }
```

Dialog content markup (`confirm-dialog.tsx:56`): the element must carry exactly ONE `animation-name` per state, or the two `@utility` rules fight over `animation-name`. `zoom-in`/`zoom-out` keyframes already include opacity, so drop the fade classes and the four undefined slide classes from Content:

```
data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95
```

Note: the Content's `-translate-x-1/2 -translate-y-1/2` centering is safe — Tailwind v4 translate utilities emit the native `translate` property (verified against this repo's build), which the keyframes' `transform: scale()` does not clobber.

Toast markup (`toast.tsx:63`): replace `data-[state=closed]:fade-out-80` (undefined; and 0.8 opacity exit is pointless anyway) so open/closed each carry one animation:

- keep `data-[state=open]:slide-in-from-right-full`, add `data-[state=open]:animate-in`
- exit: `data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full` (remove `data-[state=closed]:fade-out-80`)

## Repo conventions to follow

- Tailwind v4, everything lives in `src/app/globals.css`; theme vars in the `:root` block at `globals.css:38`.
- Existing `.widget-enter` (`globals.css:159-161`) is the pattern for plain CSS animation classes.

## Steps

1. `src/app/globals.css`: add the two `--ease-out`/`--ease-in-out` vars to the existing `:root` block (line 38, after `--chart-5`).
2. `src/app/globals.css`: delete lines 102-180 (keyframes `toast-slide-in`, `toast-slide-out`, `fade-in`, `fade-out`, `zoom-in`, `zoom-out`, `slide-in-from-right`, `slide-out-to-right`, `widget-enter`, `.widget-enter`, `.animate-in`, `.animate-out`, and the six compound `.animate-*` selectors) and replace with the Target block above (keyframes + `.widget-enter` + eight `@utility` rules).
3. `src/components/ui/confirm-dialog.tsx:56`: replace the Content animation classes with exactly `data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95` (delete `fade-in-0`, `fade-out-0`, and all four `slide-*-1/2` / `slide-*-[48%]` classes). Leave line 55 (Overlay) unchanged — it now works.
4. `src/components/ui/toast.tsx:63`: add `data-[state=open]:animate-in`; replace `data-[state=closed]:fade-out-80` with nothing (the existing `data-[state=closed]:slide-out-to-right-full` plus the existing `data-[state=closed]:animate-out` handle exit).

## Boundaries

- Do NOT touch the toast provider logic (`toast.tsx:35-48`) — that's plan 011.
- Do NOT add `tw-animate-css` or any dependency.
- Do NOT change any other component.
- If globals.css lines have drifted from the excerpts above, STOP and report.

## Verification

- **Mechanical**: `npx next build` succeeds. In DevTools, computed styles on an open dialog Content show `animation-name: zoom-in` and `animation-timing-function: cubic-bezier(0.23, 1, 0.32, 1)`.
- **Feel check**: run `npm run dev`, open `/app`, delete a sheet (triggers confirm dialog):
  - overlay fades in, dialog zooms 0.95→1 with opacity, stays perfectly centered the whole time (no jump toward the top-left corner),
  - dialog exit plays on cancel (fast, 150ms),
  - creating a sheet slides the toast in from the right with fade.
  - In DevTools Animations panel at 10% speed: dialog entrance decelerates hard (fast start, soft landing) — not linear, not slow-start.
- **Done when**: dialog and toast visibly animate in; no undefined class names remain in confirm-dialog.tsx or toast.tsx (`fade-out-80`, `slide-*-1/2`, `slide-*-[48%]` all gone).
