# Plan 021: Playwright E2E suite (smoke flows + fix-regression specs)

> Built and shipped in-session (not a handoff plan). Recorded here for the index.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent; regression specs reference PRs #1-#4)
- **Category**: tests
- **Planned at**: commit `c67f186`, 2026-07-11
- **PR**: https://github.com/AhmedNasser1010/mind-space/pull/5

## What shipped

Playwright + Chromium E2E suite, added on branch `advisor/021-e2e-playwright`:

- `playwright.config.ts` - single worker, `reuseExistingServer`, `webServer: npm run dev`, chromium project.
- `tests/e2e/pages/canvas-page.ts` - Page Object Model.
- `tests/e2e/smoke.spec.ts` - 7 tests, green on `main`: default-sheet seed, add widget, undo-removes-widget, drag moves+persists, note edit survives reload, new-sheet/tab-switch, zoom readout.
- `tests/e2e/regressions.spec.ts` - 4 `test.fixme` specs, one per open fix PR (#1 quick-link crash, #4 stopwatch-undo + #4 timer-complete, #3 habit date keys). Each validated live: fails on main, passes on its fix branch.
- `package.json` script `test:e2e`; `.gitignore` for `playwright-report`/`test-results`.

## Key facts for future maintainers

- `[data-widget]` wrappers are zero-size (inner card is absolutely positioned) - target `[data-widget] > div` for geometry.
- Seeded default content collides with button accessible-names by substring ("Getting Started" todo vs "Start"; "Add widgets from the +..." vs "Add widget"). Use widget-scoped locators + `exact: true`.
- New Sheet does NOT auto-switch to the created sheet (store keeps `currentSheetId`); tests must click the new tab.
- Writes are debounced 300 ms (store) / 400 ms (note edits); wait past the window before reading `localStorage`.
- To activate a regression spec after its PR merges: delete that spec's `test.fixme(...)` line.

## Maintenance notes

- No CI workflow yet; when one is added, `npx playwright install --with-deps chromium` + `npm run test:e2e` is the entry point.
- This suite is component/flow-level E2E; it complements (does not replace) plan 001's unit/store characterization tests.
