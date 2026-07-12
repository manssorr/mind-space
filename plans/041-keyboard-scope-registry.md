# Plan 041: Keyboard governance - scope resolver, shortcut catalog, ? help overlay

> **Executor instructions**: step by step; verification binding; STOP hard.
> Update `plans/README.md` row when done. **Executor model: opus-class**
> (behavior-preserving refactor of live app-wide input handling).
>
> **Drift check (run first)**: base = tip of `advisor/036-todo-hub` (this plan
> touches NO todo files and can branch in parallel with 039/040 as
> `advisor/041-keyboard-scope-registry`). Confirm:
> `src/hooks/use-keyboard-shortcuts.ts` is a single window keydown listener
> (~74 lines) with an inline `isInput` guard at line ~10, and
> `src/hooks/use-canvas-gestures.ts` has its own Space-key keydown listener
> (~251-270) with a duplicated `isInput` guard at ~253. No file matching
> shortcut/keymap/registry exists in src. Mismatch = STOP.

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED | **Category**: tech-debt/feature
- **Depends on**: none (parallel-safe with 036R/039/040)
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part B0 + B4 (read it). This plan ships INFRA + the `?` overlay ONLY - no
  new todo bindings (those are plan 042, gated on this).

## Why this matters

The app has ~9 shortcuts spread across two ad-hoc keydown listeners with a
copy-pasted editable-target guard, zero discoverability, and no rule stopping
the next binding from colliding. The PRD mandates a governed system: fixed
context scopes, fixed modifier meanings, one authoritative catalog, and a `?`
help overlay. Every future binding (042+) registers here or does not ship.

## Current state

- `src/hooks/use-keyboard-shortcuts.ts` (all bindings, if/else chain):
  Backspace/Delete -> delete selected widgets (13-20); Cmd/Ctrl+Z undo
  (22-26); Cmd/Ctrl+Shift+Z redo (28-38, two casings); Cmd/Ctrl+D duplicate
  (40-47); Cmd/Ctrl+C copy (49-56); Cmd/Ctrl+V paste (58-65). Guard line 10:
  `target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
  target.isContentEditable`. Mounted once from
  `src/components/canvas/index.tsx:57`.
- `src/hooks/use-canvas-gestures.ts:251-270` - Space hold-to-pan (down sets
  `spaceHeld.current`, up clears), SAME guard duplicated at 253. Also
  Cmd/Ctrl+wheel zoom (278-291; wheel, not keydown - stays put).
- Pointer-modifier semantics that must appear in the catalog as
  documentation rows (not keydown-dispatched): Shift drag = axis lock
  (`use-widget-drag.ts:96-100`), Alt drag = duplicate
  (`use-widget-drag.ts:49-55`), Shift/Cmd click = additive select
  (`base-widget.tsx:54-59`), modifier marquee (`use-canvas-gestures.ts:115`).
- No Cmd+A anywhere. No app-wide Escape-to-deselect (only local menu closers
  in `widget-toolbar.tsx:65-71`, `sheet-sidebar.tsx:109-117`).
- Landing copy `src/app/page.tsx:64` mentions "Space to pan, Ctrl+Z to undo,
  Ctrl+D to duplicate" - keep true.
- Dialog exemplar for the overlay: `src/components/ui/confirm-dialog.tsx`
  (Radix Dialog, portal, overlay styling). Existing deps: Radix Dialog +
  Base UI context menu; do NOT add a new dependency.
- Conventions: double quotes, no semicolons, vitest.

## Commands

| Purpose | Command | Expect |
|---|---|---|
| Install/typecheck/tests | `npm install` / `npm run typecheck` / `npm test` | exit 0 / clean / green |
| Dev | `npm run dev` | runtime checks |

## Scope

