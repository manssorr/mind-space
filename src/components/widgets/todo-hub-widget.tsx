"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { quantize } from "@/lib/geometry"
import { buildListPlacementMap, formatPlacementBadge } from "@/lib/list-placement"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { InlineInput } from "@/components/ui/icon-button"
import { TodoRow } from "@/components/widgets/todo-widget"
import { WidgetType, type List, type ListItem } from "@/types"
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react"

const EMPTY_ITEMS: ListItem[] = []

interface ListGroupProps {
  list: List
  items: ListItem[]
  badge: string
  collapsed: boolean
  onToggleCollapsed: (listId: string) => void
  editingTodoId: string | null
  editTodoText: string
  onEditValueChange: (value: string) => void
  onStartEdit: (item: ListItem) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  editInputRef: React.RefObject<HTMLInputElement | null>
}

const ListGroup = memo(function ListGroup({
  list,
  items,
  badge,
  collapsed,
  onToggleCollapsed,
  editingTodoId,
  editTodoText,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleStatus,
  onDelete,
  editInputRef,
}: ListGroupProps) {
  const addListItem = useStore((s) => s.addListItem)
  const renameList = useStore((s) => s.renameList)
  const deleteList = useStore((s) => s.deleteList)
  const addWidget = useStore((s) => s.addWidget)
  const recordSnapshot = useStore((s) => s.recordSnapshot)
  const currentSheetId = useStore((s) => s.currentSheetId)
  const gridSize = useStore((s) => s.canvasState.gridSize)
  const confirm = useConfirm()

  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(list.name)
  const [newItemText, setNewItemText] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const openCount = useMemo(() => items.filter((item) => item.status !== "done").length, [items])

  const startRename = useCallback(() => {
    setNameDraft(list.name)
    setRenaming(true)
    requestAnimationFrame(() => nameInputRef.current?.select())
  }, [list.name])

  const saveRename = useCallback(() => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== list.name) renameList(list.id, trimmed)
    setRenaming(false)
  }, [nameDraft, list.id, list.name, renameList])

  const cancelRename = useCallback(() => setRenaming(false), [])

  const commitNewItem = useCallback(() => {
    const trimmed = newItemText.trim()
    if (!trimmed) {
      setNewItemText("")
      return
    }
    addListItem(list.id, trimmed)
    setNewItemText("")
    requestAnimationFrame(() => addInputRef.current?.focus())
  }, [newItemText, list.id, addListItem])

  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: "Delete list?",
      description: `Delete "${list.name}" and its ${items.length} item${items.length === 1 ? "" : "s"}? This can be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (ok) deleteList(list.id)
  }, [confirm, deleteList, list.id, list.name, items.length])

  const placeOnCanvas = useCallback(() => {
    if (!currentSheetId) return
    const id = crypto.randomUUID()
    recordSnapshot()
    addWidget(currentSheetId, {
      id,
      type: WidgetType.Todo,
      title: list.name,
      x: quantize(100 + Math.random() * 100, gridSize),
      y: quantize(100 + Math.random() * 100, gridSize),
      width: quantize(280, gridSize),
      height: quantize(240, gridSize),
      zIndex: Date.now(),
      collapsed: false,
      data: { view: { source: { listId: list.id } } },
    })
  }, [currentSheetId, recordSnapshot, addWidget, list.id, list.name, gridSize])

  return (
    <div className="rounded-md border border-border/60">
      <div className="group/header flex items-center gap-1.5 px-2 py-1.5">
        <button
          onClick={() => onToggleCollapsed(list.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 transition-colors"
          aria-label={collapsed ? "Expand list" : "Collapse list"}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
        </button>

        {renaming ? (
          <InlineInput
            inputRef={nameInputRef}
            value={nameDraft}
            onChange={setNameDraft}
            onEnter={saveRename}
            onEscape={cancelRename}
            onBlur={saveRename}
            autoFocus
            className="h-6 flex-1 min-w-0 text-xs font-medium"
          />
        ) : (
          <button
            onClick={startRename}
            className="flex-1 min-w-0 truncate text-left text-xs font-medium hover:underline"
            title="Click to rename"
          >
            {list.name}
          </button>
        )}

        {openCount > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{openCount} open</span>
        )}
        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {badge}
        </span>

        <button
          onClick={placeOnCanvas}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-accent hover:text-accent-foreground transition-opacity"
          title="Place on canvas"
          aria-label="Place on canvas"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={startRename}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-accent hover:text-accent-foreground transition-opacity"
          title="Rename list"
          aria-label="Rename list"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={handleDelete}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
          title="Delete list"
          aria-label="Delete list"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-0.5 border-t border-border/60 px-1.5 py-1.5">
          {items.map((item) => (
            <TodoRow
              key={item.id}
              item={item}
              isDragging={false}
              isDropTarget={false}
              dropPosition={null}
              isEditing={editingTodoId === item.id}
              editValue={editTodoText}
              onEditValueChange={onEditValueChange}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onHandlePointerDown={() => {}}
              editInputRef={editInputRef}
            />
          ))}

          {items.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">Nothing yet</p>
          )}

          <InlineInput
            inputRef={addInputRef}
            value={newItemText}
            onChange={setNewItemText}
            placeholder="+ Add task"
            onEnter={commitNewItem}
            onEscape={() => setNewItemText("")}
            onBlur={() => {
              if (newItemText.trim()) commitNewItem()
            }}
            className="h-6 w-full shrink-0 border-none bg-transparent px-1 text-xs text-muted-foreground focus:text-foreground placeholder:text-muted-foreground/70"
          />
        </div>
      )}
    </div>
  )
})

export const TodoHubWidget = memo(function TodoHubWidget(props: { widgetId: string }) {
  void props
  const lists = useStore((s) => s.lists)
  const listItems = useStore((s) => s.listItems)
  const sheets = useStore((s) => s.sheets)
  const widgets = useStore((s) => s.widgets)
  const createList = useStore((s) => s.createList)
  const updateListItem = useStore((s) => s.updateListItem)
  const cycleListItemStatus = useStore((s) => s.cycleListItemStatus)
  const deleteListItem = useStore((s) => s.deleteListItem)

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editTodoText, setEditTodoText] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const sortedLists = useMemo(
    () => Object.values(lists).sort((a, b) => a.createdAt - b.createdAt),
    [lists]
  )

  const itemsByList = useMemo(() => {
    const map = new Map<string, ListItem[]>()
    for (const item of Object.values(listItems)) {
      const arr = map.get(item.listId)
      if (arr) arr.push(item)
      else map.set(item.listId, [item])
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    }
    return map
  }, [listItems])

  const placementMap = useMemo(() => buildListPlacementMap(sheets, widgets), [sheets, widgets])

  const toggleCollapsed = useCallback((listId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }, [])

  const startEdit = useCallback((item: ListItem) => {
    setEditingTodoId(item.id)
    setEditTodoText(item.text)
    requestAnimationFrame(() => editInputRef.current?.select())
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingTodoId(null)
    setEditTodoText("")
  }, [])

  const saveEdit = useCallback(() => {
    if (!editingTodoId) return
    const trimmed = editTodoText.trim()
    if (!trimmed) {
      cancelEdit()
      return
    }
    updateListItem(editingTodoId, { text: trimmed })
    cancelEdit()
  }, [cancelEdit, editTodoText, editingTodoId, updateListItem])

  const toggleStatus = useCallback((id: string) => cycleListItemStatus(id), [cycleListItemStatus])
  const deleteItem = useCallback((id: string) => deleteListItem(id), [deleteListItem])

  const handleNewList = useCallback(() => {
    createList("New list")
  }, [createList])

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-2">
        {sortedLists.map((list) => (
          <ListGroup
            key={list.id}
            list={list}
            items={itemsByList.get(list.id) ?? EMPTY_ITEMS}
            badge={formatPlacementBadge(placementMap.get(list.id))}
            collapsed={collapsedIds.has(list.id)}
            onToggleCollapsed={toggleCollapsed}
            editingTodoId={editingTodoId}
            editTodoText={editTodoText}
            onEditValueChange={setEditTodoText}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onToggleStatus={toggleStatus}
            onDelete={deleteItem}
            editInputRef={editInputRef}
          />
        ))}

        {sortedLists.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">No lists yet</p>
        )}
      </div>

      <button
        onClick={handleNewList}
        className="flex shrink-0 items-center justify-center gap-1 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        New list
      </button>
    </div>
  )
})
