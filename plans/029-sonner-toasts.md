# Plan 029: Replace hand-rolled toast system with sonner

> **Executor instructions**: Follow step by step; run every verification
> command; STOP conditions are binding. Reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: base branch `advisor/028-canvas-backgrounds`
> (stacked chain). Confirm `src/components/ui/toast.tsx` exports `useToast` and
> `ToastProvider` (context-based custom implementation). Mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: S | **Risk**: LOW
- **Depends on**: plan 028 branch (chain order only)
- **Planned at**: 2026-07-12. Maintainer decision: adopt **sonner** - it is what shadcn/ui ships today for toasts (shadcn deprecated its own toast component in favor of sonner).

## Why this matters

The toast system is a hand-rolled context provider (`src/components/ui/toast.tsx`, plus `@radix-ui/react-toast` in deps). sonner gives stacked cards, swipe dismiss, `toast.promise` loading states, and theme awareness for one small maintained dependency, and deletes local code.

**Cross-PR conflict note (surface in the PR body)**: PR #7 (animations, plans 010/011, other workstream) rewrote the CURRENT toast's dismiss/swipe animations. This plan replaces that toast entirely, superseding the toast portion of #7. Flag it; do not try to reconcile code with #7 here.

## Current state (verified)

- `src/components/ui/toast.tsx`: `interface Toast`, `ToastContextValue`, `export function useToast()`, `export function ToastProvider({ children })`. Consumers found: `src/app/layout.tsx` (provider mount), `src/components/storage-error-listener.tsx`, `src/components/sheets/sheet-sidebar.tsx`. FIRST STEP: map the full consumer list yourself (`grep -rn "useToast\|ToastProvider" src/`) and read each call site's shape (message? variant? duration?) before writing anything.
- `package.json` has `@radix-ui/react-toast` - check whether `ui/toast.tsx` actually imports it or is fully hand-rolled; remove the dep only if nothing else imports it.
- Theme: `useTheme()` provides `resolvedTheme` ("light" | "dark") for sonner's `theme` prop.

## Steps

1. `npm install sonner`.
2. Mount `<Toaster richColors closeButton position="bottom-right" theme={resolvedTheme} />` where `ToastProvider` was (a small client wrapper component so layout stays a server component if it is one - check `layout.tsx` first).
3. Convert every call site: `useToast().showToast(...)`-style calls become direct `toast(...)` / `toast.success(...)` / `toast.error(...)` imports from `sonner`, preserving each message and severity. No React context needed - document each converted call site in your report.
4. Delete `src/components/ui/toast.tsx`. Remove `@radix-ui/react-toast` from package.json IF nothing else imports it (verify with grep).
5. If `globals.css` contains toast-specific animation utilities referencing the old markup (from the animations workstream - they are NOT expected on this branch lineage, but check), leave `globals.css` alone and note what you found.
6. Tests: none required (no component test infra); the gate is typecheck + existing tests + runtime.
7. **Runtime verification** (REQUIRED): trigger at least one REAL toast through the UI for each consumer you converted (e.g. whatever sheet-sidebar fires it for; storage-error-listener can be triggered by filling localStorage to quota in the console if feasible - if not feasible, verify it by temporarily calling its exact converted invocation from the console and say so). Confirm: correct message, severity styling, dark/light theme follows the app, stacking of 2+ toasts, swipe/close dismissal.
8. **Screenshot**: a success and an error toast stacked.

## Gates & conventions

`npm install` first. Typecheck clean; all tests green (baseline = 028's count). Pre-existing lint failure only in `theme-toggle.tsx`. Double quotes, no semicolons, no em-dashes, no AI signatures. Do not push.

## Done criteria

Diff touches only: `package.json`+lockfile, the Toaster mount point, each mapped consumer, deleted `src/components/ui/toast.tsx`, `docs/screenshots/`. Every consumer converted and runtime-fired (or explicitly reported as console-verified with reason).

## STOP conditions

Drift check fails; a consumer's toast usage doesn't map cleanly to sonner's API (report the call site); `@radix-ui/react-toast` has imports outside `ui/toast.tsx`.

## Out of scope

toast.promise adoption in features that don't toast today; undo-action toasts; repositioning preferences UI.
