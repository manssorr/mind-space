"use client"

import { memo, useCallback, useState, useRef, useEffect } from "react"
import { useStore } from "@/store"
import { IconButton } from "@/components/ui/icon-button"
import { quantize } from "@/lib/geometry"
import { Plus, Timer, Clock, Link, Calendar, CheckSquare, StickyNote, Type, ListTodo, Calculator } from "lucide-react"
import type { WidgetType } from "@/types"

const WIDGET_OPTIONS: { type: WidgetType; label: string; icon: typeof Timer }[] = [
  { type: "note" as WidgetType, label: "Note", icon: StickyNote },
  { type: "text" as WidgetType, label: "Label", icon: Type },
  { type: "timer" as WidgetType, label: "Timer", icon: Timer },
  { type: "stopwatch" as WidgetType, label: "Stopwatch", icon: Clock },
  { type: "quicklink" as WidgetType, label: "Quick Link", icon: Link },
  { type: "calendar" as WidgetType, label: "Calendar", icon: Calendar },
  { type: "habit" as WidgetType, label: "Habit Tracker", icon: CheckSquare },
  { type: "todo" as WidgetType, label: "Todo List", icon: ListTodo },
  { type: "counter" as WidgetType, label: "Counter", icon: Calculator },
]

function stopPropagation(e: React.PointerEvent) {
  e.stopPropagation()
}

export const AddWidgetButton = memo(function AddWidgetButton() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const addWidget = useStore((s) => s.addWidget)
  const currentSheetId = useStore((s) => s.currentSheetId)
  const gridSize = useStore((s) => s.canvasState.gridSize)

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      if (!currentSheetId) return
      const id = crypto.randomUUID()
      const label = WIDGET_OPTIONS.find((o) => o.type === type)?.label ?? type
      const isHabit = type === "habit"
      addWidget(currentSheetId, {
        id,
        type,
        title: isHabit ? "Coding Habit" : label,
        x: quantize(100 + Math.random() * 100, gridSize),
        y: quantize(100 + Math.random() * 100, gridSize),
        width: 280,
        height: isHabit ? 340 : 240,
        zIndex: Date.now(),
        collapsed: false,
        data: {},
      })
      setOpen(false)
    },
    [addWidget, currentSheetId, gridSize]
  )

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div
      className="relative"
      onPointerDown={stopPropagation}
    >
      <IconButton
        label="Add widget"
        size="md"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="h-4 w-4" />
      </IconButton>

      {open && (
        <div
          ref={menuRef}
          className="absolute bottom-full right-0 mb-2 rounded-lg border bg-popover text-popover-foreground shadow-md p-1 min-w-40"
          onPointerDown={stopPropagation}
        >
          {WIDGET_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.type}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddWidget(option.type)
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})