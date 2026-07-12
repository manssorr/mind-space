import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { WidgetType, type Sheet, type Widget, type CanvasState, type ThemeSettings, type CanvasBackground, type ResizeHandleStyle, type List, type ListItem, type ListItemStatus } from "@/types"
import { diffForHistory, applyHistoryEntry, isValidHistoryEntry, type HistoryEntry, type HistoryTrio } from "@/lib/history-diff"
import { quantize } from "@/lib/geometry"
import { orderKeyBetween } from "@/lib/order-key"

const MIN_WIDTH = 120
const MIN_HEIGHT = 80

interface ClipboardTodoData extends Record<string, unknown> {
  view: { source: { listId: string } }
  items: Pick<ListItem, "text" | "status" | "order" | "tags">[]
}

interface ClipboardData {
  widgets: (Pick<Widget, "type" | "title" | "width" | "height" | "data" | "collapsed" | "colorTheme"> & { x: number; y: number })[]
  minX: number
  minY: number
}

function getNextListItemStatus(status: ListItemStatus): ListItemStatus {
  if (status === "todo") return "progress"
  if (status === "progress") return "done"
  return "todo"
}

interface TodoViewData {
  view: { source: { listId: string } }
}

function isTodoViewData(data: unknown): data is TodoViewData {
  if (typeof data !== "object" || data === null) return false
  const view = (data as { view?: unknown }).view
  if (typeof view !== "object" || view === null) return false
  const source = (view as { source?: unknown }).source
  if (typeof source !== "object" || source === null) return false
  return typeof (source as { listId?: unknown }).listId === "string"
}

/**
 * A duplicated/pasted todo widget must fork its list (new list + copied
 * items), not share the original - a duplicate is a fork, not a second
 * view onto the same data (design 033). Mutates `newLists`/`newListItems`
 * in place with the forked entities and returns the widget's replacement
 * `data`, or the original `data` unchanged for non-todo widgets.
 */
function forkTodoListForDuplicate(
  widget: Widget,
  lists: Record<string, List>,
  listItems: Record<string, ListItem>,
  newLists: Record<string, List>,
  newListItems: Record<string, ListItem>
): Record<string, unknown> {
  if (widget.type !== WidgetType.Todo || !isTodoViewData(widget.data)) {
    return widget.data
  }
  const sourceListId = widget.data.view.source.listId
  if (!lists[sourceListId]) return widget.data
  const forkedListId = crypto.randomUUID()
  newLists[forkedListId] = {
    id: forkedListId,
    name: widget.title,
    createdAt: Date.now(),
  }
  const sourceItems = Object.values(listItems)
    .filter((item) => item.listId === sourceListId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  for (const item of sourceItems) {
    const forkedId = crypto.randomUUID()
    newListItems[forkedId] = { ...item, id: forkedId, listId: forkedListId }
  }
  return { view: { source: { listId: forkedListId } } }
}

interface LegacyTodoItem {
  id: string
  text: string
  done?: boolean
  status?: ListItemStatus
}

function isLegacyTodoData(data: unknown): data is { items: LegacyTodoItem[] } {
  if (typeof data !== "object" || data === null) return false
  return Array.isArray((data as { items?: unknown }).items)
}

function legacyItemStatus(item: LegacyTodoItem): ListItemStatus {
  if (item.status === "progress") return "progress"
  if (item.done || item.status === "done") return "done"
  return "todo"
}

/**
 * Snapshots a todo widget's current items (by listId) into the clipboard
 * payload, so a paste can create a fresh, independent list (fork semantics -
 * a paste is not a second view onto the source list).
 */
function snapshotTodoClipboardData(data: TodoViewData, listItems: Record<string, ListItem>): ClipboardTodoData {
  const items = Object.values(listItems)
    .filter((item) => item.listId === data.view.source.listId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    .map((item) => ({ text: item.text, status: item.status, order: item.order, tags: item.tags }))
  return { view: data.view, items }
}

/**
 * Builds the pasted widget's `data` for a todo widget, creating a fresh
 * list + items from the clipboard snapshot. Handles both current-shape
 * (`{ view, items }`) and legacy (`{ items: [...] }`, pre-normalization)
 * clipboard payloads. Non-todo widgets pass through unchanged.
 */
function hoistTodoClipboardData(
  type: WidgetType,
  title: string,
  data: unknown,
  newLists: Record<string, List>,
  newListItems: Record<string, ListItem>
): Record<string, unknown> {
  if (type !== WidgetType.Todo) return data as Record<string, unknown>

  const listId = crypto.randomUUID()
  newLists[listId] = { id: listId, name: title, createdAt: Date.now() }

  let sourceItems: { text: string; status: ListItemStatus; order?: string; tags?: string[] }[] = []
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as ClipboardTodoData).items)) {
    const clipboardData = data as ClipboardTodoData
    sourceItems = clipboardData.items
  } else if (isLegacyTodoData(data)) {
    sourceItems = data.items.map((item) => ({ text: item.text, status: legacyItemStatus(item) }))
  }

  let lastOrder: string | null = null
  for (const item of sourceItems) {
    const itemId = crypto.randomUUID()
    const order: string = item.order ?? orderKeyBetween(lastOrder, null)
    lastOrder = order
    newListItems[itemId] = {
      id: itemId,
      listId,
      text: item.text,
      status: item.status,
      order,
      tags: item.tags ?? [],
      createdAt: Date.now(),
      completedAt: item.status === "done" ? Date.now() : undefined,
    }
  }

  return { view: { source: { listId } } }
}

