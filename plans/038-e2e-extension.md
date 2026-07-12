# Plan 038: Extend the Playwright E2E suite to cover the interaction chain (022-032)

> **Executor instructions**: Follow step by step; verification commands are
> binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: branch `advisor/021-e2e-playwright` exists
> (Playwright suite: `tests/e2e/pages/canvas-page.ts`, `smoke.spec.ts`,
> `regressions.spec.ts`, main-based, written BEFORE the interaction chain).
> Chain tip `advisor/032-widget-quick-fixes` @ 2f05172 exists. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M-L | **Risk**: LOW (test-only)
- **Depends on**: 032 (chain tip), 021 (suite)
- **Planned at**: 2026-07-12. User requirement: all shipped work covered by e2e.

## Why this matters

Everything since 022 was verified with unit tests + ad-hoc live-browser checks.
The Playwright suite (PR #5) predates the whole interaction chain and some of
its assumptions are now WRONG by design (dragging empty canvas pans -> now
marquees; snap toggle button existed -> removed; positions were free -> now
grid-quantized; context menu markup changed; toast markup changed). This plan
merges the suite into the chain, reconciles broken specs, and adds coverage for
every shipped feature.

## Steps

1. Branch `advisor/038-e2e-extension` from `advisor/032-widget-quick-fixes`;
   `git merge advisor/021-e2e-playwright` (expect near-clean: test files + config
   are new paths; package.json devDeps may conflict trivially).
2. `npm install`, `npx playwright install chromium` if needed. Run the merged
   suite ONCE, record which specs fail and WHY - classify each failure as
   (a) intentional behavior change from the chain (fix the spec to assert the
   NEW behavior; cite which PR changed it in a comment) or (b) real regression
   (STOP and report - none expected).
   Known intentional changes to expect: empty-canvas drag = marquee not pan;
   pan = space/middle/wheel; wheel = pan, ctrl+wheel = zoom; positions and
   sizes grid-quantized (update any position assertions to multiples of 20);
   snap-to-grid toggle gone from zoom controls; context menu is portaled Base
   UI markup; toasts are sonner markup; selection ring/handles new markup.
3. Extend `canvas-page.ts` (Page Object) with helpers: marqueeSelect(rect),
   dragWidgetBy(title, dx, dy, modifiers), openContextMenu(title),
   expectSelectedCount(n), readWidgetPosition(title). Playwright real input
   (mouse.move/down/up) - NOT dispatchEvent - so CSS :hover and pointer capture
   behave properly.
4. New spec files (follow the existing suite's style; each spec independent,
   fresh page + seeded localStorage where needed):
   - `marquee.spec.ts`: marquee selects overlapped widgets; shift+marquee
     unions; click-empty deselects; group drag moves all + one undo restores all.
   - `snapping.spec.ts`: edge snap at ~8px screen (drop position exact); cmd
     held = no snap; shift = axis lock; gap snap between a pair; guides appear
     during drag (locator for the guide divs) and vanish on drop.
   - `modifiers.spec.ts`: alt-drag clones (count+1, original unmoved, one undo
     removes); cmd/ctrl+click toggles selection.
   - `context-menu.spec.ts`: opens at pointer under pan+zoom (the #16 bug);
     hover opens Color submenu; multi-select shows "Duplicate N"; actions work;
     hovering outside while open does NOT reveal hover UI behind (the leak).
   - `grid-lock.spec.ts`: drop positions always multiples of 20 (with and
     without cmd); resize steps 20; new widget on-grid.
   - `backgrounds.spec.ts`: switch pattern to dots (assert backgroundImage
     radial-gradient); per-sheet override survives sheet switch + reload.
   - `handles-toasts-clipboard.spec.ts`: collapsed widget exposes only e/w
     resize zones; handle style setting switches and persists; sheet create
     fires a sonner toast; copy/paste keeps colorTheme (computed borderColor
     equality).
   Keep total runtime sane (< ~3 min locally); prefer fewer, denser specs over
   dozens of tiny ones.
5. Gates: `npm run typecheck` clean; unit tests 107/107 still green; full
   Playwright suite green locally (headless chromium). Run the suite TWICE to
   shake out flake; any flaky spec gets a proper wait (no waitForTimeout).
6. Report: per-spec pass counts, the step-2 reconciliation table (old
   assumption -> new behavior -> PR that changed it), total runtime.

## Gates & conventions

Style per repo. NO em-dashes. No AI signatures. Do not push.

## Done criteria

Merged suite + new specs all green twice consecutively; reconciliation table
delivered; diff touches only tests/config/package files + `plans/README.md`
row is left to the reviewer.

## STOP conditions

A step-2 failure that is NOT explained by an intentional chain change (real
regression); Playwright cannot drive the canvas reliably (report the exact
interaction); merge conflicts outside test/config paths.

## Out of scope

CI wiring (repo has no CI - noted as follow-up); visual regression
screenshots; testing 034+ (not shipped yet).
