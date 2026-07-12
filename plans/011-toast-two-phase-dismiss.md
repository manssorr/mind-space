# 011 — Toast two-phase dismiss + swipe transition fix

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 1 file (toast.tsx), ~30 lines
- **Depends on**: plan 010 (exit CSS must exist first)

## Problem

Two defects in `src/components/ui/toast.tsx`:

**1. Exit animation can never play.** The provider hard-removes the toast from state after 4s:

```tsx
// src/components/ui/toast.tsx:38-44 — current
const addToast = useCallback((toast: Omit<Toast, "id">) => {
  const id = crypto.randomUUID()
  setToasts((prev) => [...prev, { ...toast, id }])
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, 4000)
}, [])
```

Removing from the array unmounts `ToastPrimitive.Root` instantly. Radix only plays the `data-[state=closed]` exit animation when `open` flips to `false` while the element stays mounted. So even with plan 010's CSS in place, toasts teleport away. Same for `removeToast` (line 46-48, called from `onOpenChange`).

**2. Swipe gesture lags the finger.** The root has `transition-all` (line 63) while Radix drives `data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]` per pointer frame — the transition interpolates toward each new finger position instead of tracking it 1:1. `transition-all` also transitions every other property by accident.

## Target

Two-phase dismissal: flip `open` to `false` (exit animation plays), then prune state after the 150ms exit finishes. Swipe follows the finger with no transition; only swipe-cancel animates back.

```tsx
interface Toast {
  id: string
  title: string
  description?: string
  variant?: "default" | "destructive" | "success"
  open: boolean
}
```

Class changes on `ToastPrimitive.Root` (line 63): replace `transition-all` with

```
transition-transform duration-200 data-[swipe=move]:transition-none data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full
```

## Repo conventions to follow

- State updates via functional `setToasts((prev) => …)` as the file already does.
- Timings: exit animation is 150ms (`animate-out` from plan 010); prune at 300ms for margin.

## Steps

1. `toast.tsx:14-19`: add `open: boolean` to the `Toast` interface.
2. Replace `addToast`/`removeToast` (lines 38-48) with a dismiss-then-prune pair. Keep timer handles so a manual close cancels the auto-dismiss:

   ```tsx
   const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

   const dismissToast = useCallback((id: string) => {
     const t = timers.current.get(id)
     if (t) clearTimeout(t)
     timers.current.delete(id)
     setToasts((prev) =>
       prev.map((t) => (t.id === id ? { ...t, open: false } : t))
     )
     setTimeout(() => {
       setToasts((prev) => prev.filter((t) => t.id !== id))
     }, 300)
   }, [])

   const addToast = useCallback((toast: Omit<Toast, "id" | "open">) => {
     const id = crypto.randomUUID()
     setToasts((prev) => [...prev, { ...toast, id, open: true }])
     timers.current.set(id, setTimeout(() => dismissToast(id), 4000))
   }, [dismissToast])
   ```

   Export `dismissToast` under the existing `removeToast` name in the context value so `ToastContextValue` and consumers stay untouched (or rename in the interface — either way, no consumer files change).
   Add `useRef` to the react import.
3. `ToastPrimitive.Root` (line 56-61): change `open` to `open={toast.open}` and `onOpenChange` to call `dismissToast(toast.id)` when `!open`.
4. Line 63 className: replace `transition-all` with `transition-transform duration-200 data-[swipe=move]:transition-none data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full`. Keep the three existing `data-[swipe=…]:translate-x-*` classes and everything else.

## Boundaries

- Do NOT change globals.css (plan 010 owns it).
- Do NOT change toast call sites (`sheet-sidebar.tsx` etc.) — the context API shape stays the same.
- Do NOT add dependencies.
- If the provider code differs from the excerpt (drift), STOP and report.

## Verification

- **Mechanical**: `npx next build` passes; no TypeScript errors on the `Toast` type change.
- **Feel check**: `npm run dev`, open `/app`:
  - create a sheet → toast slides in; wait 4s → it slides OUT to the right (no instant vanish),
  - click the X → same exit animation, and the toast does not reappear or double-fire,
  - drag the toast right slowly → it sticks to the pointer with zero lag; release before the threshold → it springs back (200ms transition); fling past the threshold → it animates off-screen,
  - fire 3 toasts fast → each dismisses independently; dismissing one doesn't restart animations on the others.
- **Done when**: no toast ever disappears without its 150ms exit, and swipe tracking is 1:1.
