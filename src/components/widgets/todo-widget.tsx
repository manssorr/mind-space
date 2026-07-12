"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { getWidgetData } from "@/lib/widget-utils"
import { InlineInput } from "@/components/ui/icon-button"
import { Plus, Trash2, Check, Clock3 } from "lucide-react"
import type { ListItem } from "@/types"

interface TodoViewData {
  view: { source: { listId: string } }
}

const EMPTY_ITEMS: ListItem[] = []

export const TodoWidget = memo(function TodoWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const listItems = useStore((s) => s.listItems)
  const addListItem = useStore((s) => s.addListItem)
  const cycleListItemStatus = useStore((s) => s.cycleListItemStatus)
  const deleteListItem = useStore((s) => s.deleteListItem)
  const updateListItem = useStore((s) => s.updateListItem)
  const [newTodoText, setNewTodoText] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editTodoText, setEditTodoText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const data = useMemo(() => getWidgetData<TodoViewData>(widget), [widget])
  const listId = data.view?.source?.listId

  const items = useMemo(() => {
    if (!listId) return EMPTY_ITEMS
    return Object.values(listItems)
      .filter((item) => item.listId === listId)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  }, [listItems, listId])

  const handleAddTodo = useCallback(() => {
    const trimmed = newTodoText.trim()
    if (!trimmed || !listId) return
    addListItem(listId, trimmed)
    setNewTodoText("")
    setAdding(false)
  }, [newTodoText, listId, addListItem])

  const toggleTodo = useCallback(
    (itemId: string) => {
      cycleListItemStatus(itemId)
    },
    [cycleListItemStatus]
  )

  const deleteTodo = useCallback(
    (itemId: string) => {
      deleteListItem(itemId)
    },
    [deleteListItem]
  )

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

  const startAdding = useCallback(() => {
    setAdding(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    if (editingTodoId && !items.some((item) => item.id === editingTodoId)) {
      cancelEditingTodo()
    }
  }, [cancelEditingTodo, editingTodoId, items])

  const completedCount = useMemo(
    () => items.filter((item) => item.status === "done").length,
    [items]
  )

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-end gap-2">
        {items.length > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {completedCount}/{items.length}
          </span>
        )}
        <button
          onClick={startAdding}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Add todo"
          aria-label="Add todo"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {items.map((item) => {
          const status = item.status

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 group/item transition-colors",
                status === "done"
                  ? "bg-primary/5"
                  : status === "progress"
                    ? "bg-amber-500/5"
                    : "hover:bg-accent/50"
              )}
            >
              <button
                onClick={() => toggleTodo(item.id)}
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                  status === "done"
                    ? "bg-primary border-primary text-primary-foreground"
                    : status === "progress"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600"
                      : "border-muted-foreground/30 hover:border-primary"
                )}
                title={
                  status === "todo"
                    ? "Mark in progress"
                    : status === "progress"
                      ? "Mark complete"
                      : "Mark incomplete"
                }
                aria-label={
                  status === "todo"
                    ? "Mark in progress"
                    : status === "progress"
                      ? "Mark complete"
                      : "Mark incomplete"
                }
              >
                {status === "done" ? (
                  <Check className="h-3 w-3" />
                ) : status === "progress" ? (
                  <Clock3 className="h-3 w-3" />
                ) : null}
              </button>

              {editingTodoId === item.id ? (
                <InlineInput
                  inputRef={editInputRef}
                  value={editTodoText}
                  onChange={setEditTodoText}
                  onEnter={saveEditingTodo}
                  onEscape={cancelEditingTodo}
                  onBlur={saveEditingTodo}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                  className="h-6 flex-1 min-w-0 border-input/60 text-xs"
                />
              ) : (
                <button
                  onClick={() => startEditingTodo(item)}
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
                onClick={() => deleteTodo(item.id)}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-[opacity,background-color,color]"
                title="Delete todo"
                aria-label="Delete todo"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}

        {items.length === 0 && !adding && (
          <p className="text-[10px] text-muted-foreground text-center py-4">
            No todos yet. Click + to add one.
          </p>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mt-2 border-t pt-2">
          <InlineInput
            inputRef={inputRef}
            value={newTodoText}
            onChange={setNewTodoText}
            placeholder="What needs to be done?"
            onEnter={handleAddTodo}
            onEscape={() => {
              setAdding(false)
              setNewTodoText("")
            }}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
          />
          <button
            onClick={handleAddTodo}
            className="h-6 shrink-0 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
})
