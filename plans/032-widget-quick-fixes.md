# Plan 032: Widget internals quick fixes (hover scoping, tooltips, cursors, targets)

> **Executor instructions**: Follow step by step; verification commands are
> binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base = latest chain tip (reviewer names branch at
> dispatch). Confirm: `base-widget.tsx` has an unnamed `group` class on the card
> root; `todo-widget.tsx` item rows use unnamed `group` with the delete button on
> `opacity-0 group-hover:opacity-100`; `quick-link-widget.tsx` edit button uses
> `group-hover:opacity-100` without a `transition-*` class. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW
- **Planned at**: 2026-07-12, from the widget-internals UX audit. This plan is
  the subset NOT blocked by the central-lists data migration (see
  plans/033-central-lists-design.md); the full todo rebuild is plan 035.

## Why this matters

Audit's worst offense: hovering ANYWHERE on a todo widget reveals EVERY item's
delete button. Root cause: Tailwind `group`/`group-hover:` are unscoped by
default - `base-widget.tsx` puts `group` on the whole card and `todo-widget.tsx`
puts another unnamed `group` on each row, so the delete button's
`group-hover:opacity-100` matches the CARD's hover. Named groups
(`group/item` + `group-hover/item:`) scope correctly.

## Steps

1. **Named group scoping**:
   - `todo-widget.tsx`: row wrapper `group` -> `group/item`; delete button
     `group-hover:opacity-100` -> `group-hover/item:opacity-100` (keep its
     `transition-all`). Any other `group-hover:` inside rows likewise.
   - `quick-link-widget.tsx`: tile wrapper `group` -> `group/link`; edit button
     -> `group-hover/link:opacity-100` AND add `transition-opacity` (audit: it
     currently snaps).
   - `base-widget.tsx`: leave its card-level `group` in place (widget-level
     affordances may rely on it - check consumers of plain `group-hover:` first
     and report what you find; only rename if nothing widget-level uses it).
2. **Quick-link truncation tooltips**: the truncated hostname/URL `<p>` elements
   get `title={url}` (full value on hover).
3. **Timer cursor honesty**: `cursor-pointer` on the duration display only when
   the click handler is attached (same conditional as the onClick).
4. **Touch targets**: todo add (+) and per-item delete buttons, habit month-nav
   chevrons: `h-5 w-5` (20px) -> minimum 24px hit area (`h-6 w-6`, keep icon
   size). Do NOT restyle beyond size.
5. **Header divider artifact (user screenshot, 2026-07-12)**: a horizontal
   divider line renders detached below the widget header, and persists when the
   widget is collapsed (dangling line at the bottom of a collapsed card).
   INVESTIGATE FIRST, do not assume: reproduce live (note widget with a color
   theme, hover the collapse button, and the collapsed state), then identify
   the exact element drawing the line via `document.elementFromPoint` at the
   line's coordinates + computed styles. Known candidates: the header's
   unconditional `border-b` (base-widget.tsx header div) which should be
   suppressed when `collapsed`; a second border/margin from the content
   wrapper or the note textarea; the colorTheme border variables making it more
   visible. Fix root cause; verify: collapsed widget shows NO divider below the
   header in default AND colored themes; expanded widget shows exactly ONE
   divider flush under the header (no gap, no double line). Screenshots of
   both states.
6. **Selection ring color bug**: `SelectionOutline`'s ring div has
   `border-2 border-primary` but computes to `rgb(38,38,38)` (the `--border`
   gray) in dark mode instead of the primary color - found during 030's
   verification, pre-existing, and it explains the long-standing "selection
   ring is barely visible in dark theme" complaint. Investigate: likely the
   Tailwind `border` utility on the card (or class order in `cn`) re-applies
   `border-color`, or `--primary` maps unexpectedly in dark mode. Fix so the
   ring visibly uses the primary color in BOTH themes; verify via computed
   `borderColor` against `getComputedStyle(document.documentElement).getPropertyValue("--primary")`
   and a visual screenshot in both themes. Do not restyle beyond the color.
7. **UI/UX gates** (per plans/README.md): pre-review = this plan IS the review
   output. Post-pass (dev server + chrome-devtools MCP, REAL hover via the CDP
   hover tool, not synthetic events):
   - Hover a todo widget's header/padding: NO item delete buttons appear.
   - Hover ONE todo row: only that row's delete appears; adjacent rows stay
     clean. (`document.querySelectorAll(":hover")` chain as evidence.)
   - Hover the quick-link tile: edit button FADES in (not snaps).
   - Truncate a long URL, hover text: native tooltip shows full URL.
   - Timer running: cursor over duration is default; timer idle: pointer.
   - Every resized button still works (click each once).
6. Screenshots: single-row hover in a multi-item todo (only that row's delete
   visible).

## Gates & conventions

`npm install` first. Typecheck clean; all tests green (baseline = chain tip
count). Pre-existing lint failure only in `theme-toggle.tsx`. Double quotes, no
semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only: `todo-widget.tsx`, `quick-link-widget.tsx`,
`base-widget.tsx` (only if the group audit in step 1 requires), `timer-widget.tsx`,
`habit-widget.tsx`, `docs/screenshots/`. Step-5 evidence reported.

## STOP conditions

Drift check fails; renaming a group breaks a widget-level hover consumer
(report the selector chain); anything tempts you into the todo add-flow or
scroll work (that is plan 035 - out of scope here).

## Out of scope

Todo add flow, reorder, scroll containers, completed-section (plan 035); data
model (plan 034); note/text/calendar internals.
