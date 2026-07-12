"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { getWidgetData } from "@/lib/widget-utils"
import { neighborsForDrop, type DropTarget } from "@/lib/list-reorder"
import { InlineInput } from "@/components/ui/icon-button"
import { GripVertical, Trash2, Check, Clock3, ChevronRight } from "lucide-react"
import type { ListItem } from "@/types"

interface TodoViewData {
  view: { source: { listId: string } }
}

const EMPTY_ITEMS: ListItem[] = []
const COMPLETION_DELAY_MS = 1000
const DRAG_THRESHOLD_SQ = 25
const AUTOSCROLL_EDGE_PX = 32
const AUTOSCROLL_SPEED = 8

interface TodoRowProps {
  item: ListItem
  isDragging: boolean
  isDropTarget: boolean
  dropPosition: "before" | "after" | null
  isEditing: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onStartEdit: (item: ListItem) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onHandlePointerDown: (e: React.PointerEvent, id: string) => void
  editInputRef: React.RefObject<HTMLInputElement | null>
}

const TodoRow = memo(function TodoRow({
  item,
  isDragging,
  isDropTarget,
  dropPosition,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleStatus,
  onDelete,
  onHandlePointerDown,
  editInputRef,
}: TodoRowProps) {
  const status = item.status

  return (
    <div
      data-item-id={item.id}
      className={cn(
        "group/item relative flex items-start gap-1 rounded-md pl-1 pr-2 py-1.5 transition-colors",
        isDragging && "opacity-40",
        status === "done"
          ? "bg-primary/5"
          : status === "progress"
            ? "bg-amber-500/5"
            : "hover:bg-accent/50"
      )}
    >
      {isDropTarget && dropPosition === "before" && (
        <div className="pointer-events-none absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-primary" />
      )}
      {isDropTarget && dropPosition === "after" && (
        <div className="pointer-events-none absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-primary" />
      )}

      <button
        onPointerDown={(e) => onHandlePointerDown(e, item.id)}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/0 transition-opacity active:cursor-grabbing",
          status !== "done" && "group-hover/item:text-muted-foreground/60"
        )}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        disabled={status === "done"}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={() => onToggleStatus(item.id)}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
          status === "done"
            ? "bg-primary border-primary text-primary-foreground"
            : status === "progress"
              ? "border-amber-500 bg-amber-500/10 text-amber-600"
              : "border-muted-foreground/30 hover:border-primary"
        )}
        title={
          status === "todo" ? "Mark in progress" : status === "progress" ? "Mark complete" : "Mark incomplete"
        }
        aria-label={
          status === "todo" ? "Mark in progress" : status === "progress" ? "Mark complete" : "Mark incomplete"
        }
      >
        {status === "done" ? (
          <Check className="h-3 w-3" />
        ) : status === "progress" ? (
          <Clock3 className="h-3 w-3" />
        ) : null}
      </button>

      {isEditing ? (
        <InlineInput
          inputRef={editInputRef}
          value={editValue}
          onChange={onEditValueChange}
          onEnter={onSaveEdit}
          onEscape={onCancelEdit}
          onBlur={onSaveEdit}
          onPointerDown={(e) => e.stopPropagation()}
          autoFocus
          className="h-6 flex-1 min-w-0 border-input/60 text-xs"
        />
      ) : (
        <button
          onClick={() => onStartEdit(item)}
          className={cn(
            "flex-1 min-w-0 rounded px-1 -mx-1 text-left text-xs leading-relaxed whitespace-normal break-words transition-colors hover:bg-background/70",
            status === "done" && "line-through text-muted-foreground",
            status === "progress" && "text-amber-600 dark:text-amber-400"
          )}
          title="Click to edit"
        >
          {item.text}
        </button>
      )}

      <button
        onClick={() => onDelete(item.id)}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
        title="Delete todo"
        aria-label="Delete todo"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
})

