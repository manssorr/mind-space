# Plan 007: Single-source widget registry (one-file widget registration); prune unshipped widget types

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/types/index.ts src/components/widgets/widget-registry.tsx src/components/canvas/add-widget-button.tsx`
> Plan 006 may have changed how the canvas consumes the registry; read the live
> consumer before editing. Unexplained mismatches with the excerpts below are a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md
- **Category**: tech-debt
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

Adding a widget type today is a 4-file shotgun edit: the `WidgetType` enum, the component file, the `widgetComponents` map, and the `WIDGET_OPTIONS` menu array (which duplicates labels, icons, and default sizes). Forgetting one file yields a silently broken widget at runtime. The enum also declares 22 types while only 9 are implemented - 13 dead values (`Image`, `Link`, `Drawing`, `Code`, `File`, `Clock`, `Weather`, `Embed`, `Divider`, `Checklist`, `MindMap`, `Kanban`, `Mood`) that mislead readers and type-checkers. After this plan, one registry entry defines a widget completely, and the enum matches reality.

## Current state

- `src/types/index.ts` lines 1-24: `WidgetType` enum with 22 string values; only these 9 are wired: `note, todo, calendar, text, habit, counter, timer, stopwatch, quicklink`.
- `src/components/widgets/widget-registry.tsx` (whole file, 26 lines):
  ```ts
  export const widgetComponents: Partial<
    Record<WidgetType, ComponentType<{ widgetId: string }>>
  > = {
    timer: TimerWidget, stopwatch: StopwatchWidget, quicklink: QuickLinkWidget,
    calendar: CalendarWidget, habit: HabitWidget, todo: TodoWidget,
    counter: CounterWidget, note: NoteWidget, text: TextWidget,
  }
  ```
- `src/components/canvas/add-widget-button.tsx`:
  - Lines 9-19: `WIDGET_OPTIONS` array duplicating type/label/icon, with string casts like `{ type: "note" as WidgetType, label: "Note", icon: StickyNote }`.
  - Lines 32-53, `handleAddWidget`: builds the new widget; contains per-type special cases:
    ```ts
    const isHabit = type === "habit"
    addWidget(currentSheetId, {
      id, type,
      title: isHabit ? "Coding Habit" : label,
      x: 100 + Math.random() * 100, y: 100 + Math.random() * 100,
      width: 280, height: isHabit ? 340 : 240,
      zIndex: Date.now(), collapsed: false, data: {},
    })
    ```
- Consumer of `widgetComponents`: the canvas (`src/components/canvas/index.tsx`, `widgetComponents[widget.type as WidgetType]` - location may have moved into a `CanvasWidget` component if plan 006 landed). It has a fallback render for unknown types - keep that; persisted data may contain old type strings.
- Widget data payloads are untyped (`data: Record<string, unknown>`, `src/types/index.ts:36`) - out of scope here, but do not make it worse.
- Conventions: double quotes, no semicolons; lucide-react icons.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope** (the only files you should modify or create):
- `src/components/widgets/widget-registry.tsx`
- `src/components/canvas/add-widget-button.tsx`
- `src/types/index.ts` (enum pruning only)
- `src/components/widgets/widget-registry.test.ts` (create)
- The one line in the canvas that indexes `widgetComponents`, only if the export shape change requires it.

**Out of scope** (do NOT touch):
- Widget component files themselves.
- The store; the `Widget` interface fields (including the `data: Record<string, unknown>` looseness and the `zIndex: Date.now()` quirk - leave both).
- Building any of the 13 unshipped widgets.

## Git workflow

- Branch: `advisor/007-widget-metadata-registry`
- Commit style: `refactor: single-source widget registry` then `refactor: prune unshipped widget types`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the registry

Rewrite `widget-registry.tsx` around one definition table:

```ts
import type { LucideIcon } from "lucide-react"
// icons: StickyNote, Type, Timer, Clock, Link, Calendar, CheckSquare, ListTodo, Calculator

export interface WidgetDef {
  type: WidgetType
  label: string
  icon: LucideIcon
  component: ComponentType<{ widgetId: string }>
  defaultTitle: string
  defaultSize: { width: number; height: number }
  defaultData: Record<string, unknown>
}

