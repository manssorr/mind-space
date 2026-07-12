# Plan 042: Todo keyboard bindings - Enter chains, subtasks, Alt-move, focus nav

> **Executor instructions**: step by step; verification binding; STOP hard.
> Update `plans/README.md` row when done. **Executor model: sonnet-class**
> (the risky substrate - tree ops + registry - landed in 040/041; this is
> disciplined wiring with heavy verification).
>
> **Drift check (run first)**: base = merge of plan 040 + 041 branch tips
> (branch `advisor/042-todo-keyboard-bindings`; Step 0 = merge 041 into your
> 040-based branch - they share no files, expect zero conflicts). Confirm:
> `src/lib/list-tree.ts` exports `buildVisibleRows`/`canIndent`/`canOutdent`;
> `src/lib/shortcuts.ts` exports `SHORTCUTS`/`matchesCombo`/
> `isEditableTarget`; scope-ordered dispatch exists in
> `use-keyboard-shortcuts.ts`; store has `indentListItem`/`outdentListItem`
> and extended `addListItem(listId, text, opts)`. Mismatch = STOP.

## Status

- **Priority**: P1 | **Effort**: M-L | **Risk**: MED-HIGH | **Category**: feature
- **Depends on**: 040 DONE + 041 DONE (hard)
- **Planned at**: `8b3e1c2`, 2026-07-12. Spec: `plans/PRD-todo-advanced.md`
  Part B1-B4 (its B4 table is the binding list). Locked decisions:
  **Alt+Up/Down STOPS at sibling boundary; status-cycle = Cmd/Ctrl+Enter;
  depth cap = 040's MAX_ITEM_DEPTH.**

## Why this matters

The PRD's headline interaction: Enter chains siblings, Shift+Enter creates
subtasks, Alt+arrows restructure without the mouse. Turns the todo widget
from click-only into a keyboard-first outliner, on the 040 tree actions and
the 041 catalog so nothing conflicts app-wide.

## Current state

- `src/components/ui/icon-button.tsx` `InlineInput` (~89-129): props
  `{ value, onChange, placeholder, onEnter, onEscape, onBlur, onPointerDown,
  autoFocus, className, type, min, inputRef }`; onKeyDown handles ONLY Enter
  (preventDefault + `onEnter()`) and Escape. `onEnter` takes NO event -
  callers cannot see shiftKey today. Consumers: todo edit + add rows, hub
  rename/add, base-widget rename, counter/habit/text/timer/quick-link.
- Todo widget: edit state `editingTodoId`/`editTodoText`; `saveEditingTodo`
  commits via `updateListItem`; add row via `addListItem`; rows render from
  `buildVisibleRows` (040) with depth/chevron; rows carry `data-item-id`;
  NO row keydown, NO focus model yet.
- Store (040): `addListItem(listId, text, opts?: {parentId, afterId})`,
  `indentListItem`, `outdentListItem`, `moveListItem(id, beforeId, afterId)`
  (sibling reorder), `cycleListItemStatus` (cascade-done),
  `deleteListItem` (cascade). One history entry each.
- Catalog (041): `SHORTCUTS` + scope-ordered dispatch; item scope dormant.
- Playwright suite exists (plan 038, `tests/e2e/`) - extend it here.
- Conventions: double quotes, no semicolons, vitest + Playwright.

## Commands

| Purpose | Command | Expect |
|---|---|---|
| Install/typecheck/tests | `npm install` / `npm run typecheck` / `npm test` | clean/green |
| E2E | see `plans/038-e2e-extension.md` for the exact Playwright invocation | specs green |
| Dev | `npm run dev` | runtime checks |

## Scope

**In scope**: `src/components/widgets/todo-widget.tsx`,
`src/components/ui/icon-button.tsx` (event passthrough only),
`src/lib/shortcuts.ts` (catalog rows), `src/hooks/use-keyboard-shortcuts.ts`
(item-scope claim), `src/lib/list-tree.ts` (only if a prev/next-visible-row
pure helper is missing), store only if the empty-Enter composite needs it,
`tests/e2e/` new spec, `docs/screenshots/`.
**Out of scope**: multi-selection (043), context menu (045), status union
(044), hub keyboard nav (deliberate follow-up - hub rows stay click-only).

## Steps

### Step 1: InlineInput event passthrough (non-breaking)

`onEnter?: () => void` becomes `onEnter?: (e: React.KeyboardEvent) => void`;
pass the event through. All existing callers keep working (they ignore the
arg). **Verify**: typecheck clean, full suite green, zero caller edits.

### Step 2: focus model on rows (item-scope substrate)

