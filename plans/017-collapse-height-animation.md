# 017 — Animate widget collapse/expand

- **Status**: TODO
- **Commit**: 891c93d
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (base-widget.tsx, globals.css), ~30 lines
- **Depends on**: plan 010 (`--ease-out`)

## Problem

Collapsing a widget teleports: content unmounts instantly and the card snaps from `widget.height` px to header height.

```tsx
// src/components/widgets/base-widget.tsx:102-109 — current (excerpt)
style={{
  ...
  height: widget.collapsed ? undefined : widget.height,
  ...
}}
// base-widget.tsx:143-147
{!widget.collapsed && (
  <div className="flex-1 overflow-auto">
    {children}
  </div>
)}
```

The height transition must NOT be permanent: `use-widget-resize` writes `height` inline per pointer frame — a standing transition would make resize lag the cursor. Transition only while a collapse toggle is in flight.

## Target

- CSS: `.widget-collapse-anim { transition: height 200ms var(--ease-out); }` in globals.css, and in the reduced-motion block (plan 014): `.widget-collapse-anim { transition-duration: 1ms; }` (1ms, not `none` — `transitionend` must still fire).
- BaseWidget: measure header height, drive `height` numerically both ways, apply the class only during the toggle.

## Steps

1. globals.css: add `.widget-collapse-anim` as above (and the reduce override if plan 014's block exists).
2. `base-widget.tsx`:
   - refs/state: `const headerRef = useRef<HTMLDivElement>(null)` on the header div (line 115), `const [collapseAnim, setCollapseAnim] = useState(false)`.
   - replace the `onToggleCollapse={() => toggleCollapse(widgetId)}` callback (line 136) with one that sets `setCollapseAnim(true)` then calls `toggleCollapse(widgetId)`.
   - root div style: `height: widget.collapsed ? (headerRef.current ? headerRef.current.offsetHeight + 2 : undefined) : widget.height` (+2 = top/bottom border). While `headerRef` is null (first render) collapsed stays `undefined` — same as today.
   - root className: add `collapseAnim && "widget-collapse-anim overflow-hidden"`.
   - root prop: `onTransitionEnd={(e) => { if (e.propertyName === "height") setCollapseAnim(false) }}`.
   - content (line 143): render while animating so it's visible during the shrink: `{(!widget.collapsed || collapseAnim) && (...)}`.
3. Guard: in `handlePointerDown` of `use-widget-drag` nothing changes — drag moves x/y only, height transition is unaffected.

## Boundaries

- Do NOT leave the transition class applied permanently (resize must stay 1:1).
- Do NOT animate via `grid-template-rows` or `max-height` hacks — height is already a controlled px value here.
- Do NOT touch `use-widget-resize.ts` or the store's `toggleCollapse`.
- If BaseWidget structure differs from the excerpts, STOP and report.

## Verification

- **Mechanical**: `npx next build` passes.
- **Feel check**: collapse a tall widget → card shrinks smoothly to header height, content clipped (no overflow spill); expand → grows back to exact former height. Spam the chevron → animation retargets mid-flight, never jumps or sticks half-open. Resize a widget by its handle → tracks the cursor 1:1, zero lag. Reduced-motion emulation → collapse is effectively instant but still ends cleanly.
- **Done when**: collapse/expand animate at 200ms, resize latency unchanged, and `collapseAnim` never sticks `true`.