export const WIDGET_DEFS: Record<WidgetType, WidgetDef> = { /* 9 entries */ }

export const widgetComponents = Object.fromEntries(
  Object.values(WIDGET_DEFS).map((d) => [d.type, d.component])
) as Partial<Record<WidgetType, ComponentType<{ widgetId: string }>>>
```

Populate the 9 entries from today's data: labels and icons from `WIDGET_OPTIONS` (add-widget-button lines 9-19); `defaultSize` = 280x240 for all except habit (280x340); `defaultTitle` = label for all except habit (`"Coding Habit"`); `defaultData` = `{}` for all. Keep the `widgetComponents` export so canvas code compiles unchanged. Note: `Record<WidgetType, WidgetDef>` (not Partial) only compiles after step 3 prunes the enum; if you do step 1 first, use Partial temporarily and tighten in step 3.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Derive the add-widget menu

In `add-widget-button.tsx`: delete `WIDGET_OPTIONS`; map over `Object.values(WIDGET_DEFS)` for the menu; in `handleAddWidget`, look up `const def = WIDGET_DEFS[type]` and build the widget from `def.defaultTitle`, `def.defaultSize`, `def.defaultData` - removing the `isHabit` special case. Keep the random 100-200 px placement and `zIndex: Date.now()` exactly as-is.

**Verify**: `npm run typecheck` -> exit 0; `grep -n "as WidgetType" src/components/canvas/add-widget-button.tsx` -> no matches.

### Step 3: Prune the enum

In `src/types/index.ts`, remove the 13 unshipped values, keeping exactly: `Note, Todo, Calendar, Text, Habit, Counter, Timer, Stopwatch, QuickLink`. Then:

- `grep -rn "WidgetType\." src/` and fix any reference to a removed member (expected: none outside the enum itself; `initializeDefaultState` in the store uses `WidgetType.Note/Todo/QuickLink` - all kept).
- Tighten step 1's record to non-Partial `Record<WidgetType, WidgetDef>` so the compiler enforces "every type has a full definition" from now on.
- Persisted user data may hold removed type strings; the canvas's unknown-type fallback covers them at runtime. Confirm the fallback still exists (canvas renders a placeholder card for types without a component).

**Verify**: `npm run typecheck` -> exit 0; `npm run build` -> exit 0.

### Step 4: Tests

Create `src/components/widgets/widget-registry.test.ts` (see Test plan). Note: importing the registry pulls in React components; vitest with jsdom (plan 001 config) handles this - the test only inspects the table, it does not render.

**Verify**: `npm run verify` -> exit 0.

## Test plan

`widget-registry.test.ts`:

1. Every `WidgetType` enum member has an entry in `WIDGET_DEFS` (`Object.values(WidgetType).every(...)`).
2. Every def has a non-empty `label`, `defaultTitle`, a `component` function, and `defaultSize` width/height > 0.
3. `widgetComponents[WidgetType.Note]` is defined (derived map works).
4. Habit's `defaultSize.height` is 340 and `defaultTitle` is `"Coding Habit"` (special case preserved through the refactor).

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `Object.values(WidgetType).length` is 9 (assert in the test)
- [ ] `grep -rn "WIDGET_OPTIONS" src/` returns no matches
- [ ] Adding a hypothetical widget type now requires: 1 enum value + 1 component file + 1 `WIDGET_DEFS` entry (state this check in your report by walking the compile errors that a fake entry produces, then removing it)
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -rn` in step 3 finds code paths referencing removed enum members outside `types/index.ts`.
- The canvas no longer has an unknown-type fallback (plan 006 restructuring removed it) - it must be restored there, not here; report instead.
- Enum pruning breaks persisted-state typing in the store in a way that needs `Widget` interface changes (out of scope).

## Maintenance notes

- This registry is the natural seam for future work: templates (plan-level idea), a plugin system, and typed per-widget `data` payloads (a discriminated union over `WidgetDef` would replace `getWidgetData`'s blind cast) - all deferred.
- Reviewer focus: menu order. `Object.values` preserves insertion order; keep `WIDGET_DEFS` entries in the old `WIDGET_OPTIONS` order so the add-menu does not reshuffle.
- If any of the 13 pruned types is wanted later, re-adding the enum value forces (via the non-Partial Record) a complete definition - that is the point.
