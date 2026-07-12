# Plan 031: Copy/paste keeps all widget characteristics (colorTheme drop fix)

> **Executor instructions**: Follow step by step; verification commands are
> binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base = latest chain tip (reviewer names the
> branch at dispatch). Confirm `src/store/index.ts` line ~11 has
> `ClipboardData` with `Pick<Widget, "type" | "title" | "width" | "height" | "data" | "collapsed">`
> - i.e. NO `colorTheme`. If colorTheme is already in the Pick, STOP (already fixed).

## Status

- **Priority**: P2 (user-reported bug) | **Effort**: S | **Risk**: LOW
- **Planned at**: 2026-07-12. User report: "the pasted items has no color. the copy paste should maintain all other characteristics of the original."

## Why this matters

`copyWidgets` snapshots widgets into `ClipboardData` via a field `Pick` that omits `colorTheme`, so pasting a colored widget silently produces a default-colored one. Verified in code 2026-07-12 (`src/store/index.ts:11`). Field-by-field audit of `Widget` (`{ id, type, title, x, y, width, height, zIndex, collapsed, data, colorTheme? }`): `id`/`zIndex` are intentionally regenerated on paste; everything else must round-trip - `colorTheme` is the only one dropped.

## Steps

1. Add `"colorTheme"` to the `ClipboardData` Pick union (`src/store/index.ts:11`).
2. Confirm `copyWidgets` copies via object construction that includes it (check whether it lists fields explicitly - if so add `colorTheme: w.colorTheme` - or spreads; match existing style) and `pasteWidgets` carries it into the new widget.
3. The clipboard is PERSISTED (`clipboard` is in `partialize`). An old persisted clipboard without `colorTheme` must paste without errors (`colorTheme: undefined` is valid - it is optional). No migration needed; add a test proving a clipboard entry lacking the field pastes cleanly.
4. Tests (store test file): copy a widget with `colorTheme: "blue"`, paste, new widget has `colorTheme: "blue"`; copy one WITHOUT colorTheme, paste, undefined; collapsed + data + title + size also asserted (full fidelity, not just color); old-clipboard-shape test from step 3.
5. **UI/UX gates** (per plans/README.md "UI/UX review gates"): pre-review is trivial here (no new surface) - note it. Post-pass runtime verification (dev server, chrome-devtools MCP, real interactions): color a widget via context menu, cmd+C, cmd+V - pasted copy shows the SAME theme colors visually (screenshot both); paste is undoable in one step; paste after reload (persisted clipboard) also keeps color.
6. Screenshot: original + pasted colored widgets side by side.

## Gates & conventions

`npm install` first. Typecheck clean; tests green (baseline = chain tip count + new). Pre-existing lint failure only in `theme-toggle.tsx`. Double quotes, no semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only `src/store/index.ts` (+ its test file) + `docs/screenshots/`. All step-4 tests green; step-5 runtime pass reported.

## STOP conditions

Drift check shows the fix already present; paste path turns out to intentionally strip theme somewhere else (report where).

## Out of scope

Cross-app clipboard (system clipboard integration); copying sheets.