**In scope**: `src/lib/shortcuts.ts` (new, +test),
`src/hooks/use-keyboard-shortcuts.ts`, `src/hooks/use-canvas-gestures.ts`
(guard extraction + registration only - do NOT restructure gestures),
`src/components/ui/shortcut-help.tsx` (new), the mount point in
`src/components/canvas/index.tsx`, `docs/screenshots/`.
**Out of scope**: any todo/hub file, any NEW binding beyond `?` (042's job),
`use-widget-drag.ts` (documented in catalog, code untouched), store.

## Steps

### Step 1: the catalog module `src/lib/shortcuts.ts`

Header comment = the governance rules, verbatim from PRD B0: scope order
editing > item > widget > canvas, first claim wins; modifier meanings fixed
app-wide (Cmd/Ctrl = command, Shift = extend/promote, Alt = structural/move,
Cmd+Shift = command variant); no combo may mean two things in one scope; this
file is the ONLY registry. Exports:
- `type ShortcutScope = "editing" | "item" | "widget" | "canvas"`
- `interface ShortcutDef { id: string; keys: string; scope: ShortcutScope;
  description: string; group: string; kind: "keydown" | "pointer-doc" }`
  (`pointer-doc` rows render in help but are not dispatched here).
- `SHORTCUTS: ShortcutDef[]` - every existing binding above + Space pan +
  the four pointer-doc rows + `?` (help).
- `isEditableTarget(t: EventTarget | null): boolean` - the extracted guard.
- `matchesCombo(e: KeyboardEvent, keys: string): boolean` - parses
  `"mod+shift+z"`-style strings (`mod` = metaKey||ctrlKey; exact modifier
  set must match - `mod+z` must NOT fire on mod+shift+z).
- `assertCatalogSane(defs)`: throws on duplicate (scope, normalized combo) -
  exercised by a unit test; that test IS the enforcement mechanism.
**Verify**: new `src/lib/shortcuts.test.ts`: combo-parsing matrix (plain,
mod, mod+shift, case), exact-modifier rejection, catalog uniqueness passes,
a deliberately duplicated fixture throws.

### Step 2: refactor the two hooks onto the catalog (behavior-preserving)

- `use-keyboard-shortcuts.ts`: replace the inline guard with
  `isEditableTarget`; replace each raw key test with `matchesCombo` against
  the catalog entry. Keep the SAME actions, order, and preventDefault
  behavior. Structure dispatch as an explicit ordered scope check (editing
  -> return; then canvas) so 042 can insert item scope without redesign.
- `use-canvas-gestures.ts`: swap the duplicated guard for the
  `isEditableTarget` import. Space stays where it is (gesture-coupled); its
  catalog row feeds the help overlay.
**Verify**: full suite green; manual smoke: undo, redo (both casings),
duplicate, copy/paste, delete, space-pan all work; typing in a todo edit
input and the note textarea swallows all of them.

### Step 3: `?` help overlay

`src/components/ui/shortcut-help.tsx`: Radix Dialog modeled on
`confirm-dialog.tsx`. Opens on `?` (shift+/) when NOT editing; closes on
Escape/overlay click. Renders `SHORTCUTS` grouped by `group`, kbd-styled keys
(`<kbd>` with border/rounded/bg-muted), mac-vs-win modifier label via
platform check, both themes. Mount alongside the shortcuts hook in
`canvas/index.tsx`.
**Verify (runtime, real input)**: `?` opens overlay; typing "?" inside a todo
edit does NOT; every catalog row visible; Escape closes; both-theme
screenshots -> `docs/screenshots/041-*`.

### Step 4: gates + evidence

Typecheck, tests, lint baseline (`theme-toggle.tsx` only). README UI/UX
gates: overlay open -> hover behind it leaks nothing (Radix modal should
handle it - verify explicitly, this was the 026 bug class). Update README
row; PR body includes the catalog table (it doubles as the shortcut spec).

## Test plan

`src/lib/shortcuts.test.ts` per Step 1 (>= 10 cases). No markup tests for the
overlay (runtime-verified). Existing suite green = the behavior-preservation
gate for Step 2.

## Done criteria

- [ ] typecheck + tests green incl. new shortcuts tests
- [ ] `grep -rn "isContentEditable" src/` -> guard defined ONLY in
      `src/lib/shortcuts.ts` (hooks import it)
- [ ] All 9 pre-existing shortcuts verified working (listed in PR body)
- [ ] `?` overlay runtime-verified both themes, no hover leak, screenshots
- [ ] Catalog uniqueness enforced by a test that fails on a duplicate

## STOP conditions

- Drift check fails; or an existing shortcut's behavior cannot be preserved
  exactly through the refactor (report which and why).
- The overlay would need a new dependency.
- You find yourself adding a NEW todo binding - that is plan 042, stop.

## Maintenance notes

- 042/043/044 each ADD catalog rows + dispatch in their scope; reviewer must
  reject any binding not present in `SHORTCUTS`.
- The item scope is intentionally dormant here; 042 activates it (focused
  todo row = the item-scope claimant).
- If per-OS combos are ever needed, extend `ShortcutDef.keys` to a map -
  don't fork the catalog.
