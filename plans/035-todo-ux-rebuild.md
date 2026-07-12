# Plan 035: Todo widget UX rebuild on the entity model (central-lists P2)

> **Executor instructions**: Follow step by step; verification commands are
> binding. Reviewer maintains `plans/README.md`. Design source of truth
> (decisions locked, do not relitigate): `plans/033-central-lists-design.md`,
> section "P2 interaction spec".
>
> **Drift check (run first)**: base branch `advisor/034-normalize-lists`
> @ `4333c55`. Confirm: store exports `addListItem`, `cycleListItemStatus`,
> `updateListItem`, `deleteListItem`, `moveListItem(id, beforeId, afterId)`;
> `src/lib/order-key.ts` exports `orderKeyBetween`; todo widget reads items via
> a listId selector from `data.view.source.listId`; `ListItem.status` is the
> 3-state union. Mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: L | **Risk**: MED (rich interaction surface)
- **Depends on**: plan 034 (branch above)
- **Planned at**: 2026-07-12. Interaction spec locked by maintainer + reviewer
  from prior-art research (Things 3, Todoist, TickTick, Notion, Linear).

## Why this matters

The audit called the current todo internals the worst UX in the app: the + button
sits top-right while the input appears at the very bottom; Enter closes the add
input after ONE item (no chain capture); reorder is impossible; double-nested
scroll containers; whole-widget hover reveals every row's delete. 034 gave us
the entity model (order keys, per-item actions); this plan builds the intended
interaction on top.

## The spec (implement exactly; from the design doc)

1. **Ghost add row**, pinned at the list bottom (never scrolls away): muted
   "+ Add task" row; click (or Tab/Enter focus) turns it into a real input;
   **Enter commits and refocuses a fresh empty input** (chain capture);
   Escape, or blur while empty, returns to the ghost state; blur with text
   commits. The old top-right + button is REMOVED (the header keeps only the
   open-count badge).
2. **Per-row hover** (named group `group/item`): LEFT gutter shows a drag
   handle (grip-dots icon) on that row's hover; RIGHT edge shows delete.
   Both `transition-opacity`, 24px+ hit areas, only on the hovered row.
3. **Status cycle preserved**: the status control cycles todo -> progress
   (amber) -> done, via `cycleListItemStatus`. Visuals for the three states
   stay as today.
4. **Completion motion**: on entering "done", the row gets strikethrough and
   stays in place ~1s (component-local "recently completed" id set +
   setTimeout), then moves into a **"Completed (N)" collapsed disclosure**
   rendered below active items (inside the scroll area, above the ghost row).
   Expanding it is per-widget React state (NOT persisted). Un-cycling an item
   out of done returns it to the active list (its order key still places it).
   Deleting from the completed section works the same as active.
5. **Drag reorder** within the list: pointer-drag on the LEFT handle only
   (never the row body - row body click = edit); while dragging show an
   insertion indicator line between rows; on drop call `moveListItem` with the
   neighbor ids (ONE store write, one undo entry). Reorder applies to ACTIVE
   items; completed section is not reorderable. Keep it pointer-events based
   (match the codebase; no dnd library). Autoscroll the list container when
   dragging near its edges (simple: scrollBy in the move handler).
6. **One scroll container**: the items area is the ONLY scroller (remove the
   reliance on base-widget's outer `overflow-auto` by making the todo content
   a non-overflowing flex column: pinned header row, scrollable items+completed
   region, pinned ghost row). Add a thin styled scrollbar utility in
   `globals.css` (`@layer utilities`, webkit + `scrollbar-width: thin`) and
   subtle top/bottom fade masks on the scroll region only while scrollable
   (CSS mask or gradient overlays driven by a scroll listener setting
   data attributes - keep it cheap).
7. **Inline edit**: click item text -> inline input (existing pattern); Enter
   saves, Escape cancels, empty-on-save cancels (keeps prior text), blur saves.
8. **Empty state**: just the ghost row + one muted line ("Nothing yet").
9. **Header**: open-count badge only (count of non-done items); done count
   lives on the Completed disclosure label.

## Steps

1. UI/UX pre-review (per plans/README.md gates): enumerate hover/focus/drag
   interplay risks for the new row anatomy BEFORE coding - specifically: drag
   handle vs row-click-to-edit disambiguation, ghost-row focus vs canvas
   keyboard shortcuts (typing in the input must not trigger Delete-key widget
   deletion - the existing isInput guard should cover it, verify), completed-
   section timer vs unmount (clear timeouts), scroll fades vs zoom. Write the
   list into your report.
2. Rebuild `todo-widget.tsx` per the spec. Keep per-widget subscriptions
   narrow (ordered id array selector; item rows subscribe to their own item).
   Extract a `TodoRow` memoized component.
3. `globals.css`: thin-scrollbar utility + (if used) fade-mask utility, inside
   `@layer utilities`.
4. Tests: store behavior is already covered by 034; add tests only for new
   pure logic you extract (e.g. neighbor-id computation for drop -> a pure
   helper in `src/lib/` with tests). Component tests not required.
5. Runtime verification (dev server, chrome-devtools MCP; REAL input for hover
   checks; record numbers/evidence):
   - Chain capture: click ghost row, type A Enter B Enter C Enter Escape ->
     3 items, zero mouse between; focus lands in a fresh input after each Enter.
   - Ghost row pinned while the list scrolls (add 15 items; header pinned too;
     ONE scrollbar; thin styling; fades appear only when scrollable).
   - Row hover: handle left + delete right on the hovered row only.
   - Drag reorder: drag item 1 below item 3 via the handle -> order persists,
     reload keeps it, cmd+Z restores in ONE step; indicator line visible
     mid-drag; autoscroll works on a long list.
   - Status cycle: todo -> progress (amber, stays active) -> done
     (strikethrough, ~1s, slides into Completed (N)); expanding shows it;
     un-cycling returns it to active; N updates.
   - Inline edit semantics per spec item 7.
   - Widget drag/resize/marquee/context menu still work around the new
     internals (row interactions must not leak to canvas gestures - check
     dragging a row does NOT move the widget or start a marquee).
   - Both themes; UX pass per gates (hover everything in and around).
6. Screenshots: ghost row focused mid-chain; single-row hover with handle +
   delete; mid-drag with indicator; Completed disclosure open; long-list
   scroll with fades.

## Gates & conventions

`npm install` first. Typecheck clean; `npm run test` green (baseline 155 + any
new helper tests). Lint: baseline failure only in theme-toggle.tsx. Double
quotes, no semicolons, NO em-dashes, no AI signatures. Logical commits. Do not
push.

## Done criteria

Diff touches only: `src/components/widgets/todo-widget.tsx` (+ extracted row
component file if you split it), `src/lib/` helper (+test) if extracted,
`src/app/globals.css`, `docs/screenshots/`. All step-5 checks reported with
evidence.

## STOP conditions

Drift check fails; reorder cannot produce a single history entry via
`moveListItem` (report the entry behavior you observe); row drag conflicts
with canvas gestures in a way stopPropagation cannot cleanly solve (report);
anything requiring store/history changes (034 owns those - report, do not
edit them beyond what exists).

## Out of scope

Hub widget (036); tags/#-parse and filters (037); keyboard reorder; touch
drag reorder; virtualized lists; changing other widgets.