- `TodoRow` root: `tabIndex={-1}` + stable `data-item-id`; widget keeps
  `focusedItemId: string | null`; focusing `.focus()`es the row element
  (roving focus; ring via the app's `focus-visible` convention).
- ArrowUp/ArrowDown move focus across `buildVisibleRows` order (catalog:
  scope `item`, group "Todos"). Click-to-edit unchanged; Escape from edit
  returns focus to the row.
- Item scope claims keys ONLY when a row is focused and not editing. Prefer
  a row-level onKeyDown over the window listener if simpler - but every
  binding STILL registers in the catalog and respects `isEditableTarget`.
**Verify (runtime)**: click a row, arrows walk the visible tree order
(collapsed subtrees skipped), ring visible both themes.

### Step 3: editing-scope bindings (in the edit input, via Step 1 event)

- **Enter** = commit text, create SIBLING below (`addListItem(listId, "",
  {parentId: current.parentId, afterId: currentId})`), enter edit on it
  (chains).
- **Shift+Enter** = commit, create CHILD as FIRST child of current
  (`{parentId: currentId}`, order before existing first child), enter edit.
- **Enter on EMPTY text**: nested -> `outdentListItem` (keep editing);
  top-level -> exit edit and delete the empty childless artifact, focus
  previous row.
- **Backspace, caret at 0, empty text**: delete item (it is empty; if it
  somehow has children, no-op), focus previous visible row in edit at end.
- **Cmd/Ctrl+Enter** = commit + `cycleListItemStatus(currentId)`.
- **Escape** unchanged.
History semantics: each creation = own entry; an Enter-chain of 3 = 3
entries, undo peels one at a time. Assert in a store-level test.
**Verify**: extract the branching into a pure helper (e.g.
`enterActionFor(item, text, hasChildren, depth)`) and unit-test it; behavior
proven in e2e (Step 5).

### Step 4: item-scope bindings (focused row, not editing; all via catalog)

- **Enter** = enter edit. **Alt+ArrowUp/Down** = `moveListItem` among
  siblings (neighbor pair from the tree; silent no-op at boundary, NO
  history entry). **Alt+ArrowLeft/Right** = outdent/indent (guarded).
- **Cmd/Ctrl+Enter** = cycle status. **Delete/Backspace** = delete focused
  item + subtree - `useConfirm` ONLY when it has children; focus next
  survivor.
- Focus FOLLOWS the item through moves/indents (re-focus after store update,
  `scrollIntoView({block: "nearest"})`).
- Catalog: add all rows (Cmd+Enter in two scopes = legal, different scopes);
  041 uniqueness test must stay green.
**Verify**: catalog test green; runtime matrix in Step 5.

### Step 5: gates + runtime verification + evidence

Typecheck/tests/lint baseline. Runtime (real keyboard, both themes): Enter
chain x3 then 3 undos; Shift+Enter under a parent with children (lands
FIRST); empty-Enter outdent ladder from depth 3; Alt+Up at top = no-op, undo
stack unchanged; Alt+Right on first child = no-op; Cmd+Enter cycles (and
040's cascade-done still correct); `?` overlay shows the todo group; typing
"abc" in edit never triggers item scope; arrow keys scroll the canvas ONLY
when no row focused. Screenshots -> `docs/screenshots/042-*`. Update README
row.

## Test plan

- Unit: `enterActionFor` helper matrix + catalog additions (>= 8 cases).
- Store: enter-chain = N entries; boundary move = no entry.
- E2E `tests/e2e/todo-keyboard.spec.ts` (model on 038 specs): enter-chain,
  shift+enter subtask, alt-move with subtree, indent/outdent, focus-follow,
  editing-swallows-shortcuts.
- Runtime matrix (Step 5) recorded in PR body.

## Done criteria

- [ ] typecheck + unit + e2e green (new spec listed in PR)
- [ ] Every new binding present in `SHORTCUTS`; uniqueness test green
- [ ] Enter/Shift+Enter/empty-Enter/Backspace-empty per spec (e2e-proven)
- [ ] Boundary no-ops push NO history entry (store test)
- [ ] Focus ring + focus-follow runtime-verified; screenshots committed

## STOP conditions

- Drift check fails; 040's tree API can't express an operation (report).
- InlineInput change breaks a non-todo consumer (report; don't fork it).
- Item-scope dispatch conflicts with canvas shortcuts in a way 041's
  resolver can't order (report - that invalidates 041's design; don't patch
  around it).

## Maintenance notes

- 043 builds Shift+Arrow selection ON this focus model - keep
  `focusedItemId` and visible-row helpers reachable.
- Hub keyboard nav deferred; when added, reuse the same row handler.
- Reviewer: watch preventDefault leaks (arrows must not scroll canvas while
  item-focused; must still scroll when nothing focused).
