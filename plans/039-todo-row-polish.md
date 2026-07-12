# Plan 039: Todo row polish - baseline alignment, compact density, ghost drag preview

> **Executor instructions**: Follow step by step; every verification command
> binding. STOP conditions are hard. Update your row in `plans/README.md` when
> done. **Executor model: sonnet-class.**
>
> **Drift check (run first)**: base is branch `advisor/036-todo-hub`. Branch
> `advisor/039-todo-row-polish` from its tip (at planning time `8b3e1c2`; if
> the 036 resume addendum landed first, use the new tip - preferred). Confirm
> `src/components/widgets/todo-widget.tsx` contains a `TodoRow` with row
> container classes `group/item relative flex items-start gap-1 rounded-md
> pl-1 pr-2 py-1.5` and drop-indicator divs using `h-0.5 rounded-full
> bg-primary`. Mismatch = STOP.

## Status

- **Priority**: P1 | **Effort**: S-M | **Risk**: LOW-MED | **Category**: bug/ux
- **Depends on**: 036 resume addendum preferred first (it adds a
  `showDragHandle` prop to `TodoRowProps` - trivial same-file rebase if not)
- **Planned at**: `8b3e1c2`, 2026-07-12. Source: user screenshots 2026-07-12 +
  `plans/PRD-todo-advanced.md` Part A (read it for rationale).

## Why this matters

Three shipped-broken UX defects from the 035 rebuild: row controls do not
share a vertical axis with the text, rows are too sparse (user wants ~40% more
rows visible), and drag reorder shows a thin insertion line instead of a ghost
of the dragged item. All rendering-only; the reorder data path stays.

## Current state (`src/components/widgets/todo-widget.tsx`)

- Row container: `"group/item relative flex items-start gap-1 rounded-md pl-1
  pr-2 py-1.5 transition-colors"`. `items-start` is CORRECT (wrapped text must
  top-align controls to the FIRST line) - do not switch to items-center.
- Controls: drag handle button `mt-0.5 h-6 w-6` (24px); status checkbox
  `mt-0.5 h-4 w-4` (16px); delete button `mt-0.5 h-6 w-6`.
- Text: display button `flex-1 min-w-0 rounded px-1 -mx-1 text-left text-xs
  leading-relaxed ...` (no vertical margin); edit mode swaps in `InlineInput`
  with `h-6 flex-1 min-w-0 border-input/60 text-xs`.
- The misalignment: text-xs/leading-relaxed first-line center sits ~9.75px
  below row content top; a 24px control at mt-0.5 centers at 14px (~4px low);
  the 16px checkbox at mt-0.5 centers at 10px (near-correct). Hence handle +
  trash visibly sag vs checkbox and text.
- Drop indicator: two absolute divs inside the row, `pointer-events-none
  absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-primary` (and `-bottom-0.5`
  variant), driven by `isDropTarget`/`dropPosition` props.
- Drag machinery (KEEP ALL): handle `onPointerDown` -> `dragState` ref with
  5px threshold; scroll-container `onPointerMove` picks nearest `[data-item-id]`
  row midpoint -> `setDropTarget({id, position: "before"|"after"})`; container
  `onPointerUp` -> `neighborsForDrop(activeOrderedIds, id, dt)` ->
  `moveListItem(id, beforeId, afterId)` (one history entry). Autoscroll via
  `AUTOSCROLL_EDGE_PX`/`AUTOSCROLL_SPEED`. Dragged row gets `opacity-40`.
- List container: `space-y-0.5`, widget frame `p-3 gap-2`.
- Conventions: double quotes, no semicolons, no em-dashes, Tailwind v4,
  `cn()` from `@/lib/utils`. Reduced-motion support exists app-wide (plan 014).

## Commands

| Purpose | Command | Expect |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all green (163+ baseline; no count drop) |
| Dev | `npm run dev` | serves app for runtime checks |

## Scope

**In scope**: `src/components/widgets/todo-widget.tsx`,
`src/components/ui/icon-button.tsx` (ONLY if edit-input height must change),
`docs/screenshots/`.
**Out of scope**: `src/lib/list-reorder.ts` (`neighborsForDrop` untouched),
store, hub widget, any other widget.

## Steps

### Step 1: UI/UX pre-review (gate from plans/README.md)

Enumerate risks in your report before coding: hover-reveal (delete/handle)
after density change, hit-target preservation, edit-mode row-height jump,
drag feedback both themes, reduced-motion.

### Step 2 (A2): compact density

Target: >=30% more rows visible per widget height (PRD asks ~40%; tune live,
do not butcher readability). Changes, tune from these starting values:
- Row: `py-1.5` -> `py-0.5`; text `leading-relaxed` -> `leading-snug`.
- Keep list `space-y-0.5`.
- PRESERVE 24px hit areas (plan 032 rule): handle/delete keep `h-6 w-6` but
  add `-my-0.5` so the visual row shrinks while the hit box overflows;
  checkbox stays `h-4 w-4` visual - pad to a 24px hit area with `p-1 -m-1`
  on the button (visual box unchanged).
