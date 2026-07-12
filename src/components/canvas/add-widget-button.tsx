"use client"

import { memo, useCallback, useState, useRef, useEffect } from "react"
import { useStore } from "@/store"
import { IconButton } from "@/components/ui/icon-button"
import { quantize } from "@/lib/geometry"
import { Plus } from "lucide-react"
import type { WidgetType } from "@/types"
import { WIDGET_DEFS } from "@/components/widgets/widget-registry"

function stopPropagation(e: React.PointerEvent) {
  e.stopPropagation()
}

export const AddWidgetButton = memo(function AddWidgetButton() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const addWidget = useStore((s) => s.addWidget)
  const createList = useStore((s) => s.createList)
  const recordSnapshot = useStore((s) => s.recordSnapshot)
  const currentSheetId = useStore((s) => s.currentSheetId)
  const gridSize = useStore((s) => s.canvasState.gridSize)

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      if (!currentSheetId) return
      const def = WIDGET_DEFS[type]
      if (!def) return
      const id = crypto.randomUUID()
      const isTodo = type === "todo"

      // Creating a todo widget also creates its backing list - both must
      // land as a single undo entry, matching every other single-action
      // widget-add. recordSnapshot() + two mutations collapses to one
      // history entry (same two-phase pattern drag/resize use).
      if (isTodo) recordSnapshot()
      const listId = isTodo ? createList(def.defaultTitle) : null

      addWidget(currentSheetId, {
        id,
        type,
        title: def.defaultTitle,
        x: quantize(100 + Math.random() * 100, gridSize),
        y: quantize(100 + Math.random() * 100, gridSize),
        width: quantize(def.defaultSize.width, gridSize),
        height: quantize(def.defaultSize.height, gridSize),
        zIndex: Date.now(),
        collapsed: false,
        data: listId ? { view: { source: { listId } } } : def.defaultData,
      })
      setOpen(false)
    },
    [addWidget, createList, recordSnapshot, currentSheetId, gridSize]
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
          className="absolute bottom-full right-0 mb-2 rounded-lg border bg-popover text-popover-foreground shadow-md p-1 min-w-40 menu-enter origin-bottom-right"
          onPointerDown={stopPropagation}
        >
          {Object.values(WIDGET_DEFS).map((def) => {
            const Icon = def.icon
            return (
              <button
                key={def.type}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddWidget(def.type)
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {def.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})