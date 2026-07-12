"use client"

import { useCallback, useRef, useState, useMemo, memo } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { useWidgetDrag } from "@/hooks/use-widget-drag"
import { useTheme } from "@/components/theme-provider"
import { getThemeVariables } from "@/lib/widget-colors"
import { WidgetToolbar } from "./widget-toolbar"
import { WidgetContextMenu } from "./widget-context-menu"
import { SelectionOutline } from "./selection-outline"
import { InlineInput } from "@/components/ui/icon-button"

interface BaseWidgetProps {
  widgetId: string
  children?: React.ReactNode
  hideTitle?: boolean
}

export const BaseWidget = memo(function BaseWidget({
  widgetId,
  children,
  hideTitle = false,
}: BaseWidgetProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [collapseAnim, setCollapseAnim] = useState(false)
  const pendingCollapse = useRef<{ x: number; y: number } | null>(null)
  const pendingDeselect = useRef<{ x: number; y: number } | null>(null)

  const widget = useStore((s) => s.widgets[widgetId])
  const isSelected = useStore((s) => s.selectedWidgetIds.includes(widgetId))
  const isEntering = useStore((s) => s.enteringWidgetIds.includes(widgetId))
  const isExiting = useStore((s) => s.exitingWidgetIds.includes(widgetId))
  const selectWidget = useStore((s) => s.selectWidget)
  const addToSelection = useStore((s) => s.addToSelection)
  const removeFromSelection = useStore((s) => s.removeFromSelection)
  const toggleCollapse = useStore((s) => s.toggleCollapse)
  const renameWidget = useStore((s) => s.renameWidget)

  const { resolvedTheme } = useTheme()
  const dragHandlers = useWidgetDrag(widgetId)

  const themeVars = useMemo(
    () => getThemeVariables(widget?.colorTheme, resolvedTheme === "dark"),
    [widget?.colorTheme, resolvedTheme]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 0) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          if (isSelected) {
            pendingDeselect.current = { x: e.clientX, y: e.clientY }
          } else {
            addToSelection(widgetId)
          }
        } else if (isSelected) {
          pendingCollapse.current = { x: e.clientX, y: e.clientY }
        } else {
          selectWidget(widgetId)
        }
        e.stopPropagation()
      }
      // Middle-button (pan) is left to bubble to the canvas gesture handler,
      // which starts a pan from anywhere, including over widgets.
    },
    [selectWidget, addToSelection, widgetId, isSelected]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const pending = pendingCollapse.current
    pendingCollapse.current = null
    if (pending) {
      const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y)
      if (dist < 4) {
        selectWidget(widgetId)
      }
    }

    const pendingDeselectPos = pendingDeselect.current
    pendingDeselect.current = null
    if (pendingDeselectPos) {
      const dist = Math.hypot(e.clientX - pendingDeselectPos.x, e.clientY - pendingDeselectPos.y)
      if (dist < 4) {
        removeFromSelection(widgetId)
      }
    }
  }, [selectWidget, removeFromSelection, widgetId])

  const handlePointerCancel = useCallback(() => {
    pendingCollapse.current = null
    pendingDeselect.current = null
  }, [])

  const handleStartRename = useCallback(() => {
    if (!widget) return
    setRenameValue(widget.title)
    setRenaming(true)
    requestAnimationFrame(() => {
      renameInputRef.current?.select()
    })
  }, [widget])

  const handleFinishRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      renameWidget(widgetId, trimmed)
    }
    setRenaming(false)
  }, [renameValue, renameWidget, widgetId])

  if (!widget) return null

  return (
    <WidgetContextMenu widgetId={widgetId} onStartRename={handleStartRename}>
      <div
        className={cn(
          "absolute rounded-xl border bg-card text-card-foreground shadow-sm select-none group flex flex-col",
          isSelected && "shadow-md",
          isEntering && "widget-enter",
          isExiting && "widget-exit",
          collapseAnim && "widget-collapse-anim overflow-hidden"
        )}
        style={{
          left: widget.x,
          top: widget.y,
          width: widget.width,
          height: widget.collapsed
            ? headerRef.current
              ? headerRef.current.offsetHeight + 2
              : undefined
            : widget.height,
          zIndex: widget.zIndex,
          ...themeVars,
        } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onAnimationEnd={(e) => {
          if (e.animationName === "widget-enter") {
            useStore.getState().clearEnteringWidget(widgetId)
          }
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "height") setCollapseAnim(false)
        }}
      >
        {isSelected && <SelectionOutline widgetId={widgetId} collapsed={widget.collapsed} />}

        <div
          ref={headerRef}
          {...dragHandlers}
          className={cn(
            "flex items-center justify-between bg-muted/30 px-2 py-1 cursor-grab active:cursor-grabbing shrink-0",
            widget.collapsed ? "rounded-xl" : "rounded-t-xl border-b"
          )}
          style={{ touchAction: "none" }}
        >
          {renaming ? (
            <InlineInput
              inputRef={renameInputRef}
              value={renameValue}
              onChange={setRenameValue}
              onEnter={handleFinishRename}
              onEscape={() => setRenaming(false)}
              onBlur={handleFinishRename}
              onPointerDown={(e) => e.stopPropagation()}
              autoFocus
              className="flex-1 h-6 min-w-0"
            />
          ) : (
            <WidgetToolbar
              widgetId={widgetId}
              collapsed={widget.collapsed}
              onToggleCollapse={() => {
                setCollapseAnim(true)
                toggleCollapse(widgetId)
              }}
              onStartRename={handleStartRename}
              hideTitle={hideTitle}
            />
          )}
        </div>

        {(!widget.collapsed || collapseAnim) && (
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        )}
      </div>
    </WidgetContextMenu>
  )
})