export const TodoWidget = memo(function TodoWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const listItems = useStore((s) => s.listItems)
  const addListItem = useStore((s) => s.addListItem)
  const cycleListItemStatus = useStore((s) => s.cycleListItemStatus)
  const deleteListItem = useStore((s) => s.deleteListItem)
  const updateListItem = useStore((s) => s.updateListItem)
  const moveListItem = useStore((s) => s.moveListItem)

  const [newTodoText, setNewTodoText] = useState("")
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editTodoText, setEditTodoText] = useState("")
  const [completedOpen, setCompletedOpen] = useState(false)
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const completionTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const dragState = useRef({
    id: null as string | null,
    didDrag: false,
    startX: 0,
    startY: 0,
    dropTarget: null as DropTarget | null,
  })
  const autoscrollFrame = useRef<number | null>(null)
  const pendingScrollDir = useRef(0)

  const data = useMemo(() => getWidgetData<TodoViewData>(widget), [widget])
  const listId = data.view?.source?.listId

  const items = useMemo(() => {
    if (!listId) return EMPTY_ITEMS
    return Object.values(listItems)
      .filter((item) => item.listId === listId)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  }, [listItems, listId])

  const activeItems = useMemo(
    () => items.filter((item) => item.status !== "done" || recentlyCompleted.has(item.id)),
    [items, recentlyCompleted]
  )
  const completedItems = useMemo(
    () => items.filter((item) => item.status === "done" && !recentlyCompleted.has(item.id)),
    [items, recentlyCompleted]
  )
  const activeOrderedIds = useMemo(() => activeItems.map((item) => item.id), [activeItems])
  const openCount = useMemo(() => items.filter((item) => item.status !== "done").length, [items])

  // Schedule the "slide to completed" transition when an item is done and its
  // completedAt is within the delay window, and cancel it if the item leaves
  // done before the timer fires. completedAt (persisted on the item) is the
  // single source of truth for "already animated", so a timer cleared by
  // dev-mode StrictMode's mount/cleanup/remount simply reschedules with the
  // correct remaining delay instead of getting stuck.
  useEffect(() => {
    const activeIds = new Set<string>()

    for (const item of items) {
      if (item.status !== "done" || !item.completedAt) continue
      const remaining = COMPLETION_DELAY_MS - (Date.now() - item.completedAt)
      if (remaining <= 0) continue

      activeIds.add(item.id)
      setRecentlyCompleted((prev) => (prev.has(item.id) ? prev : new Set(prev).add(item.id)))

      if (completionTimers.current.has(item.id)) continue
      const timer = setTimeout(() => {
        completionTimers.current.delete(item.id)
        setRecentlyCompleted((prev) => {
          if (!prev.has(item.id)) return prev
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }, remaining)
      completionTimers.current.set(item.id, timer)
    }

    // Cancel and clear recentlyCompleted for ids that are no longer done or
    // no longer within the delay window (un-cycled, or delay elapsed).
    for (const [id, timer] of completionTimers.current) {
      if (!activeIds.has(id)) {
        clearTimeout(timer)
        completionTimers.current.delete(id)
      }
    }
    setRecentlyCompleted((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if (!activeIds.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items])

  // Clear pending timers on real unmount.
  useEffect(() => {
    const timers = completionTimers.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (editingTodoId && !items.some((item) => item.id === editingTodoId)) {
      setEditingTodoId(null)
      setEditTodoText("")
    }
  }, [editingTodoId, items])

  const commitTodo = useCallback(() => {
    const trimmed = newTodoText.trim()
    if (!trimmed || !listId) {
      setNewTodoText("")
      return
    }
    addListItem(listId, trimmed)
    setNewTodoText("")
    requestAnimationFrame(() => addInputRef.current?.focus())
  }, [newTodoText, listId, addListItem])

  const toggleTodo = useCallback((itemId: string) => cycleListItemStatus(itemId), [cycleListItemStatus])
  const deleteTodo = useCallback((itemId: string) => deleteListItem(itemId), [deleteListItem])

  const startEditingTodo = useCallback((item: ListItem) => {
    setEditingTodoId(item.id)
    setEditTodoText(item.text)
    requestAnimationFrame(() => editInputRef.current?.select())
  }, [])

  const cancelEditingTodo = useCallback(() => {
    setEditingTodoId(null)
    setEditTodoText("")
  }, [])

  const saveEditingTodo = useCallback(() => {
    if (!editingTodoId) return
    const trimmed = editTodoText.trim()
    if (!trimmed) {
      cancelEditingTodo()
      return
    }
    updateListItem(editingTodoId, { text: trimmed })
    cancelEditingTodo()
  }, [cancelEditingTodo, editTodoText, editingTodoId, updateListItem])

  const updateScrollFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const scrollable = el.scrollHeight > el.clientHeight + 1
    setFadeTop(scrollable && el.scrollTop > 1)
    setFadeBottom(scrollable && el.scrollTop < el.scrollHeight - el.clientHeight - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollFades()
    el.addEventListener("scroll", updateScrollFades, { passive: true })
    const observer = new ResizeObserver(updateScrollFades)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollFades)
      observer.disconnect()
    }
  }, [updateScrollFades, activeItems.length, completedItems.length, completedOpen])

  const stopAutoscroll = useCallback(() => {
    if (autoscrollFrame.current !== null) {
      cancelAnimationFrame(autoscrollFrame.current)
      autoscrollFrame.current = null
    }
    pendingScrollDir.current = 0
  }, [])

  const runAutoscroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || pendingScrollDir.current === 0) {
      autoscrollFrame.current = null
      return
    }
    el.scrollTop += pendingScrollDir.current * AUTOSCROLL_SPEED
    autoscrollFrame.current = requestAnimationFrame(runAutoscroll)
  }, [])

  const handleDragHandlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    dragState.current = { id, didDrag: false, startX: e.clientX, startY: e.clientY, dropTarget: null }
    try {
      scrollRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // pointer session already ended (e.g. a very fast synthetic or
      // trackpad tap-release); the move/up handlers still work without
      // capture, just without guaranteed delivery outside the element.
    }
  }, [])

  const handleScrollPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const { id } = dragState.current
      if (!id) return

      if (!dragState.current.didDrag) {
        const dx = e.clientX - dragState.current.startX
        const dy = e.clientY - dragState.current.startY
        if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) {
          dragState.current.didDrag = true
          setDraggingId(id)
        } else {
          return
        }
      }

      const el = scrollRef.current
      if (!el) return

      const rows = el.querySelectorAll<HTMLElement>("[data-item-id]")
      let best: DropTarget | null = null
      let bestDist = Infinity
      rows.forEach((row) => {
        const rowId = row.getAttribute("data-item-id")
        if (!rowId || rowId === id) return
        const rect = row.getBoundingClientRect()
        if (e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4) {
          const mid = rect.top + rect.height / 2
          const dist = Math.abs(e.clientY - mid)
          if (dist < bestDist) {
            bestDist = dist
            best = { id: rowId, position: e.clientY < mid ? "before" : "after" }
          }
        }
      })
      dragState.current.dropTarget = best
      setDropTarget(best)

      const containerRect = el.getBoundingClientRect()
      if (e.clientY < containerRect.top + AUTOSCROLL_EDGE_PX) {
        pendingScrollDir.current = -1
      } else if (e.clientY > containerRect.bottom - AUTOSCROLL_EDGE_PX) {
        pendingScrollDir.current = 1
      } else {
        pendingScrollDir.current = 0
      }
      if (pendingScrollDir.current !== 0 && autoscrollFrame.current === null) {
        autoscrollFrame.current = requestAnimationFrame(runAutoscroll)
      }
    },
    [runAutoscroll]
  )

  const handleScrollPointerUp = useCallback(() => {
    const { id, dropTarget: dt, didDrag } = dragState.current
    dragState.current = { id: null, didDrag: false, startX: 0, startY: 0, dropTarget: null }
    stopAutoscroll()
    setDraggingId(null)
    setDropTarget(null)

    if (id && didDrag && dt) {
      const neighbors = neighborsForDrop(activeOrderedIds, id, dt)
      if (neighbors) {
        moveListItem(id, neighbors.beforeId, neighbors.afterId)
      }
    }
  }, [activeOrderedIds, moveListItem, stopAutoscroll])

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <div className="flex shrink-0 items-center justify-end">
        {openCount > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{openCount} open</span>
        )}
      </div>

      <div
        ref={scrollRef}
        data-fade-top={fadeTop}
        data-fade-bottom={fadeBottom}
        className="scroll-fade scrollbar-thin flex-1 min-h-0 overflow-y-auto space-y-0.5"
        onPointerMove={handleScrollPointerMove}
        onPointerUp={handleScrollPointerUp}
        onPointerCancel={handleScrollPointerUp}
      >
        {activeItems.map((item) => (
          <TodoRow
            key={item.id}
            item={item}
            isDragging={draggingId === item.id}
            isDropTarget={dropTarget?.id === item.id}
            dropPosition={dropTarget?.id === item.id ? dropTarget.position : null}
            isEditing={editingTodoId === item.id}
            editValue={editTodoText}
            onEditValueChange={setEditTodoText}
            onStartEdit={startEditingTodo}
            onSaveEdit={saveEditingTodo}
            onCancelEdit={cancelEditingTodo}
            onToggleStatus={toggleTodo}
            onDelete={deleteTodo}
            onHandlePointerDown={handleDragHandlePointerDown}
            editInputRef={editInputRef}
          />
        ))}

        {items.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">Nothing yet</p>
        )}

        {completedItems.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setCompletedOpen((v) => !v)}
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-[10px] text-muted-foreground hover:bg-accent/50 transition-colors"
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", completedOpen && "rotate-90")}
              />
              Completed ({completedItems.length})
            </button>
            {completedOpen && (
              <div className="space-y-0.5 mt-0.5">
                {completedItems.map((item) => (
                  <TodoRow
                    key={item.id}
                    item={item}
                    isDragging={false}
                    isDropTarget={false}
                    dropPosition={null}
                    isEditing={editingTodoId === item.id}
                    editValue={editTodoText}
                    onEditValueChange={setEditTodoText}
                    onStartEdit={startEditingTodo}
                    onSaveEdit={saveEditingTodo}
                    onCancelEdit={cancelEditingTodo}
                    onToggleStatus={toggleTodo}
                    onDelete={deleteTodo}
                    onHandlePointerDown={handleDragHandlePointerDown}
                    editInputRef={editInputRef}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <InlineInput
        inputRef={addInputRef}
        value={newTodoText}
        onChange={setNewTodoText}
        placeholder="+ Add task"
        onEnter={commitTodo}
        onEscape={() => setNewTodoText("")}
        onBlur={() => {
          if (newTodoText.trim()) commitTodo()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-7 w-full shrink-0 border-none bg-transparent px-1 text-xs text-muted-foreground focus:text-foreground placeholder:text-muted-foreground/70"
      />
    </div>
  )
})