**Verify (CDP/Playwright on dev server)**: measure row pitch
(`getBoundingClientRect` of two adjacent rows, delta of `top`) before/after:
after <= 0.75 * before. All three buttons' hit rects >= 24x24
(`getBoundingClientRect` on the buttons).

### Step 3 (A1): one alignment axis

With final density metrics, align control centers to the FIRST text line
center (compute: line-height in px / 2 from text top; text button has no
vertical padding):
- Adjust the `mt-*` offsets so |center(control) - center(first text line)| <=
  1px for checkbox, handle, delete. Expect roughly: 16px checkbox keeps a
  small positive mt; 24px buttons need ~zero or slightly negative top offset
  once `-my-0.5` from Step 2 applies. Derive exact classes live, don't guess.
- Edit mode: entering edit must not shift row height or text x-position by
  more than 1px. If `InlineInput` `h-6` (24px) vs text line (~17px) jumps,
  pass a shorter height class from the todo call site (`h-5`), do not change
  InlineInput defaults for other consumers.
**Verify (CDP, real DOM)**: for a single-line and a wrapped 3-line item, log
centers of checkbox/handle/delete vs first-line text center (use a Range on
the text node's first client rect): all deltas <= 1px. Toggle edit on/off:
row height delta <= 1px.

### Step 4 (A3): ghost drag preview instead of insertion line

Rendering-only change; `dragState`/`neighborsForDrop`/`moveListItem`/autoscroll
untouched. Behavior spec:
- While dragging: the original row stays in place, dimmed further
  (`opacity-25`) - it IS the "gap" marker at the source slot.
- Remove the two `h-0.5` indicator divs. Instead render ONE ghost element: a
  non-interactive copy of the dragged row (checkbox state + text only,
  `aria-hidden`, `pointer-events-none`), absolutely positioned inside the
  scroll container, full row width, snapped to the drop slot edge (top of
  target row for "before", bottom for "after"), styled `bg-card border
  shadow-md opacity-90 rounded-md`.
- Ghost position transitions with a ~120ms transform ease; honor the existing
  reduced-motion convention (no transition under `prefers-reduced-motion`,
  see plan 014 patterns in `globals.css`).
- Implementation shape: compute ghost top from the target row's offsetTop
  within the scroll container (rows already queryable via `[data-item-id]`);
  keep it in the existing `dropTarget` state flow. A small `TodoRowGhost`
  subcomponent in the same file is fine.
**Verify (runtime, real pointer via CDP)**: drag an item 2 slots down: ghost
renders at landing slot, no thin line anywhere, source row dimmed; drop
commits order (store state check) and ONE undo entry reverts it; drag with
scroll (autoscroll still works); drop-in-place = no history entry (undo stack
length unchanged).

### Step 5: full gates + evidence

Typecheck, tests, lint (only pre-existing `theme-toggle.tsx` error allowed).
UX pass per README gates: hover every control both themes, no leaks,
click-to-edit unaffected. Screenshots to `docs/screenshots/039-*`:
before/after density, alignment close-up, ghost mid-drag. Update README row.

## Test plan

No new unit tests required (rendering-only); existing suite must stay green,
`neighborsForDrop` tests untouched. If you extract any pure positioning
helper (e.g. ghost top calc), unit-test it modeled on
`src/lib/list-placement.test.ts`. The runtime steps above are the real gate;
record results in the PR body.

## Done criteria

- [ ] `npm run typecheck` exit 0; `npm test` green, count >= baseline
- [ ] Row pitch <= 0.75x previous; hit rects >= 24px (measured, in PR body)
- [ ] Alignment deltas <= 1px single + wrapped lines (measured, in PR body)
- [ ] No insertion-line divs remain (`grep -n "h-0.5" src/components/widgets/todo-widget.tsx` -> none in row render)
- [ ] Drag still commits via `moveListItem`, one undo entry (runtime-verified)
- [ ] Screenshots committed; README row updated; no out-of-scope files touched

## STOP conditions

- Current-state excerpts don't match (drift).
- Ghost approach requires touching `neighborsForDrop`, the store, or
  pointer-capture logic -> STOP, report.
- Hit-area preservation and density conflict irreconcilably (can't hold both
  24px targets and >=30% density) -> STOP, report options with measurements.

## Maintenance notes

- Plan 040 (hierarchy) re-renders rows with indentation on these exact
  classes; keep the row container class list in one `cn()` call.
- The hub reuses `TodoRow`; density/alignment changes propagate there - the
  runtime pass must eyeball one hub group too.
- 24px hit-boxes overflow visual rows: verify delete-tap on row N doesn't hit
  row N+1 (tap midpoints of adjacent rows).