interface StoreState {
  sheets: Sheet[]
  currentSheetId: string | null
  widgets: Record<string, Widget>
  lists: Record<string, List>
  listItems: Record<string, ListItem>
  selectedWidgetIds: string[]
  canvasState: CanvasState
  canvasBackground: CanvasBackground
  resizeHandleStyle: ResizeHandleStyle
  themeSettings: ThemeSettings
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  clipboard: ClipboardData | null

  addSheet: (title: string, description?: string) => void
  deleteSheet: (id: string) => void
  setCurrentSheet: (id: string) => void
  updateSheet: (id: string, updates: Partial<Sheet>) => void
  duplicateSheet: (id: string) => void
  reorderSheets: (activeSheetId: string, targetSheetId: string, position: "before" | "after") => void
  reorderSheetWidgets: (sheetId: string, widgetOrder: string[]) => void

  addWidget: (sheetId: string, widget: Widget) => void
  updateWidget: (id: string, updates: Partial<Widget>) => void
  updateWidgets: (ids: string[], updates: Partial<Widget>) => void
  updateWidgetSilent: (id: string, updates: Partial<Widget>) => void
  recordSnapshot: () => void
  deleteWidget: (sheetId: string, widgetId: string) => void
  deleteWidgets: (sheetId: string, widgetIds: string[]) => void
  moveWidget: (id: string, x: number, y: number) => void
  moveWidgets: (moves: { id: string; x: number; y: number }[]) => void
  resizeWidget: (id: string, width: number, height: number) => void
  duplicateWidget: (sheetId: string, widgetId: string) => void
  duplicateWidgets: (sheetId: string, widgetIds: string[]) => void
  duplicateWidgetsAt: (sheetId: string, widgetIds: string[]) => string[]
  toggleCollapse: (id: string) => void
  renameWidget: (id: string, title: string) => void

  selectWidget: (id: string) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  deselectAll: () => void
  setSelection: (ids: string[]) => void

  setCanvasState: (state: Partial<CanvasState>) => void
  resetCanvasView: () => void

  setCanvasBackground: (background: Partial<CanvasBackground>) => void
  setSheetBackground: (sheetId: string, background: Partial<CanvasBackground> | null) => void
  setResizeHandleStyle: (style: ResizeHandleStyle) => void

  setThemeSettings: (settings: Partial<ThemeSettings>) => void

  copyWidgets: (sheetId: string, widgetIds: string[]) => void
  pasteWidgets: (sheetId: string) => void

