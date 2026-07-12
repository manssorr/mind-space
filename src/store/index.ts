import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { WidgetType, type Sheet, type Widget, type CanvasState, type ThemeSettings, type CanvasBackground, type ResizeHandleStyle } from "@/types"
import { diffForHistory, applyHistoryEntry, isValidHistoryEntry, type HistoryEntry, type HistoryTrio } from "@/lib/history-diff"
import { quantize } from "@/lib/geometry"

const MIN_WIDTH = 120
const MIN_HEIGHT = 80

interface ClipboardData {
  widgets: (Pick<Widget, "type" | "title" | "width" | "height" | "data" | "collapsed" | "colorTheme"> & { x: number; y: number })[]
  minX: number
  minY: number
}

interface StoreState {
  sheets: Sheet[]
  currentSheetId: string | null
  widgets: Record<string, Widget>
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

  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 50

function trioOf(state: { sheets: Sheet[]; widgets: Record<string, Widget>; currentSheetId: string | null }): HistoryTrio {
  return { sheets: state.sheets, widgets: state.widgets, currentSheetId: state.currentSheetId }
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
        data: {
          items: [
            { id: crypto.randomUUID(), text: "Pan the canvas (hold Space + drag)", status: "todo" as const, done: false },
            { id: crypto.randomUUID(), text: "Add widgets from the + button", status: "todo" as const, done: false },
            { id: crypto.randomUUID(), text: "Create new sheets in the sidebar", status: "todo" as const, done: false },
          ],
        },
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: updatedSheets, widgets: remainingWidgets, currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId: state.currentSheetId }),
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
          for (const wid of original.widgetOrder) {
            const w = state.widgets[wid]
            if (!w) continue
            const newWid = crypto.randomUUID()
            widgetIdMap.set(wid, newWid)
            newWidgets[newWid] = {
              ...w,
              id: newWid,
              title: `${w.title} (copy)`,
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
          return {
            sheets,
            widgets,
            currentSheetId: newId,
            selectedWidgetIds: [],
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: newId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: nextSheets, widgets: state.widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: state.widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: remainingWidgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets: remainingWidgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, trioOf(state), { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
          widgetIds.forEach((id, index) => {
            const original = state.widgets[id]
            if (!original) return
            const duplicate: Widget = {
              ...original,
              id: crypto.randomUUID(),
              x: original.x + grid + index * grid,
              y: original.y + grid + index * grid,
              zIndex: maxZ + 1 + index,
              title: `${original.title} (copy)`,
            }
            newWidgets[duplicate.id] = duplicate
            newIds.push(duplicate.id)
          })
          const widgets = { ...state.widgets, ...newWidgets }
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId }),
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
        widgetIds.forEach((id, index) => {
          const original = state.widgets[id]
          if (!original) return
          const duplicate: Widget = {
            ...original,
            id: crypto.randomUUID(),
            zIndex: maxZ + 1 + index,
          }
          newWidgets[duplicate.id] = duplicate
          newIds.push(duplicate.id)
        })
        const widgets = { ...state.widgets, ...newWidgets }
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
          selectedWidgetIds: newIds,
          ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId }),
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
          const duplicate: Widget = {
            ...original,
            id: crypto.randomUUID(),
            x: original.x + grid,
            y: original.y + grid,
            zIndex: maxZ + 1,
            title: `${original.title} (copy)`,
          }
          const widgets = { ...state.widgets, [duplicate.id]: duplicate }
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
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            ...pushHistoryEntry(state, prevTrio, { sheets: state.sheets, widgets, currentSheetId: state.currentSheetId }),
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
            data: w.data,
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
              data: { ...data.data },
              colorTheme: data.colorTheme,
            }
            newIds.push(id)
          })
          const widgets = { ...state.widgets, ...newWidgets }
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
            selectedWidgetIds: newIds,
            ...pushHistoryEntry(state, prevTrio, { sheets, widgets, currentSheetId: state.currentSheetId }),
          }
        })
      },

      undo: () => {
        pendingSnapshot = null
        const { undoStack, redoStack, sheets, widgets, currentSheetId } = get()
        if (undoStack.length === 0) return
        const entry = undoStack[undoStack.length - 1]
        if (!isValidHistoryEntry(entry)) {
          set({ undoStack: undoStack.slice(0, -1) })
          return
        }
        const { restored, mirror } = applyHistoryEntry({ sheets, widgets, currentSheetId }, entry)
        set({
          ...restored,
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, mirror].slice(-MAX_HISTORY),
          selectedWidgetIds: [],
        })
      },

      redo: () => {
        pendingSnapshot = null
        const { undoStack, redoStack, sheets, widgets, currentSheetId } = get()
        if (redoStack.length === 0) return
        const entry = redoStack[redoStack.length - 1]
        if (!isValidHistoryEntry(entry)) {
          set({ redoStack: redoStack.slice(0, -1) })
          return
        }
        const { restored, mirror } = applyHistoryEntry({ sheets, widgets, currentSheetId }, entry)
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
      version: 6,
      migrate: migratePersistedState,
      partialize: (state) => ({
        sheets: state.sheets,
        currentSheetId: state.currentSheetId,
        widgets: state.widgets,
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
