# Plan 008: JSON export/import backup (no-cloud data portability)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/store/index.ts src/components/canvas/zoom-controls.tsx src/components/ui/confirm-dialog.tsx`
> Plans 003/004 are expected to have changed the store's persist config
> (version >= 1). Read the live persist `version` before writing the export
> format. Other unexplained drift is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/003-persistence-hardening.md
- **Category**: direction
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

The README promises "Everything is local - no accounts, no servers, no cloud", but all data lives in one browser's localStorage: clearing site data, switching browsers, or a quota failure loses everything, and there is no backup path. A JSON file export/import keeps the no-cloud promise while ending the lock-in: backups, device migration, and sheet sharing by file. The store's copy/paste and duplicate machinery shows the data model already serializes cleanly.

## Current state

- Persisted state shape (see `partialize` in `src/store/index.ts`, post-plan-003): `{ sheets, currentSheetId, widgets, canvasState, themeSettings, clipboard }`. Export should carry only the durable content: `sheets`, `widgets`, `currentSheetId`.
- Domain types in `src/types/index.ts`: `Sheet { id, title, description?, widgetOrder, createdAt, updatedAt }`, `Widget { id, type, title, x, y, width, height, zIndex, collapsed, data, colorTheme? }`.
- The persist config has a `version` number (1 after plan 003, 2 after plan 004) and a `migrate` function. The export format must record which version it was written from.
- `src/components/canvas/zoom-controls.tsx` - the bottom-right control cluster; a vertical stack of `IconButton`s with `h-px bg-border mx-1` divider divs between groups, ending with `<AddWidgetButton />` (line 132). New buttons follow this pattern; icons come from `lucide-react` (existing imports at line 8: `ZoomIn, ZoomOut, RotateCcw, Maximize2, Grid3x3`).
- `src/components/ui/confirm-dialog.tsx` exists and is provided app-wide (`ConfirmProvider` wraps the app in `src/app/layout.tsx:37`). Open it for its hook API; find an existing usage with `grep -rn "useConfirm\|Confirm" src/components --include="*.tsx" -l`. Import replaces all current data, so it MUST go through this confirm flow.
- Toasts: `src/components/ui/toast.tsx` (see plan 003's step 4 notes for how to consume it or fall back).
- Conventions: pure logic in `src/lib/`, double quotes, no semicolons, `IconButton` components take `label` + `size` + children icon.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |
| Manual    | `npm run dev`          | behaviors in step 4 |

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/backup.ts` (create)
- `src/lib/backup.test.ts` (create)
- `src/store/index.ts` (add `importState` action only)
- `src/components/canvas/zoom-controls.tsx` (two buttons)

**Out of scope** (do NOT touch):
- Merge-mode import (combining with existing sheets) - v1 is replace-only, by decision.
- Auto-backup, cloud sync, share links.
- Persist plumbing beyond reading the current version constant.

## Git workflow

- Branch: `advisor/008-export-import-backup`
- Commit style: `feat: JSON export/import backup`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `src/lib/backup.ts`

Export a version constant sourced from the persist config (extract the persist `version` number in `src/store/index.ts` into an exported `export const PERSIST_VERSION = <n>` and use it in both places). Then:

```ts
export interface BackupFile {
  app: "mind-space"
  version: number       // PERSIST_VERSION at export time
  exportedAt: string    // ISO timestamp
  sheets: Sheet[]
  widgets: Record<string, Widget>
  currentSheetId: string | null
}

export function buildBackup(sheets, widgets, currentSheetId): BackupFile
export function parseBackup(raw: string): BackupFile   // throws Error with a human message on any failure
```

`parseBackup` validation (structural, defensive - reject early with a specific message): JSON parses; `app === "mind-space"`; `version` is a number <= PERSIST_VERSION; `sheets` is an array where every entry has string `id`/`title` and array `widgetOrder`; `widgets` is an object whose values have string `id`/`type` and numeric `x/y/width/height`; every `widgetOrder` id exists in `widgets` (drop dangling ids rather than failing). Do not trust any field beyond these checks - extra keys pass through untouched.

Also `downloadBackup(file: BackupFile)`: `Blob` + object URL + a temporary `<a download="mind-space-backup-<yyyy-mm-dd>.json">` click, then `URL.revokeObjectURL`.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Store action

Add to the store interface + implementation:

```ts
importState: (backup: BackupFile) => void
```

Implementation: push one undo snapshot first (same `takeSnapshot` pattern the other actions use - so an accidental import is undoable in-session), then `set` `sheets`, `widgets`, `currentSheetId` (fall back to `backup.sheets[0]?.id ?? null` when the stored `currentSheetId` is not in `sheets`), clear `selectedWidgetIds`. If the backup's `version` is lower than PERSIST_VERSION, run the widget-data migration logic on it - reuse the persist `migrate` function by exporting it as a named function instead of an inline literal, and calling it with `(backupStateShape, backup.version)`.

**Verify**: `npm run typecheck` -> exit 0; `npx vitest run` -> existing suites pass.

### Step 3: UI in ZoomControls

Below the last divider, before `<AddWidgetButton />`, add:
- Export button (`Download` icon from lucide-react, label "Export backup"): reads `useStore.getState()`, calls `buildBackup` + `downloadBackup`.
- Import button (`Upload` icon, label "Import backup"): triggers a hidden `<input type="file" accept="application/json,.json">`; on file select, read text, `parseBackup` in try/catch. On parse error: surface the error message (toast or the plan-003 fallback pattern). On success: run the confirm flow from `confirm-dialog.tsx` with copy like "Replace all current sheets and widgets with this backup? Current data will be overwritten (undoable until you leave the page)." Only on confirm call `importState`. Reset the input's value after handling so the same file can be re-picked.

**Verify**: `npm run build` -> exit 0.

### Step 4: Manual check

`npm run dev`:
1. Create a recognizable widget, export - a `.json` file downloads; open it, fields match the BackupFile shape.
2. Delete the widget, import the file, confirm - state is restored exactly; Ctrl+Z reverts the import.
3. Import a text file containing `{}` - a readable error surfaces; app state untouched.
4. Cancel the confirm dialog - nothing changes.

**Verify**: all four behaviors; two failed fix attempts = STOP.

## Test plan

`src/lib/backup.test.ts` (fixture pattern from plan 001):

1. Round trip: `parseBackup(JSON.stringify(buildBackup(sheets, widgets, "s1")))` deep-equals the inputs plus envelope fields.
2. Rejections, one case each with message assertions: invalid JSON; `app` mismatch; `version` greater than PERSIST_VERSION; `sheets` not an array; widget missing numeric `x`.
3. Dangling `widgetOrder` ids are dropped, not fatal.
4. Store integration: `importState` on a seeded store replaces sheets/widgets, resets selection, pushes exactly one undo entry, and `undo()` restores the pre-import state.

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `src/lib/backup.ts` exports `buildBackup`, `parseBackup`, `downloadBackup`; persist version is single-sourced (grep: `PERSIST_VERSION` appears in both `backup.ts` and `store/index.ts`)
- [ ] Import path is guarded by the ConfirmProvider dialog (no direct `importState` call from the file handler)
- [ ] Manual checklist reported item by item
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `confirm-dialog.tsx` exposes no callable confirm API usable from ZoomControls (report its actual API; do not build a second dialog system).
- The persist `migrate` cannot be extracted/reused without changing its behavior (version drift between plans 003/004 and this one).
- You are tempted to add merge-mode import - that is explicitly out of scope.

## Maintenance notes

- Every future persist `version` bump must keep `parseBackup`'s `version <= PERSIST_VERSION` check honest: old backups must flow through the same migration chain. A backup from a NEWER app version is rejected by design.
- Reviewer focus: `parseBackup` must never let a malformed file partially apply (validate fully before any `set`).
- Deferred: per-sheet export, merge import, auto-download-on-quota-error (pairs well with plan 003's storage-error event).