  createList: (name: string) => string
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => void
  addListItem: (listId: string, text: string) => string
  updateListItem: (id: string, updates: Partial<Pick<ListItem, "text" | "tags">>) => void
  cycleListItemStatus: (id: string) => void
  deleteListItem: (id: string) => void
  moveListItem: (id: string, beforeId: string | null, afterId: string | null) => void

  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 50

function trioOf(state: {
  sheets: Sheet[]
  widgets: Record<string, Widget>
  currentSheetId: string | null
  lists: Record<string, List>
  listItems: Record<string, ListItem>
}): HistoryTrio {
  return {
    sheets: state.sheets,
    widgets: state.widgets,
    currentSheetId: state.currentSheetId,
    lists: state.lists,
    listItems: state.listItems,
  }
}

// Pending pre-interaction trio captured by recordSnapshot(). Materialized
// into a HistoryEntry (and pushed to undoStack) by the first subsequent
// mutation. Module-level: recordSnapshot's public signature must stay
// `() => void` (drag/resize hooks call it as-is), so the two-phase state
// lives outside the store slice rather than as an extra arg.
let pendingSnapshot: HistoryTrio | null = null

// Test-only escape hatch: pendingSnapshot lives outside the store slice, so
// resetting store state between tests (useStore.setState(...)) does not
// clear it. Call this from beforeEach if a test suite exercises
// recordSnapshot() to avoid leaking a pending snapshot into the next test.
export function __resetPendingSnapshotForTests() {
  pendingSnapshot = null
}

export function migratePersistedState(persisted: unknown, version: number): unknown {
  const state = persisted as Record<string, unknown>
  if (version < 1) {
    // v0 blobs carried full undo/redo history; strip it.
    delete state.undoStack
    delete state.redoStack
  }
  if (version < 2) {
    // v1 widgets stored timer/stopwatch progress as tick-decremented
    // fields; convert to timestamp-based fields. Running timers/
    // stopwatches become paused at their last known value.
    const widgets = state.widgets as Record<string, Widget> | undefined
    if (widgets) {
      for (const widget of Object.values(widgets)) {
        if (widget.type === WidgetType.Timer) {
          const d = widget.data as { duration?: number; remaining?: number } | undefined
          widget.data = {
            duration: d?.duration ?? 300,
            endsAt: null,
            pausedRemaining: d?.remaining ?? null,
          }
        } else if (widget.type === WidgetType.Stopwatch) {
          const d = widget.data as { elapsed?: number; laps?: number[] } | undefined
          widget.data = {
            startedAt: null,
            accumulated: d?.elapsed ?? 0,
            laps: d?.laps ?? [],
          }
        }
      }
    }
  }
  if (version < 3) {
    // v2 (and any earlier) blobs never persisted undo/redo stacks, or
    // persisted them as full-state JSON-string snapshots (pre-v1).
    // Neither shape is a valid HistoryEntry[]; drop them and start
    // fresh rather than risk feeding undo/redo malformed entries.
    delete state.undoStack
    delete state.redoStack
  }
  if (version < 4) {
    // v3 blobs never persisted canvasState.snapToObjects; zustand's
    // shallow merge would leave it undefined. Default it to on.
    const canvasState = state.canvasState as Partial<CanvasState> | undefined
    if (canvasState && canvasState.snapToObjects === undefined) {
      canvasState.snapToObjects = true
    }
  }
  if (version < 5) {
    // v4 blobs may carry off-grid widget geometry from free-form
    // positioning; the grid is now a hard constraint, so quantize every
    // widget's x/y/width/height. Also drop the removed snapToGrid toggle.
    const widgets = state.widgets as Record<string, Widget> | undefined
    const canvasState = state.canvasState as (Partial<CanvasState> & { snapToGrid?: boolean }) | undefined
    const gridSize = canvasState?.gridSize ?? 20
    if (widgets) {
      for (const widget of Object.values(widgets)) {
        widget.x = quantize(widget.x, gridSize)
        widget.y = quantize(widget.y, gridSize)
        widget.width = Math.max(MIN_WIDTH, quantize(widget.width, gridSize))
        widget.height = Math.max(MIN_HEIGHT, quantize(widget.height, gridSize))
      }
    }
    if (canvasState) {
      delete canvasState.snapToGrid
    }
  }
  if (version < 6) {
    // v5 blobs toggled the grid overlay via canvasState.gridEnabled; that
    // field is subsumed by canvasBackground.pattern. A disabled grid maps
    // to pattern "none", otherwise the new default pattern "grid" applies.
    const canvasState = state.canvasState as (Partial<CanvasState> & { gridEnabled?: boolean }) | undefined
    const gridWasDisabled = canvasState?.gridEnabled === false
    if (canvasState) {
      delete canvasState.gridEnabled
    }
    state.canvasBackground = {
      color: "default",
      pattern: gridWasDisabled ? "none" : "grid",
    } satisfies CanvasBackground
  }
  if (version < 7) {
    // v6 blobs stored todo items inline on the widget (widget.data.items).
    // Hoist every todo widget's items into normalized lists/listItems
    // entities; the widget becomes an identity view over its new list.
    // Old undoStack/redoStack delta entries reference the pre-P1 trio
    // shape (no lists/listItems) - same precedent as the v3 history swap:
    // drop them rather than risk feeding undo/redo malformed entries.
    const widgets = state.widgets as Record<string, Widget> | undefined
    const lists: Record<string, List> = (state.lists as Record<string, List> | undefined) ?? {}
    const listItems: Record<string, ListItem> = (state.listItems as Record<string, ListItem> | undefined) ?? {}
    if (widgets) {
      for (const widget of Object.values(widgets)) {
        if (widget.type !== WidgetType.Todo) continue
        const legacyData = widget.data as { items?: LegacyTodoItem[] } | undefined
        const listId = crypto.randomUUID()
        lists[listId] = { id: listId, name: widget.title, createdAt: 0 }
        let lastOrder: string | null = null
        for (const item of legacyData?.items ?? []) {
          const itemId = crypto.randomUUID()
          const order = orderKeyBetween(lastOrder, null)
          lastOrder = order
          const status = legacyItemStatus(item)
          listItems[itemId] = {
            id: itemId,
            listId,
            text: item.text,
            status,
            order,
            tags: [],
            createdAt: 0,
            completedAt: status === "done" ? 0 : undefined,
          }
        }
        widget.data = { view: { source: { listId } } }
      }
    }
    state.lists = lists
    state.listItems = listItems
    delete state.undoStack
    delete state.redoStack
  }
  return state
}

/**
 * Diffs `prevTrio` (the pending snapshot if one is open, else the trio
 * right before this action) against `nextTrio` and returns the undo/redo
 * stack fields for the action's `set(...)` partial. Every snapshotting
 * action goes through this so a pending snapshot from recordSnapshot()
 * is never silently dropped if something other than moveWidget/
 * resizeWidget runs next.
 */
function pushHistoryEntry(
  state: { undoStack: HistoryEntry[] },
  prevTrio: HistoryTrio,
  nextTrio: HistoryTrio
): { undoStack: HistoryEntry[]; redoStack: HistoryEntry[] } {
  const basisTrio = pendingSnapshot ?? prevTrio
  pendingSnapshot = null
  const entry = diffForHistory(basisTrio, nextTrio)
  if (!entry) {
    return { undoStack: state.undoStack, redoStack: [] }
  }
  return { undoStack: [...state.undoStack, entry].slice(-MAX_HISTORY), redoStack: [] }
}

const defaultCanvasState: CanvasState = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  gridSize: 20,
  snapToObjects: true,
}

