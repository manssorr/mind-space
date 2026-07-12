# 018 — Smooth canvas zoom for button-initiated zoom only

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 3 files (store, canvas/index.tsx, zoom-controls.tsx), ~25 lines
- **Depends on**: plan 010 (`--ease-in-out`)

## Problem

Zoom in/out/reset/fit buttons (`src/components/canvas/zoom-controls.tsx:34-81`) jump the canvas scale instantly — the user loses spatial context on every 1.4× step. Pinch and pan are continuous gestures and must stay transition-free; the transform container is `src/components/canvas/index.tsx:196-202` (inline `transform`, `willChange: transform`).

## Target

Discrete (button) zooms animate `transform 200ms var(--ease-in-out)`; gesture-driven updates never do. A pointerdown during the animation cancels it so panning is never laggy.

## Steps

1. `src/store/index.ts`: add ephemeral field `canvasAnimating: boolean` (initial `false`) + action `setCanvasAnimating: (v: boolean) => void`. Do NOT add to `partialize` (line 728).
2. `zoom-controls.tsx`: in `zoomIn`, `zoomOut`, `resetView`, `fitToScreen` — before `setCanvasState(...)` call `setCanvasAnimating(true)`, and after it schedule `setTimeout(() => useStore.getState().setCanvasAnimating(false), 250)`.
3. `canvas/index.tsx`:
   - subscribe: `const canvasAnimating = useStore((s) => s.canvasAnimating)`
   - transform div style: add `transition: canvasAnimating ? "transform 200ms var(--ease-in-out)" : "none"`.
   - in `handlePointerDown` (line 47), first line: `if (useStore.getState().canvasAnimating) useStore.getState().setCanvasAnimating(false)` — kills the transition the moment a pan/pinch starts (CSS transitions retarget/stop cleanly).
4. Reduced motion (if plan 014 ran): nothing needed — transition is inline JS; acceptable because it's a 200ms opacity-free camera move. Optional: skip setting `canvasAnimating` when `window.matchMedia("(prefers-reduced-motion: reduce)").matches`; include this guard in `zoom-controls.tsx` as a small helper.

## Boundaries

- Pinch (`handlePointerMove` pinching branch) and pan must never run with a live transition.
- Do NOT animate the grid background (`gridStyle` div) — it repositions per state already; a mismatch of one frame is invisible.
- Do NOT persist `canvasAnimating`.

## Verification

- **Mechanical**: `npx next build` passes; localStorage has no `canvasAnimating`.
- **Feel check**: click zoom-in → canvas eases to the new scale (~200ms, symmetric accel/decel — it's on-screen movement, not an entrance). Spam zoom-in 5× fast → each step retargets smoothly, no stutter. Start a pan mid-animation → canvas follows the pointer instantly (no rubber-banding). Pinch on trackpad/touch → identical to before.
- **Done when**: button zooms glide, gestures remain 1:1, reset/fit also animate.
