# Plan 002: Stop persisted malformed URLs from crashing the app; add error boundaries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c67f186..HEAD -- src/components/widgets/quick-link-widget.tsx src/app/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md (test runner)
- **Category**: bug
- **Planned at**: commit `c67f186`, 2026-07-11

## Why this matters

The quick-link widget calls `new URL(...)` unguarded during render. A user who saves a value like `http://` or `foo bar` gets a render exception on every subsequent render. Because the value is persisted to localStorage and there is no error boundary anywhere in the app, the app is bricked on every load until the user manually clears site data. One bad keystroke = permanent white screen.

## Current state

- `src/components/widgets/quick-link-widget.tsx` - the whole bug surface.
  - Lines 13-20: `getFaviconUrl` wraps its `new URL` in try/catch (safe).
  - Lines 22-27, `normalizeUrl` - prefixes `https://` when the scheme is missing:
    ```ts
    function normalizeUrl(url: string): string {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `https://${url}`
      }
      return url
    }
    ```
  - Lines 50-54, `handleFinishEdit` - saves any trimmed string with no validation:
    ```ts
    const handleFinishEdit = useCallback(() => {
      const trimmed = urlInput.trim()
      updateWidget(widgetId, { data: { url: trimmed } })
      setEditing(false)
    }, [urlInput, updateWidget, widgetId])
    ```
  - Line 103 - the unguarded call, inside JSX:
    ```tsx
    {url ? new URL(normalizeUrl(url)).hostname.replace("www.", "") : "No URL set"}
    ```
    `new URL("https://foo bar")` and `new URL("http://")` throw TypeError. The throw happens in render, unmounts the tree, and repeats on reload because `data.url` is persisted.
- `src/app/` contains only `layout.tsx`, `page.tsx`, `app/page.tsx`, `globals.css`. There is no `error.tsx` or `global-error.tsx`, so any render error anywhere kills the whole app.
- Repo conventions: double quotes, no semicolons, function components with hooks, widget files export a `memo(...)` component. `src/lib/` holds small pure utility modules (see `src/lib/date-utils.ts`).

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Tests     | `npx vitest run`       | all pass            |
| Build     | `npm run build`        | exit 0              |

## Suggested executor toolkit

- **Before writing the error-boundary files**: this repo's `AGENTS.md` warns that this Next.js version (16.2.10) may differ from your training data. Read the error-handling guide bundled with the installed version first: look under `node_modules/next/dist/docs/` (e.g. a file about `error.tsx` / `global-error.tsx` conventions). If that directory does not exist after `npm install`, use https://nextjs.org/docs/app/building-your-application/routing/error-handling and note the substitution in your report.

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/quick-link-utils.ts` (create - extracted helpers)
- `src/lib/quick-link-utils.test.ts` (create)
- `src/components/widgets/quick-link-widget.tsx`
- `src/app/error.tsx` (create)
- `src/app/global-error.tsx` (create)

**Out of scope** (do NOT touch):
- `src/store/index.ts` - no store changes; the fix is render-side.
- Favicon behavior/privacy (the Google favicon fetch) - noted for a future plan, not this one.
- Any other widget.

## Git workflow

- Branch: `advisor/002-quick-link-crash-fix`
- Commit style: `fix: guard quick-link URL parsing and add error boundaries`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract and harden URL helpers

Create `src/lib/quick-link-utils.ts`. Move `normalizeUrl` and `getFaviconUrl` from the widget file into it unchanged, and add:

```ts
export function safeHostname(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}
```

Export all three. Update `quick-link-widget.tsx` to import them from `@/lib/quick-link-utils` and delete the local copies.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Guard the render path

In `quick-link-widget.tsx`:
- Replace line 103's expression with a value computed above the JSX: `const hostname = url ? safeHostname(url) : null`, rendered as `{hostname ?? (url ? "Invalid URL" : "No URL set")}`.
- In `handleOpen`, only call `window.open` when `safeHostname(url)` is non-null (keep the existing `"_blank", "noopener,noreferrer"` arguments).
- Leave `handleFinishEdit` saving the raw trimmed string (users may save partially-typed URLs; the render is now safe). Do not add save-time validation UI in this plan.

**Verify**: `npm run typecheck` -> exit 0; `grep -n "new URL" src/components/widgets/quick-link-widget.tsx` -> no matches (all URL parsing now lives in the guarded helpers).

### Step 3: Add error boundaries

Following the installed Next.js docs from the toolkit section, create:
- `src/app/error.tsx` - client component (`"use client"`) receiving `{ error, reset }`; render a short message and a "Try again" button calling `reset()`.
- `src/app/global-error.tsx` - same shape but rendering its own `<html>`/`<body>` per the docs convention.

Match repo styling utilities (Tailwind classes like the ones in `src/components/ui/empty-state.tsx`) - keep it minimal.

**Verify**: `npm run build` -> exit 0.

### Step 4: Tests

Create `src/lib/quick-link-utils.test.ts` (see Test plan).

**Verify**: `npx vitest run src/lib/quick-link-utils.test.ts` -> all pass.

## Test plan

In `src/lib/quick-link-utils.test.ts`, model structure after `src/lib/date-utils.test.ts` (from plan 001):

- `normalizeUrl`: bare domain gets `https://` prefix; `http://` and `https://` inputs pass through unchanged.
- `safeHostname("example.com")` -> `"example.com"`; `safeHostname("https://www.example.com/x")` -> `"example.com"`.
- The regression cases: `safeHostname("http://")` -> `null`, `safeHostname("foo bar")` -> `null`, `safeHostname("")` -> `null`. No throw in any case.
- `getFaviconUrl("not a url")` -> `""` (existing behavior preserved).

## Done criteria

- [ ] `npm run verify` exits 0 (typecheck + lint + tests)
- [ ] `npm run build` exits 0
- [ ] `grep -rn "new URL" src/components/` returns no matches
- [ ] `src/app/error.tsx` and `src/app/global-error.tsx` exist
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the live code (drift).
- The installed Next.js docs describe an error-file convention that contradicts the `error.tsx`/`global-error.tsx` shape in step 3 - follow the docs, and report the difference.
- `npm run build` fails on the error-boundary files after one fix attempt.

## Maintenance notes

- If a rich URL validation UX is added later (save-time feedback), it belongs in the widget's editing branch, not in the helpers - keep helpers pure.
- Reviewer focus: confirm no code path constructs `new URL` outside the try/catch helpers.
- Deferred: favicon privacy (bookmarked hostnames are sent to `www.google.com/s2/favicons`; contradicts the README's "everything local" framing). If the maintainer wants it, add a settings toggle or local letter-avatar fallback in a future plan.