const defaultCanvasBackground: CanvasBackground = {
  color: "default",
  pattern: "grid",
}

const defaultResizeHandleStyle: ResizeHandleStyle = "corners"

const defaultThemeSettings: ThemeSettings = {
  mode: "system",
  accentColor: "zinc",
  fontSize: 16,
}

function initializeDefaultState() {
  const now = Date.now()
  const sheetId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const todoId = crypto.randomUUID()
  const quickLinkId = crypto.randomUUID()
  const listId = crypto.randomUUID()

  const seedTexts = [
    "Pan the canvas (hold Space + drag)",
    "Add widgets from the + button",
    "Create new sheets in the sidebar",
  ]
  const listItems: Record<string, ListItem> = {}
  let lastOrder: string | null = null
  for (const text of seedTexts) {
    const itemId = crypto.randomUUID()
    const order = orderKeyBetween(lastOrder, null)
    lastOrder = order
    listItems[itemId] = { id: itemId, listId, text, status: "todo", order, tags: [], createdAt: now }
  }

  useStore.setState({
    sheets: [
      {
        id: sheetId,
        title: "Sheet 1",
        widgetOrder: [noteId, todoId, quickLinkId],
        createdAt: now,
        updatedAt: now,
      },
    ],
    currentSheetId: sheetId,
    widgets: {
      [noteId]: {
        id: noteId,
        type: WidgetType.Note,
        title: "Welcome!",
        x: 160,
        y: 160,
        width: 320,
        height: 280,
        zIndex: 1,
        collapsed: false,
        data: {
          content: "Welcome to Mind Space!\n\nThis is your personal canvas for organizing thoughts, tasks, and ideas.\n\nStart by editing this note, checking off the todo items, or adding more widgets with the + button.",
        },
      },
      [todoId]: {
        id: todoId,
        type: WidgetType.Todo,
        title: "Getting Started",
        x: 540,
        y: 160,
        width: 300,
        height: 280,
        zIndex: 2,
        collapsed: false,
        data: { view: { source: { listId } } },
      },
      [quickLinkId]: {
        id: quickLinkId,
        type: WidgetType.QuickLink,
        title: "Quick Links",
        x: 160,
        y: 500,
        width: 280,
        height: 180,
        zIndex: 3,
        collapsed: false,
        data: {},
      },
    },
    lists: {
      [listId]: { id: listId, name: "Getting Started", createdAt: now },
    },
    listItems,
  })
}

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const pendingWrites = new Map<string, string>()

let storageErrorReported = false
function reportStorageError() {
  if (storageErrorReported || typeof window === "undefined") return
  storageErrorReported = true
  window.dispatchEvent(new CustomEvent("mind-space:storage-error"))
}

export function flushPendingWrites() {
  for (const [name, value] of pendingWrites) {
    try {
      localStorage.setItem(name, value)
    } catch {
      /* storage full or unavailable */
      reportStorageError()
    }
    clearTimeout(debounceTimers[name])
  }
  pendingWrites.clear()
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPendingWrites)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingWrites()
    }
  })
}

