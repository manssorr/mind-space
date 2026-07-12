# Plan 005: Fix invalid month-boundary date keys in calendar and habit widgets; deduplicate getMonthGrid

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/components/widgets/calendar-widget.tsx src/components/widgets/habit-widget.tsx src/lib/date-utils.ts`
> If these files changed vs the excerpts below (beyond plan-001's test file
> additions elsewhere), treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md
- **Category**: bug
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

Both month-grid widgets build date keys for the "filler" cells (previous/next month days shown at the grid edges) with raw arithmetic on the 0-indexed month. A January view keys December cells as `"2026-00-31"` (month zero, wrong year), and a December view keys January cells as `"2026-13-01"` (month thirteen, wrong year). Notes and habit completions recorded on those cells are stored under keys that no correct month view will ever look up - silently lost data. The grid function is also copy-pasted between the two widgets with only the week-start convention differing.

## Current state

- Date key format used everywhere: `YYYY-MM-DD` with 1-indexed zero-padded month, produced by `src/lib/date-utils.ts`:
  ```ts
  export function toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  ```
- `src/components/widgets/calendar-widget.tsx` lines 16-41, `getMonthGrid(year, month)` (month is 0-indexed, week starts Sunday):
  ```ts
  function getMonthGrid(year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrev = new Date(year, month, 0).getDate()
    const cells: { day: number; current: boolean; date: string }[] = []
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`   // BUG: month 0 -> "00", no year wrap
      cells.push({ day: d, current: false, date })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`  // correct
      cells.push({ day: d, current: true, date })
    }
    const remaining = 7 - (cells.length % 7 || 7)
    for (let d = 1; d <= remaining; d++) {
      const date = `${year}-${String(month + 2).padStart(2, "0")}-${String(d).padStart(2, "0")}`  // BUG: month 11 -> "13", no year wrap
      cells.push({ day: d, current: false, date })
    }
    return cells
  }
  ```
- `src/components/widgets/habit-widget.tsx` lines 41-67: near-identical copy, except the week starts Monday:
  ```ts
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  // loop uses startOffset - 1 instead of firstDay - 1; same three key-building bugs
  ```
- Consumers: calendar stores per-day notes in `data.notes: Record<string, string>` keyed by these strings; habit stores `data.completionDates: string[]` compared against `toDateString(new Date())` (see `getStreak`, habit-widget lines ~15-37). Cell keys must match `toDateString` output exactly.
- Conventions: pure helpers live in `src/lib/`; tests colocated as `*.test.ts` (plan 001).

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/date-utils.ts` (add `getMonthGrid`)
- `src/lib/date-utils.test.ts` (extend)
- `src/components/widgets/calendar-widget.tsx` (delete local copy, import shared)
- `src/components/widgets/habit-widget.tsx` (same)

**Out of scope** (do NOT touch):
- Migration of already-stored invalid keys (`"YYYY-00-xx"` / `"YYYY-13-xx"`) - they were never readable; leave them inert.
- Any other date logic, streak logic, or widget rendering.

## Git workflow

- Branch: `advisor/005-calendar-habit-date-fix`
- Commit style: `fix: correct month-boundary date keys in month grids`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Shared, correct `getMonthGrid` in `src/lib/date-utils.ts`

Add (JS `Date` normalizes out-of-range months, which handles year wrap for free):

```ts
export interface MonthGridCell {
  day: number
  current: boolean
  date: string
}

export function getMonthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 0): MonthGridCell[] {
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = weekStartsOn === 1 ? (firstDay === 0 ? 6 : firstDay - 1) : firstDay
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells: MonthGridCell[] = []
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ day: d, current: false, date: toDateString(new Date(year, month - 1, d)) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: toDateString(new Date(year, month, d)) })
  }
  const remaining = 7 - (cells.length % 7 || 7)
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false, date: toDateString(new Date(year, month + 1, d)) })
  }
  return cells
}
```

Note the calendar's current loop `for (let i = firstDay - 1; ...)` is exactly the `weekStartsOn = 0` case of `startOffset - 1`.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Switch both widgets to the shared function

- `calendar-widget.tsx`: delete the local `getMonthGrid`, import from `@/lib/date-utils`, call `getMonthGrid(year, month, 0)`.
- `habit-widget.tsx`: delete the local copy, call `getMonthGrid(year, month, 1)`.
- Keep each widget's `DAY_NAMES` array and all rendering untouched.

**Verify**: `npm run typecheck` -> exit 0; `grep -rn "daysInPrev" src/components/` -> no matches.

### Step 3: Tests

Extend `src/lib/date-utils.test.ts` (see Test plan).

**Verify**: `npm run verify` -> exit 0; `npm run build` -> exit 0.

## Test plan

New cases in `src/lib/date-utils.test.ts`:

1. January year-wrap: `getMonthGrid(2026, 0, 0)` - the leading non-current cells (Jan 1 2026 is a Thursday, so 4 leading cells) all have dates `2025-12-28` through `2025-12-31`.
2. December year-wrap: `getMonthGrid(2026, 11, 0)` - trailing non-current cells have `2027-01-...` dates.
3. No invalid keys ever: for every month of 2026, every cell date matches `/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/`.
4. Week-start conventions: `getMonthGrid(2026, 6, 0)[0]` grid starts on Sunday alignment; `weekStartsOn: 1` shifts by the documented offset (assert first cell dates differ accordingly for a month whose 1st is not Monday/Sunday).
5. Leap year: `getMonthGrid(2024, 1, 0)` contains a current cell `2024-02-29`.
6. Total cell count is always a multiple of 7.

## Done criteria

- [ ] `npm run verify` exits 0; `npm run build` exits 0
- [ ] `grep -rn "function getMonthGrid" src/components/` returns no matches (single copy in `src/lib/date-utils.ts`)
- [ ] Regex test (case 3) passes for all 12 months
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The two local `getMonthGrid` copies differ from the excerpts beyond the documented week-start difference.
- Widget rendering visibly changes cell layout (compare a July 2026 grid before/after by day-number sequence in tests or dev tools) - layout must be identical; only the hidden date keys change.

## Maintenance notes

- If a "week starts on" user setting ships later, both widgets already accept it via the third parameter.
- Reviewer focus: the `weekStartsOn = 0` path must reproduce the calendar's old leading-cell count exactly (off-by-one here shifts the whole grid).
- Deferred: cleaning stored invalid keys from existing users' data (harmless dead entries).