const debouncedStorage = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    pendingWrites.set(name, value)
    clearTimeout(debounceTimers[name])
    debounceTimers[name] = setTimeout(() => {
      pendingWrites.delete(name)
      try {
        localStorage.setItem(name, value)
      } catch {
        /* storage full or unavailable */
        reportStorageError()
      }
    }, 300)
  },
  removeItem: (name: string) => {
    pendingWrites.delete(name)
    clearTimeout(debounceTimers[name])
    localStorage.removeItem(name)
  },
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      sheets: [],
      currentSheetId: null,
      widgets: {},
      lists: {},
      listItems: {},
      selectedWidgetIds: [],
      canvasState: defaultCanvasState,
      canvasBackground: defaultCanvasBackground,
      resizeHandleStyle: defaultResizeHandleStyle,
      themeSettings: defaultThemeSettings,
      undoStack: [],
      redoStack: [],
      clipboard: null,

      addSheet: (title, description) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const now = Date.now()
          const sheet: Sheet = {
            id: crypto.randomUUID(),
            title,
            description,
            widgetOrder: [],
            createdAt: now,
            updatedAt: now,
          }
          const sheets = [...state.sheets, sheet]
          const currentSheetId = state.currentSheetId ?? sheet.id
          return {
            sheets,
            currentSheetId,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      deleteSheet: (id) => {
        set((state) => {
          const sheet = state.sheets.find((s) => s.id === id)
          if (!sheet) return state
          const prevTrio = trioOf(state)
          const remainingWidgets = { ...state.widgets }
          for (const widgetId of sheet.widgetOrder) {
            delete remainingWidgets[widgetId]
          }
          const updatedSheets = state.sheets.filter((s) => s.id !== id)
          const currentSheetId =
            state.currentSheetId === id
              ? updatedSheets[0]?.id ?? null
              : state.currentSheetId
          return {
            sheets: updatedSheets,
            widgets: remainingWidgets,
            currentSheetId,
            selectedWidgetIds:
              state.currentSheetId === id ? [] : state.selectedWidgetIds,
            ...pushHistoryEntry(state, prevTrio, { sheets: updatedSheets, widgets: remainingWidgets, currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      setCurrentSheet: (id) => {
        set({ currentSheetId: id, selectedWidgetIds: [] })
      },

      updateSheet: (id, updates) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const sheets = state.sheets.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          )
          return {
            sheets,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      duplicateSheet: (id) => {
        set((state) => {
          const original = state.sheets.find((s) => s.id === id)
          if (!original) return state
          const prevTrio = trioOf(state)
          const now = Date.now()
          const newId = crypto.randomUUID()
          const widgetIdMap = new Map<string, string>()
          const newWidgets: Record<string, Widget> = {}
          const newLists: Record<string, List> = {}
          const newListItems: Record<string, ListItem> = {}
          for (const wid of original.widgetOrder) {
            const w = state.widgets[wid]
            if (!w) continue
            const newWid = crypto.randomUUID()
            widgetIdMap.set(wid, newWid)
            const duplicateTitle = `${w.title} (copy)`
            newWidgets[newWid] = {
              ...w,
              id: newWid,
              title: duplicateTitle,
              data: forkTodoListForDuplicate(
                { ...w, id: newWid, title: duplicateTitle },
                state.lists,
                state.listItems,
                newLists,
                newListItems
              ),
            }
          }
          const newSheet: Sheet = {
            ...original,
            id: newId,
            title: `${original.title} (copy)`,
            widgetOrder: original.widgetOrder
              .map((wid) => widgetIdMap.get(wid))
              .filter(Boolean) as string[],
            createdAt: now,
            updatedAt: now,
          }
          const sheets = [...state.sheets, newSheet]
          const widgets = { ...state.widgets, ...newWidgets }
          const lists = { ...state.lists, ...newLists }
          const listItems = { ...state.listItems, ...newListItems }
          return {
            sheets,
            widgets,
            lists,
            listItems,
            currentSheetId: newId,
            selectedWidgetIds: [],
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: newId, lists, listItems }),
          }
        })
      },

      reorderSheets: (activeSheetId, targetSheetId, position) => {
        set((state) => {
          if (activeSheetId === targetSheetId) return state

          const fromIndex = state.sheets.findIndex((s) => s.id === activeSheetId)
          const targetIndex = state.sheets.findIndex((s) => s.id === targetSheetId)
          if (fromIndex < 0 || targetIndex < 0) return state

          const prevTrio = trioOf(state)
          const nextSheets = [...state.sheets]
          const [moved] = nextSheets.splice(fromIndex, 1)
          const adjustedTargetIndex =
            position === "after"
              ? targetIndex > fromIndex
                ? targetIndex
                : targetIndex + 1
              : targetIndex > fromIndex
                ? targetIndex - 1
                : targetIndex

          nextSheets.splice(adjustedTargetIndex, 0, {
            ...moved,
            updatedAt: Date.now(),
          })

          return {
            sheets: nextSheets,
            ...pushHistoryEntry(state, prevTrio, { sheets: nextSheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      reorderSheetWidgets: (sheetId, widgetOrder) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const sheets = state.sheets.map((s) =>
            s.id === sheetId ? { ...s, widgetOrder, updatedAt: Date.now() } : s
          )
          return {
            sheets,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      addWidget: (sheetId, widget) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const widgets = { ...state.widgets, [widget.id]: widget }
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: [...s.widgetOrder, widget.id],
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets,
            sheets,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      updateWidget: (id, updates) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          const prevTrio = trioOf(state)
          const widgets = {
            ...state.widgets,
            [id]: { ...widget, ...updates },
          }
          return {
            widgets,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      updateWidgets: (ids, updates) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const widgets = { ...state.widgets }
          for (const id of ids) {
            const widget = widgets[id]
            if (!widget) continue
            widgets[id] = { ...widget, ...updates }
          }
          return {
            widgets,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      updateWidgetSilent: (id, updates) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          return { widgets: { ...state.widgets, [id]: { ...widget, ...updates } } }
        })
      },

      recordSnapshot: () => {
        // Two-phase: capture the pre-interaction trio by reference (safe,
        // store updates are immutable spreads) but don't push anything yet.
        // The first mutation that runs a snapshotting action (moveWidget/
        // resizeWidget for drag/resize, or pushHistoryEntry's fallback for
        // any other action) diffs against this and materializes the entry.
        pendingSnapshot = trioOf(get())
      },

      deleteWidgets: (sheetId, widgetIds) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const remainingWidgets = { ...state.widgets }
          for (const id of widgetIds) {
            delete remainingWidgets[id]
          }
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: s.widgetOrder.filter(
                    (id) => !widgetIds.includes(id)
                  ),
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets: remainingWidgets,
            sheets,
            selectedWidgetIds: state.selectedWidgetIds.filter(
              (id) => !widgetIds.includes(id)
            ),
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: remainingWidgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      deleteWidget: (sheetId, widgetId) => {
        set((state) => {
          const prevTrio = trioOf(state)
          const remainingWidgets = { ...state.widgets }
          delete remainingWidgets[widgetId]
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: s.widgetOrder.filter((id) => id !== widgetId),
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets: remainingWidgets,
            sheets,
            selectedWidgetIds: state.selectedWidgetIds.filter(
              (id) => id !== widgetId
            ),
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: remainingWidgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      moveWidget: (id, x, y) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          const grid = state.canvasState.gridSize
          const widgets = {
            ...state.widgets,
            [id]: { ...widget, x: quantize(x, grid), y: quantize(y, grid) },
          }
          if (!pendingSnapshot) {
            return { widgets }
          }
          return {
            widgets,
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      moveWidgets: (moves) => {
        set((state) => {
          const grid = state.canvasState.gridSize
          const widgets = { ...state.widgets }
          for (const { id, x, y } of moves) {
            const widget = widgets[id]
            if (!widget) continue
            widgets[id] = { ...widget, x: quantize(x, grid), y: quantize(y, grid) }
          }
          if (!pendingSnapshot) {
            return { widgets }
          }
          return {
            widgets,
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      resizeWidget: (id, width, height) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          const grid = state.canvasState.gridSize
          const newWidth = Math.max(MIN_WIDTH, quantize(width, grid))
          const newHeight = Math.max(MIN_HEIGHT, quantize(height, grid))
          const widgets = {
            ...state.widgets,
            [id]: { ...widget, width: newWidth, height: newHeight },
          }
          if (!pendingSnapshot) {
            return { widgets }
          }
          return {
            widgets,
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      duplicateWidgets: (sheetId, widgetIds) => {
        set((state) => {
          const sheet = state.sheets.find((s) => s.id === sheetId)
          if (!sheet) return state
          const prevTrio = trioOf(state)
          const maxZ = Math.max(
            ...Object.values(state.widgets).map((w) => w.zIndex),
            0
          )
          const grid = state.canvasState.gridSize
          const newWidgets: Record<string, Widget> = {}
          const newIds: string[] = []
          const newLists: Record<string, List> = {}
          const newListItems: Record<string, ListItem> = {}
          widgetIds.forEach((id, index) => {
            const original = state.widgets[id]
            if (!original) return
            const duplicateTitle = `${original.title} (copy)`
            const duplicate: Widget = {
              ...original,
              id: crypto.randomUUID(),
              x: original.x + grid + index * grid,
              y: original.y + grid + index * grid,
              zIndex: maxZ + 1 + index,
              title: duplicateTitle,
            }
            duplicate.data = forkTodoListForDuplicate(duplicate, state.lists, state.listItems, newLists, newListItems)
            newWidgets[duplicate.id] = duplicate
            newIds.push(duplicate.id)
          })
          const widgets = { ...state.widgets, ...newWidgets }
          const lists = { ...state.lists, ...newLists }
          const listItems = { ...state.listItems, ...newListItems }
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: [...s.widgetOrder, ...newIds],
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets,
            sheets,
            lists,
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId, lists, listItems }),
          }
        })
      },

      duplicateWidgetsAt: (sheetId, widgetIds) => {
        const state = get()
        const sheet = state.sheets.find((s) => s.id === sheetId)
        if (!sheet) return []
        const prevTrio = trioOf(state)
        const maxZ = Math.max(
          ...Object.values(state.widgets).map((w) => w.zIndex),
          0
        )
        const newWidgets: Record<string, Widget> = {}
        const newIds: string[] = []
        const newLists: Record<string, List> = {}
        const newListItems: Record<string, ListItem> = {}
        widgetIds.forEach((id, index) => {
          const original = state.widgets[id]
          if (!original) return
          const duplicate: Widget = {
            ...original,
            id: crypto.randomUUID(),
            zIndex: maxZ + 1 + index,
          }
          duplicate.data = forkTodoListForDuplicate(duplicate, state.lists, state.listItems, newLists, newListItems)
          newWidgets[duplicate.id] = duplicate
          newIds.push(duplicate.id)
        })
        const widgets = { ...state.widgets, ...newWidgets }
        const lists = { ...state.lists, ...newLists }
        const listItems = { ...state.listItems, ...newListItems }
        const sheets = state.sheets.map((s) =>
          s.id === sheetId
            ? {
                ...s,
                widgetOrder: [...s.widgetOrder, ...newIds],
                updatedAt: Date.now(),
              }
            : s
        )
        set({
          widgets,
          sheets,
          lists,
          listItems,
          selectedWidgetIds: newIds,
          ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId, lists, listItems }),
        })
        return newIds
      },

      duplicateWidget: (sheetId, widgetId) => {
        set((state) => {
          const original = state.widgets[widgetId]
          if (!original) return state
          const sheet = state.sheets.find((s) => s.id === sheetId)
          if (!sheet) return state
          const prevTrio = trioOf(state)
          const maxZ = Math.max(
            ...Object.values(state.widgets).map((w) => w.zIndex),
            0
          )
          const grid = state.canvasState.gridSize
          const duplicateTitle = `${original.title} (copy)`
          const duplicate: Widget = {
            ...original,
            id: crypto.randomUUID(),
            x: original.x + grid,
            y: original.y + grid,
            zIndex: maxZ + 1,
            title: duplicateTitle,
          }
          const newLists: Record<string, List> = {}
          const newListItems: Record<string, ListItem> = {}
          duplicate.data = forkTodoListForDuplicate(duplicate, state.lists, state.listItems, newLists, newListItems)
          const widgets = { ...state.widgets, [duplicate.id]: duplicate }
          const lists = { ...state.lists, ...newLists }
          const listItems = { ...state.listItems, ...newListItems }
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: [...s.widgetOrder, duplicate.id],
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets,
            sheets,
            lists,
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId, lists, listItems }),
          }
        })
      },

      toggleCollapse: (id) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          const prevTrio = trioOf(state)
          const widgets = {
            ...state.widgets,
            [id]: { ...widget, collapsed: !widget.collapsed },
          }
          return {
            widgets,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      renameWidget: (id, title) => {
        set((state) => {
          const widget = state.widgets[id]
          if (!widget) return state
          const prevTrio = trioOf(state)
          const widgets = {
            ...state.widgets,
            [id]: { ...widget, title },
          }
          return {
            widgets,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems: state.listItems }),
          }
        })
      },

      selectWidget: (id) => {
        set({ selectedWidgetIds: [id] })
      },

      addToSelection: (id) => {
        set((state) => ({
          selectedWidgetIds: state.selectedWidgetIds.includes(id)
            ? state.selectedWidgetIds
            : [...state.selectedWidgetIds, id],
        }))
      },

      removeFromSelection: (id) => {
        set((state) => ({
          selectedWidgetIds: state.selectedWidgetIds.filter(
            (wid) => wid !== id
          ),
        }))
      },

      deselectAll: () => {
        set({ selectedWidgetIds: [] })
      },

      setSelection: (ids) => {
        set({ selectedWidgetIds: ids })
      },

      setCanvasState: (newState) => {
        set((prev) => ({
          canvasState: { ...prev.canvasState, ...newState },
        }))
      },

      resetCanvasView: () => {
        set({ canvasState: defaultCanvasState })
      },

      setCanvasBackground: (background) => {
        set((prev) => ({
          canvasBackground: { ...prev.canvasBackground, ...background },
        }))
      },

      setSheetBackground: (sheetId, background) => {
        set((prev) => ({
          sheets: prev.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  background:
                    background === null
                      ? undefined
                      : { ...s.background, ...background },
                }
              : s
          ),
        }))
      },

      setResizeHandleStyle: (style) => {
        set({ resizeHandleStyle: style })
      },

      setThemeSettings: (settings) => {
        set((prev) => ({
          themeSettings: { ...prev.themeSettings, ...settings },
        }))
      },

      copyWidgets: (sheetId, widgetIds) => {
        const state = get()
        const sheet = state.sheets.find((s) => s.id === sheetId)
        if (!sheet || widgetIds.length === 0) return
        const widgets = widgetIds.map((id) => state.widgets[id]).filter(Boolean)
        if (widgets.length === 0) return
        const minX = Math.min(...widgets.map((w) => w.x))
        const minY = Math.min(...widgets.map((w) => w.y))
        const clipboard: ClipboardData = {
          widgets: widgets.map((w) => ({
            type: w.type,
            title: w.title,
            width: w.width,
            height: w.height,
            data: isTodoViewData(w.data) ? snapshotTodoClipboardData(w.data, state.listItems) : w.data,
            collapsed: w.collapsed,
            colorTheme: w.colorTheme,
            x: w.x,
            y: w.y,
          })),
          minX,
          minY,
        }
        set({ clipboard })
      },

      pasteWidgets: (sheetId) => {
        set((state) => {
          const sheet = state.sheets.find((s) => s.id === sheetId)
          if (!sheet || !state.clipboard) return state
          const prevTrio = trioOf(state)
          const maxZ = Math.max(
            ...Object.values(state.widgets).map((w) => w.zIndex),
            0
          )
          const grid = state.canvasState.gridSize
          const newWidgets: Record<string, Widget> = {}
          const newIds: string[] = []
          const newLists: Record<string, List> = {}
          const newListItems: Record<string, ListItem> = {}
          state.clipboard.widgets.forEach((data, index) => {
            const id = crypto.randomUUID()
            const offset = grid * (1 + index)
            newWidgets[id] = {
              id,
              type: data.type,
              title: data.title,
              x: data.x - state.clipboard!.minX + offset,
              y: data.y - state.clipboard!.minY + offset,
              width: data.width,
              height: data.height,
              zIndex: maxZ + 1 + index,
              collapsed: data.collapsed,
              data: hoistTodoClipboardData(data.type, data.title, data.data, newLists, newListItems),
              colorTheme: data.colorTheme,
            }
            newIds.push(id)
          })
          const widgets = { ...state.widgets, ...newWidgets }
          const lists = { ...state.lists, ...newLists }
          const listItems = { ...state.listItems, ...newListItems }
          const sheets = state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  widgetOrder: [...s.widgetOrder, ...newIds],
                  updatedAt: Date.now(),
                }
              : s
          )
          return {
            widgets,
            sheets,
            lists,
            listItems,
            selectedWidgetIds: newIds,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId, lists, listItems }),
          }
        })
      },

      createList: (name) => {
        const id = crypto.randomUUID()
        set((state) => {
          const prevTrio = trioOf(state)
          const lists = { ...state.lists, [id]: { id, name, createdAt: Date.now() } }
          return {
            lists,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists, listItems: state.listItems }),
          }
        })
        return id
      },

      renameList: (id, name) => {
        set((state) => {
          const list = state.lists[id]
          if (!list) return state
          const prevTrio = trioOf(state)
          const lists = { ...state.lists, [id]: { ...list, name } }
          return {
            lists,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists, listItems: state.listItems }),
          }
        })
      },

      deleteList: (id) => {
        set((state) => {
          if (!state.lists[id]) return state
          const prevTrio = trioOf(state)
          const lists = { ...state.lists }
          delete lists[id]
          const listItems = { ...state.listItems }
          for (const itemId of Object.keys(listItems)) {
            if (listItems[itemId].listId === id) delete listItems[itemId]
          }
          return {
            lists,
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists, listItems }),
          }
        })
      },

      addListItem: (listId, text) => {
        const id = crypto.randomUUID()
        set((state) => {
          const prevTrio = trioOf(state)
          const itemsInList = Object.values(state.listItems).filter((item) => item.listId === listId)
          const lastOrder = itemsInList.reduce<string | null>(
            (max, item) => (max === null || item.order > max ? item.order : max),
            null
          )
          const newItem: ListItem = {
            id,
            listId,
            text,
            status: "todo",
            order: orderKeyBetween(lastOrder, null),
            tags: [],
            createdAt: Date.now(),
          }
          const listItems = { ...state.listItems, [id]: newItem }
          return {
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems }),
          }
        })
        return id
      },

      updateListItem: (id, updates) => {
        set((state) => {
          const item = state.listItems[id]
          if (!item) return state
          const prevTrio = trioOf(state)
          const listItems = { ...state.listItems, [id]: { ...item, ...updates } }
          return {
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems }),
          }
        })
      },

      cycleListItemStatus: (id) => {
        set((state) => {
          const item = state.listItems[id]
          if (!item) return state
          const prevTrio = trioOf(state)
          const nextStatus = getNextListItemStatus(item.status)
          const updated: ListItem = {
            ...item,
            status: nextStatus,
            completedAt: nextStatus === "done" ? Date.now() : undefined,
          }
          const listItems = { ...state.listItems, [id]: updated }
          return {
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems }),
          }
        })
      },

      deleteListItem: (id) => {
        set((state) => {
          if (!state.listItems[id]) return state
          const prevTrio = trioOf(state)
          const listItems = { ...state.listItems }
          delete listItems[id]
          return {
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems }),
          }
        })
      },

      moveListItem: (id, beforeId, afterId) => {
        set((state) => {
          const item = state.listItems[id]
          if (!item) return state
          const prevTrio = trioOf(state)
          const beforeOrder = beforeId ? state.listItems[beforeId]?.order ?? null : null
          const afterOrder = afterId ? state.listItems[afterId]?.order ?? null : null
          const order = orderKeyBetween(beforeOrder, afterOrder)
          const listItems = { ...state.listItems, [id]: { ...item, order } }
          return {
            listItems,
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId, lists: state.lists, listItems }),
          }
        })
      },

      undo: () => {
        pendingSnapshot = null
        const { undoStack, redoStack, sheets, widgets, currentSheetId, lists, listItems } = get()
        if (undoStack.length === 0) return
        const entry = undoStack[undoStack.length - 1]
        if (!isValidHistoryEntry(entry)) {
          set({ undoStack: undoStack.slice(0, -1) })
          return
        }
        const { restored, mirror } = applyHistoryEntry({ sheets, widgets, currentSheetId, lists, listItems }, entry)
        set({
          ...restored,
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, mirror].slice(-MAX_HISTORY),
          selectedWidgetIds: [],
        })
      },

      redo: () => {
        pendingSnapshot = null
        const { undoStack, redoStack, sheets, widgets, currentSheetId, lists, listItems } = get()
        if (redoStack.length === 0) return
        const entry = redoStack[redoStack.length - 1]
        if (!isValidHistoryEntry(entry)) {
          set({ redoStack: redoStack.slice(0, -1) })
          return
        }
        const { restored, mirror } = applyHistoryEntry({ sheets, widgets, currentSheetId, lists, listItems }, entry)
        set({
          ...restored,
          undoStack: [...undoStack, mirror].slice(-MAX_HISTORY),
          redoStack: redoStack.slice(0, -1),
          selectedWidgetIds: [],
        })
      },
    }),
    {
      name: "mind-space-store",
      storage: createJSONStorage(() => debouncedStorage),
      version: 7,
      migrate: migratePersistedState,
      partialize: (state) => ({
        sheets: state.sheets,
        currentSheetId: state.currentSheetId,
        widgets: state.widgets,
        lists: state.lists,
        listItems: state.listItems,
        canvasState: state.canvasState,
        canvasBackground: state.canvasBackground,
        resizeHandleStyle: state.resizeHandleStyle,
        themeSettings: state.themeSettings,
        clipboard: state.clipboard,
        undoStack: state.undoStack,
        redoStack: state.redoStack,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) return
          if (state && state.sheets.length === 0) {
            setTimeout(initializeDefaultState, 0)
          }
        }
      },
    }
  )
)
