import { beforeEach, describe, expect, it } from "vitest"
import { useStore, migratePersistedState, flushPendingWrites, __resetPendingSnapshotForTests } from "@/store"
import { WidgetType, type Widget, type List, type ListItem } from "@/types"

function makeWidget(id: string, overrides: Partial<Widget> = {}): Widget {
  return {
    id, type: WidgetType.Note, title: "w", x: 0, y: 0,
    width: 100, height: 100, zIndex: 1, collapsed: false, data: {},
    ...overrides,
  }
}

function makeTodoWidget(id: string, listId: string, overrides: Partial<Widget> = {}): Widget {
  return makeWidget(id, {
    type: WidgetType.Todo,
    data: { view: { source: { listId } } },
    ...overrides,
  })
}

function makeList(id: string, overrides: Partial<List> = {}): List {
  return { id, name: "My List", createdAt: 0, ...overrides }
}

function makeListItem(id: string, listId: string, overrides: Partial<ListItem> = {}): ListItem {
  return { id, listId, text: "item", status: "todo", order: "m", tags: [], createdAt: 0, ...overrides }
}

beforeEach(() => {
  localStorage.clear()
  __resetPendingSnapshotForTests()
  useStore.setState({
    sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["w1"], createdAt: 0, updatedAt: 0 }],
    currentSheetId: "s1",
    widgets: { w1: makeWidget("w1") },
    lists: {},
    listItems: {},
    selectedWidgetIds: [],
    undoStack: [],
    redoStack: [],
    clipboard: null,
  })
})

describe("addSheet", () => {
  it("appends a sheet and pushes one undo snapshot", () => {
    useStore.getState().addSheet("Sheet 2")
    const state = useStore.getState()
    expect(state.sheets).toHaveLength(2)
    expect(state.sheets[1].title).toBe("Sheet 2")
    expect(state.undoStack).toHaveLength(1)
  })
})

describe("deleteSheet", () => {
  it("removes the sheet and its widgets, and moves currentSheetId to the first remaining sheet", () => {
    useStore.setState({
      sheets: [
        { id: "s1", title: "Sheet 1", widgetOrder: ["w1"], createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Sheet 2", widgetOrder: [], createdAt: 0, updatedAt: 0 },
      ],
      currentSheetId: "s1",
    })
    useStore.getState().deleteSheet("s1")
    const state = useStore.getState()
    expect(state.sheets.map((s) => s.id)).toEqual(["s2"])
    expect(state.widgets.w1).toBeUndefined()
    expect(state.currentSheetId).toBe("s2")
  })

  it("sets currentSheetId to null when the last sheet is deleted", () => {
    useStore.getState().deleteSheet("s1")
    const state = useStore.getState()
    expect(state.sheets).toHaveLength(0)
    expect(state.currentSheetId).toBeNull()
  })
})

describe("duplicateSheet", () => {
  it("creates new widget IDs and appends ' (copy)' to titles", () => {
    useStore.getState().duplicateSheet("s1")
    const state = useStore.getState()
    const newSheet = state.sheets[1]
    expect(newSheet.title).toBe("Sheet 1 (copy)")
    expect(newSheet.widgetOrder).toHaveLength(1)
    const newWidgetId = newSheet.widgetOrder[0]
    expect(newWidgetId).not.toBe("w1")
    expect(state.widgets[newWidgetId].title).toBe("w (copy)")
  })

  it("keeps the same x/y position as the source widget", () => {
    useStore.getState().duplicateSheet("s1")
    const state = useStore.getState()
    const newSheet = state.sheets[1]
    const newWidgetId = newSheet.widgetOrder[0]
    expect(state.widgets[newWidgetId].x).toBe(state.widgets.w1.x)
    expect(state.widgets[newWidgetId].y).toBe(state.widgets.w1.y)
  })
})

describe("updateWidget", () => {
  it("merges partial updates and pushes an undo snapshot", () => {
    useStore.getState().updateWidget("w1", { title: "updated", x: 42 })
    const state = useStore.getState()
    expect(state.widgets.w1.title).toBe("updated")
    expect(state.widgets.w1.x).toBe(42)
    expect(state.widgets.w1.y).toBe(0)
    expect(state.undoStack).toHaveLength(1)
  })

  it("is a no-op for an unknown id", () => {
    useStore.getState().updateWidget("does-not-exist", { title: "x" })
    const state = useStore.getState()
    expect(state.widgets["does-not-exist"]).toBeUndefined()
    expect(state.undoStack).toHaveLength(0)
  })
})

describe("updateWidgets", () => {
  it("applies the same update to all ids in one undo entry", () => {
    useStore.setState({
      widgets: {
        w1: makeWidget("w1", { colorTheme: undefined }),
        w2: makeWidget("w2", { colorTheme: undefined }),
        w3: makeWidget("w3", { colorTheme: undefined }),
      },
    })
    useStore.getState().updateWidgets(["w1", "w2", "w3"], { colorTheme: "blue" })
    const state = useStore.getState()
    expect(state.widgets.w1.colorTheme).toBe("blue")
    expect(state.widgets.w2.colorTheme).toBe("blue")
    expect(state.widgets.w3.colorTheme).toBe("blue")
    expect(state.undoStack).toHaveLength(1)
  })

  it("undo restores every widget's previous colorTheme", () => {
    useStore.setState({
      widgets: {
        w1: makeWidget("w1", { colorTheme: "red" }),
        w2: makeWidget("w2", { colorTheme: undefined }),
      },
    })
    useStore.getState().updateWidgets(["w1", "w2"], { colorTheme: "blue" })
    useStore.getState().undo()
    const state = useStore.getState()
    expect(state.widgets.w1.colorTheme).toBe("red")
    expect(state.widgets.w2.colorTheme).toBeUndefined()
  })

  it("skips unknown ids", () => {
    useStore.getState().updateWidgets(["does-not-exist"], { colorTheme: "blue" })
    const state = useStore.getState()
    expect(state.widgets["does-not-exist"]).toBeUndefined()
  })
})

describe("moveWidget", () => {
  it("quantizes x/y to the grid and does not push an undo snapshot", () => {
    useStore.getState().moveWidget("w1", 10, 20)
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(20)
    expect(state.widgets.w1.y).toBe(20)
    expect(state.undoStack).toHaveLength(0)
  })
})

describe("moveWidgets", () => {
  it("quantizes x/y to the grid and does not push an undo snapshot", () => {
    useStore.setState({ widgets: { w1: makeWidget("w1"), w2: makeWidget("w2") } })
    useStore.getState().moveWidgets([
      { id: "w1", x: 10, y: 20 },
      { id: "w2", x: 30, y: 40 },
    ])
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(20)
    expect(state.widgets.w1.y).toBe(20)
    expect(state.widgets.w2.x).toBe(40)
    expect(state.widgets.w2.y).toBe(40)
    expect(state.undoStack).toHaveLength(0)
  })

  it("skips unknown ids", () => {
    useStore.getState().moveWidgets([{ id: "does-not-exist", x: 10, y: 20 }])
    const state = useStore.getState()
    expect(state.widgets["does-not-exist"]).toBeUndefined()
  })

  it("records one undo entry for a two-widget drag across multiple frames and restores both widgets on undo", () => {
    useStore.setState({ widgets: { w1: makeWidget("w1"), w2: makeWidget("w2", { x: 5, y: 5 }) } })
    useStore.getState().recordSnapshot()

    useStore.getState().moveWidgets([
      { id: "w1", x: 10, y: 20 },
      { id: "w2", x: 15, y: 25 },
    ])
    useStore.getState().moveWidgets([
      { id: "w1", x: 40, y: 50 },
      { id: "w2", x: 45, y: 55 },
    ])

    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(40)
    expect(state.widgets.w2.x).toBe(40)
    expect(state.undoStack).toHaveLength(1)

    useStore.getState().undo()
    const restored = useStore.getState()
    expect(restored.widgets.w1.x).toBe(0)
    expect(restored.widgets.w1.y).toBe(0)
    expect(restored.widgets.w2.x).toBe(5)
    expect(restored.widgets.w2.y).toBe(5)
  })
})

describe("resizeWidget", () => {
  it("quantizes width/height to the grid and does not push an undo snapshot", () => {
    useStore.getState().resizeWidget("w1", 200, 300)
    const state = useStore.getState()
    expect(state.widgets.w1.width).toBe(200)
    expect(state.widgets.w1.height).toBe(300)
    expect(state.undoStack).toHaveLength(0)
  })

  it("clamps to MIN_WIDTH/MIN_HEIGHT after quantizing", () => {
    useStore.getState().resizeWidget("w1", 15, 30)
    const state = useStore.getState()
    expect(state.widgets.w1.width).toBe(120)
    expect(state.widgets.w1.height).toBe(80)
  })
})

describe("undo/redo", () => {
  it("undo after updateWidget restores previous state and moves an entry to redoStack; redo re-applies it", () => {
    useStore.getState().updateWidget("w1", { title: "updated" })
    expect(useStore.getState().widgets.w1.title).toBe("updated")

    useStore.getState().undo()
    let state = useStore.getState()
    expect(state.widgets.w1.title).toBe("w")
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)

    useStore.getState().redo()
    state = useStore.getState()
    expect(state.widgets.w1.title).toBe("updated")
    expect(state.undoStack).toHaveLength(1)
    expect(state.redoStack).toHaveLength(0)
  })

  it("clears redoStack when a new snapshotting action runs", () => {
    useStore.getState().updateWidget("w1", { title: "updated" })
    useStore.getState().undo()
    expect(useStore.getState().redoStack).toHaveLength(1)

    useStore.getState().updateWidget("w1", { title: "again" })
    expect(useStore.getState().redoStack).toHaveLength(0)
  })
})

describe("history cap", () => {
  it("caps undoStack at 50 after 55 updateWidget calls", () => {
    for (let i = 0; i < 55; i++) {
      useStore.getState().updateWidget("w1", { x: i })
    }
    expect(useStore.getState().undoStack).toHaveLength(50)
  })
})

describe("copyWidgets / pasteWidgets", () => {
  it("creates widgets with new IDs, grid-sized offset positions, and selects the new IDs", () => {
    useStore.getState().copyWidgets("s1", ["w1"])
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const newIds = state.selectedWidgetIds
    expect(newIds).toHaveLength(1)
    expect(newIds[0]).not.toBe("w1")
    const pasted = state.widgets[newIds[0]]
    expect(pasted.x).toBe(0 + 20)
    expect(pasted.y).toBe(0 + 20)
  })

  it("carries colorTheme through copy/paste", () => {
    useStore.setState({
      widgets: { w1: makeWidget("w1", { colorTheme: "blue" }) },
    })
    useStore.getState().copyWidgets("s1", ["w1"])
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pasted = state.widgets[state.selectedWidgetIds[0]]
    expect(pasted.colorTheme).toBe("blue")
  })

  it("pastes colorTheme as undefined when source widget has none", () => {
    useStore.getState().copyWidgets("s1", ["w1"])
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pasted = state.widgets[state.selectedWidgetIds[0]]
    expect(pasted.colorTheme).toBeUndefined()
  })

  it("preserves collapsed, data, title, width, and height on paste", () => {
    useStore.setState({
      widgets: {
        w1: makeWidget("w1", {
          title: "my note",
          width: 240,
          height: 180,
          collapsed: true,
          data: { text: "hello" },
          colorTheme: "green",
        }),
      },
    })
    useStore.getState().copyWidgets("s1", ["w1"])
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pasted = state.widgets[state.selectedWidgetIds[0]]
    expect(pasted.title).toBe("my note")
    expect(pasted.width).toBe(240)
    expect(pasted.height).toBe(180)
    expect(pasted.collapsed).toBe(true)
    expect(pasted.data).toEqual({ text: "hello" })
    expect(pasted.colorTheme).toBe("green")
  })

  it("pastes cleanly from an old-shape clipboard entry lacking colorTheme", () => {
    useStore.setState({
      clipboard: {
        widgets: [
          { type: WidgetType.Note, title: "w", width: 100, height: 100, data: {}, collapsed: false, x: 0, y: 0 },
        ],
        minX: 0,
        minY: 0,
      },
    })
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pasted = state.widgets[state.selectedWidgetIds[0]]
    expect(pasted.colorTheme).toBeUndefined()
    expect(pasted.title).toBe("w")
  })
})

describe("duplicateWidgetsAt", () => {
  it("clones in place, no title suffix, selects new ids, appends to widgetOrder, returns ids", () => {
    const newIds = useStore.getState().duplicateWidgetsAt("s1", ["w1"])
    const state = useStore.getState()
    expect(newIds).toHaveLength(1)
    expect(newIds[0]).not.toBe("w1")
    const clone = state.widgets[newIds[0]]
    expect(clone.x).toBe(0)
    expect(clone.y).toBe(0)
    expect(clone.title).toBe("w")
    expect(state.selectedWidgetIds).toEqual(newIds)
    expect(state.sheets[0].widgetOrder).toEqual(["w1", ...newIds])
  })

  it("records one undo entry; undo removes clones, redo re-adds them at their final moved position", () => {
    useStore.getState().recordSnapshot()
    const cloneIds = useStore.getState().duplicateWidgetsAt("s1", ["w1"])
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().moveWidget(cloneIds[0], 10, 20)
    useStore.getState().moveWidget(cloneIds[0], 40, 50)
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().undo()
    let state = useStore.getState()
    expect(state.widgets[cloneIds[0]]).toBeUndefined()
    expect(state.widgets.w1.x).toBe(0)
    expect(state.widgets.w1.y).toBe(0)

    useStore.getState().redo()
    state = useStore.getState()
    expect(state.widgets[cloneIds[0]]).toBeDefined()
    expect(state.widgets[cloneIds[0]].x).toBe(40)
    expect(state.widgets[cloneIds[0]].y).toBe(60)
  })
})

describe("setSelection", () => {
  it("replaces selectedWidgetIds and does not push an undo entry", () => {
    useStore.setState({ selectedWidgetIds: ["w1"] })
    useStore.getState().setSelection(["a", "b"])
    const state = useStore.getState()
    expect(state.selectedWidgetIds).toEqual(["a", "b"])
    expect(state.undoStack).toHaveLength(0)
  })
})

describe("deleteWidgets", () => {
  it("removes from widgets, widgetOrder, and selectedWidgetIds", () => {
    useStore.setState({ selectedWidgetIds: ["w1"] })
    useStore.getState().deleteWidgets("s1", ["w1"])
    const state = useStore.getState()
    expect(state.widgets.w1).toBeUndefined()
    expect(state.sheets[0].widgetOrder).not.toContain("w1")
    expect(state.selectedWidgetIds).not.toContain("w1")
  })
})

describe("migratePersistedState", () => {
  it("sets canvasState.snapToObjects to true when migrating a v3 blob missing the key", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: true, snapToGrid: true, gridSize: 20 },
    }
    const migrated = migratePersistedState(persisted, 3) as { canvasState: { snapToObjects: boolean } }
    expect(migrated.canvasState.snapToObjects).toBe(true)
  })

  it("does not override an existing snapToObjects value", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: true, snapToGrid: true, gridSize: 20, snapToObjects: false },
    }
    const migrated = migratePersistedState(persisted, 3) as { canvasState: { snapToObjects: boolean } }
    expect(migrated.canvasState.snapToObjects).toBe(false)
  })

  it("quantizes off-grid widget geometry and strips snapToGrid when migrating a v4 blob", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: true, snapToGrid: true, gridSize: 20, snapToObjects: true },
      widgets: {
        w1: makeWidget("w1", { x: 150, y: 150, width: 305, height: 280 }),
      },
    }
    const migrated = migratePersistedState(persisted, 4) as {
      canvasState: { snapToGrid?: boolean }
      widgets: Record<string, Widget>
    }
    expect(migrated.widgets.w1.x).toBe(160)
    expect(migrated.widgets.w1.y).toBe(160)
    expect(migrated.widgets.w1.width).toBe(300)
    expect(migrated.widgets.w1.height).toBe(280)
    expect(migrated.canvasState.snapToGrid).toBeUndefined()
  })

  it("clamps a quantized width/height below the minimum back up to MIN_WIDTH/MIN_HEIGHT", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: true, snapToGrid: true, gridSize: 20, snapToObjects: true },
      widgets: {
        w1: makeWidget("w1", { x: 0, y: 0, width: 15, height: 30 }),
      },
    }
    const migrated = migratePersistedState(persisted, 4) as { widgets: Record<string, Widget> }
    expect(migrated.widgets.w1.width).toBe(120)
    expect(migrated.widgets.w1.height).toBe(80)
  })

  it("maps gridEnabled false to canvasBackground.pattern none and strips gridEnabled when migrating a v5 blob", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: false, gridSize: 20, snapToObjects: true },
    }
    const migrated = migratePersistedState(persisted, 5) as {
      canvasState: { gridEnabled?: boolean }
      canvasBackground: { color: string; pattern: string }
    }
    expect(migrated.canvasBackground).toEqual({ color: "default", pattern: "none" })
    expect(migrated.canvasState.gridEnabled).toBeUndefined()
  })

  it("maps gridEnabled true to canvasBackground.pattern grid when migrating a v5 blob", () => {
    const persisted = {
      canvasState: { offsetX: 0, offsetY: 0, scale: 1, gridEnabled: true, gridSize: 20, snapToObjects: true },
    }
    const migrated = migratePersistedState(persisted, 5) as {
      canvasBackground: { color: string; pattern: string }
    }
    expect(migrated.canvasBackground).toEqual({ color: "default", pattern: "grid" })
  })
})

describe("setCanvasBackground", () => {
  it("merges a partial update into the existing canvasBackground", () => {
    useStore.getState().setCanvasBackground({ pattern: "dots" })
    expect(useStore.getState().canvasBackground.pattern).toBe("dots")
    expect(useStore.getState().canvasBackground.color).toBe("default")

    useStore.getState().setCanvasBackground({ color: "ocean" })
    expect(useStore.getState().canvasBackground).toEqual({ color: "ocean", pattern: "dots" })
  })
})

describe("setResizeHandleStyle", () => {
  it("defaults to corners", () => {
    expect(useStore.getState().resizeHandleStyle).toBe("corners")
  })

  it("updates resizeHandleStyle", () => {
    useStore.getState().setResizeHandleStyle("brackets")
    expect(useStore.getState().resizeHandleStyle).toBe("brackets")

    useStore.getState().setResizeHandleStyle("invisible")
    expect(useStore.getState().resizeHandleStyle).toBe("invisible")
  })

  it("persists across a rehydrate cycle", async () => {
    useStore.getState().setResizeHandleStyle("brackets")
    flushPendingWrites()
    await useStore.persist.rehydrate()
    expect(useStore.getState().resizeHandleStyle).toBe("brackets")
  })
})

describe("resizeHandleStyle rehydrate fallback", () => {
  it("an old persisted blob missing resizeHandleStyle rehydrates without errors, defaulting to corners", async () => {
    // Simulate a pre-030 payload written before this field existed: other
    // top-level keys present, resizeHandleStyle absent. On a real page
    // load the store creator seeds resizeHandleStyle to "corners" before
    // persist.rehydrate() ever runs, and zustand's default merge
    // (`{...currentState, ...persisted}`) leaves keys the persisted blob
    // doesn't mention untouched - so no migration entry is needed. Model
    // that exact ordering: reset in-memory to the creator default first,
    // then rehydrate from a blob lacking the key.
    useStore.getState().setResizeHandleStyle("invisible")
    flushPendingWrites()
    const raw = JSON.parse(localStorage.getItem("mind-space-store")!)
    delete raw.state.resizeHandleStyle
    localStorage.setItem("mind-space-store", JSON.stringify(raw))
    expect(raw.state.resizeHandleStyle).toBeUndefined()

    useStore.setState({ resizeHandleStyle: "corners" })
    await expect(useStore.persist.rehydrate()).resolves.not.toThrow()
    expect(useStore.getState().resizeHandleStyle).toBe("corners")
  })
})

describe("setSheetBackground", () => {
  it("sets a per-sheet override that does not affect other sheets", () => {
    useStore.setState({
      sheets: [
        { id: "s1", title: "Sheet 1", widgetOrder: [], createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Sheet 2", widgetOrder: [], createdAt: 0, updatedAt: 0 },
      ],
    })
    useStore.getState().setSheetBackground("s1", { color: "ocean", pattern: "none" })
    const sheets = useStore.getState().sheets
    expect(sheets.find((s) => s.id === "s1")?.background).toEqual({ color: "ocean", pattern: "none" })
    expect(sheets.find((s) => s.id === "s2")?.background).toBeUndefined()
  })

  it("clears the override when passed null", () => {
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: [], createdAt: 0, updatedAt: 0, background: { color: "ocean" } }],
    })
    useStore.getState().setSheetBackground("s1", null)
    expect(useStore.getState().sheets.find((s) => s.id === "s1")?.background).toBeUndefined()
  })

  it("does not push an undo/redo entry", () => {
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: [], createdAt: 0, updatedAt: 0 }],
      undoStack: [],
    })
    useStore.getState().setSheetBackground("s1", { color: "ocean" })
    expect(useStore.getState().undoStack).toEqual([])
  })
})

describe("createList", () => {
  it("creates a list, returns its id, and pushes one undo entry", () => {
    const id = useStore.getState().createList("Groceries")
    const state = useStore.getState()
    expect(state.lists[id]).toBeDefined()
    expect(state.lists[id].name).toBe("Groceries")
    expect(state.undoStack).toHaveLength(1)
  })
})

describe("renameList", () => {
  it("renames a list and pushes one undo entry", () => {
    useStore.setState({ lists: { l1: makeList("l1", { name: "old" }) } })
    useStore.getState().renameList("l1", "new")
    expect(useStore.getState().lists.l1.name).toBe("new")
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it("is a no-op for an unknown id", () => {
    useStore.getState().renameList("does-not-exist", "new")
    expect(useStore.getState().undoStack).toHaveLength(0)
  })
})

describe("deleteList", () => {
  it("deletes a list and cascades its items", () => {
    useStore.setState({
      lists: { l1: makeList("l1") },
      listItems: { i1: makeListItem("i1", "l1"), i2: makeListItem("i2", "l1") },
    })
    useStore.getState().deleteList("l1")
    const state = useStore.getState()
    expect(state.lists.l1).toBeUndefined()
    expect(state.listItems.i1).toBeUndefined()
    expect(state.listItems.i2).toBeUndefined()
  })

  it("does not delete items belonging to other lists", () => {
    useStore.setState({
      lists: { l1: makeList("l1"), l2: makeList("l2") },
      listItems: { i1: makeListItem("i1", "l1"), i2: makeListItem("i2", "l2") },
    })
    useStore.getState().deleteList("l1")
    expect(useStore.getState().listItems.i2).toBeDefined()
  })

  it("undo restores the list and its items", () => {
    useStore.setState({
      lists: { l1: makeList("l1") },
      listItems: { i1: makeListItem("i1", "l1") },
    })
    useStore.getState().deleteList("l1")
    useStore.getState().undo()
    const state = useStore.getState()
    expect(state.lists.l1).toBeDefined()
    expect(state.listItems.i1).toBeDefined()
  })
})

describe("addListItem", () => {
  it("appends an item with status todo and an order after the current last", () => {
    useStore.setState({ lists: { l1: makeList("l1") } })
    const id = useStore.getState().addListItem("l1", "buy milk")
    const state = useStore.getState()
    expect(state.listItems[id].text).toBe("buy milk")
    expect(state.listItems[id].status).toBe("todo")
    expect(state.listItems[id].listId).toBe("l1")
    expect(state.undoStack).toHaveLength(1)
  })

  it("orders a second item after the first", () => {
    useStore.setState({ lists: { l1: makeList("l1") } })
    const id1 = useStore.getState().addListItem("l1", "first")
    const id2 = useStore.getState().addListItem("l1", "second")
    const state = useStore.getState()
    expect(state.listItems[id1].order < state.listItems[id2].order).toBe(true)
  })
})

describe("updateListItem", () => {
  it("merges text/tags updates and pushes one undo entry", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1", { text: "old" }) } })
    useStore.getState().updateListItem("i1", { text: "new" })
    expect(useStore.getState().listItems.i1.text).toBe("new")
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it("is a no-op for an unknown id", () => {
    useStore.getState().updateListItem("does-not-exist", { text: "x" })
    expect(useStore.getState().undoStack).toHaveLength(0)
  })
})

describe("cycleListItemStatus", () => {
  it("cycles todo -> progress -> done -> todo, matching getNextTodoStatus", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1", { status: "todo" }) } })

    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().listItems.i1.status).toBe("progress")

    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().listItems.i1.status).toBe("done")

    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().listItems.i1.status).toBe("todo")
  })

  it("sets completedAt when entering done and clears it when leaving done", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1", { status: "progress" }) } })

    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().listItems.i1.status).toBe("done")
    expect(useStore.getState().listItems.i1.completedAt).toBeDefined()

    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().listItems.i1.status).toBe("todo")
    expect(useStore.getState().listItems.i1.completedAt).toBeUndefined()
  })

  it("each cycle is one undo entry; undo restores the previous status", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1", { status: "todo" }) } })
    useStore.getState().cycleListItemStatus("i1")
    expect(useStore.getState().undoStack).toHaveLength(1)
    useStore.getState().undo()
    expect(useStore.getState().listItems.i1.status).toBe("todo")
  })
})

describe("deleteListItem", () => {
  it("removes the item and pushes one undo entry", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1") } })
    useStore.getState().deleteListItem("i1")
    expect(useStore.getState().listItems.i1).toBeUndefined()
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it("undo restores the deleted item", () => {
    useStore.setState({ listItems: { i1: makeListItem("i1", "l1", { text: "keep me" }) } })
    useStore.getState().deleteListItem("i1")
    useStore.getState().undo()
    expect(useStore.getState().listItems.i1.text).toBe("keep me")
  })
})

describe("moveListItem", () => {
  it("rewrites the order key for one item between two others", () => {
    useStore.setState({
      listItems: {
        i1: makeListItem("i1", "l1", { order: "a" }),
        i2: makeListItem("i2", "l1", { order: "b" }),
        i3: makeListItem("i3", "l1", { order: "c" }),
      },
    })
    useStore.getState().moveListItem("i3", "i1", "i2")
    const state = useStore.getState()
    expect(state.listItems.i3.order > state.listItems.i1.order).toBe(true)
    expect(state.listItems.i3.order < state.listItems.i2.order).toBe(true)
  })

  it("only touches the moved item's entry (one-item undo entry)", () => {
    useStore.setState({
      listItems: {
        i1: makeListItem("i1", "l1", { order: "a" }),
        i2: makeListItem("i2", "l1", { order: "b" }),
      },
    })
    useStore.getState().moveListItem("i2", null, "i1")
    const entry = useStore.getState().undoStack[0]
    expect(Object.keys(entry.listItemsBefore)).toEqual(["i2"])
  })
})

describe("deleteWidget leaves lists and items intact", () => {
  it("deleting a todo widget does not touch its backing list or items", () => {
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["w1", "todo1"], createdAt: 0, updatedAt: 0 }],
      widgets: { w1: makeWidget("w1"), todo1: makeTodoWidget("todo1", "l1") },
      lists: { l1: makeList("l1") },
      listItems: { i1: makeListItem("i1", "l1") },
    })
    useStore.getState().deleteWidget("s1", "todo1")
    const state = useStore.getState()
    expect(state.widgets.todo1).toBeUndefined()
    expect(state.lists.l1).toBeDefined()
    expect(state.listItems.i1).toBeDefined()
  })
})

describe("duplicateWidget forks a todo widget's list", () => {
  it("creates a new list + copied items, independent of the source", () => {
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["todo1"], createdAt: 0, updatedAt: 0 }],
      widgets: { todo1: makeTodoWidget("todo1", "l1", { title: "My List" }) },
      lists: { l1: makeList("l1", { name: "My List" }) },
      listItems: { i1: makeListItem("i1", "l1", { text: "shared?", order: "a" }) },
    })
    useStore.getState().duplicateWidget("s1", "todo1")
    const state = useStore.getState()
    const newWidgetId = state.sheets[0].widgetOrder.find((id) => id !== "todo1")!
    const newWidget = state.widgets[newWidgetId]
    const newListId = (newWidget.data as { view: { source: { listId: string } } }).view.source.listId

    expect(newListId).not.toBe("l1")
    expect(state.lists[newListId]).toBeDefined()

    const newItems = Object.values(state.listItems).filter((i) => i.listId === newListId)
    expect(newItems).toHaveLength(1)
    expect(newItems[0].text).toBe("shared?")
    expect(newItems[0].id).not.toBe("i1")

    // editing the copy must not affect the original
    useStore.getState().updateListItem(newItems[0].id, { text: "edited copy" })
    expect(useStore.getState().listItems.i1.text).toBe("shared?")
  })
})

describe("duplicateWidgetsAt (cmd+D) forks a todo widget's list", () => {
  it("clone points at a fresh list, original list untouched", () => {
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["todo1"], createdAt: 0, updatedAt: 0 }],
      widgets: { todo1: makeTodoWidget("todo1", "l1", { title: "My List" }) },
      lists: { l1: makeList("l1", { name: "My List" }) },
      listItems: { i1: makeListItem("i1", "l1") },
    })
    const [cloneId] = useStore.getState().duplicateWidgetsAt("s1", ["todo1"])
    const state = useStore.getState()
    const cloneListId = (state.widgets[cloneId].data as { view: { source: { listId: string } } }).view.source.listId
    expect(cloneListId).not.toBe("l1")
    expect(Object.values(state.listItems).filter((i) => i.listId === cloneListId)).toHaveLength(1)
  })
})

describe("copyWidgets / pasteWidgets forks a todo widget's list", () => {
  it("paste creates an independent list + items snapshot from the source", () => {
    useStore.setState({
      widgets: { w1: makeTodoWidget("w1", "l1", { title: "My List" }) },
      lists: { l1: makeList("l1", { name: "My List" }) },
      listItems: {
        i1: makeListItem("i1", "l1", { text: "one", order: "a", status: "done", tags: ["x"] }),
        i2: makeListItem("i2", "l1", { text: "two", order: "b" }),
      },
    })
    useStore.getState().copyWidgets("s1", ["w1"])
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pastedId = state.selectedWidgetIds[0]
    const pastedListId = (state.widgets[pastedId].data as { view: { source: { listId: string } } }).view.source.listId

    expect(pastedListId).not.toBe("l1")
    const pastedItems = Object.values(state.listItems)
      .filter((i) => i.listId === pastedListId)
      .sort((a, b) => (a.order < b.order ? -1 : 1))
    expect(pastedItems.map((i) => i.text)).toEqual(["one", "two"])
    expect(pastedItems[0].status).toBe("done")
    expect(pastedItems[0].tags).toEqual(["x"])

    // original list untouched
    expect(Object.values(state.listItems).filter((i) => i.listId === "l1")).toHaveLength(2)
  })

  it("pastes cleanly from a legacy clipboard entry carrying data.items", () => {
    useStore.setState({
      clipboard: {
        widgets: [
          {
            type: WidgetType.Todo,
            title: "Old Todo",
            width: 280,
            height: 240,
            collapsed: false,
            x: 0,
            y: 0,
            data: {
              items: [
                { id: "legacy-1", text: "legacy item", done: true },
                { id: "legacy-2", text: "still open", status: "progress" },
              ],
            },
          },
        ],
        minX: 0,
        minY: 0,
      },
    })
    useStore.getState().pasteWidgets("s1")
    const state = useStore.getState()
    const pastedId = state.selectedWidgetIds[0]
    const pastedListId = (state.widgets[pastedId].data as { view: { source: { listId: string } } }).view.source.listId
    expect(state.lists[pastedListId]).toBeDefined()
    const pastedItems = Object.values(state.listItems).filter((i) => i.listId === pastedListId)
    expect(pastedItems).toHaveLength(2)
    expect(pastedItems.find((i) => i.text === "legacy item")?.status).toBe("done")
    expect(pastedItems.find((i) => i.text === "still open")?.status).toBe("progress")
  })
})

describe("migratePersistedState v6 -> v7 (todo items -> lists/listItems)", () => {
  it("hoists items covering all three statuses plus a legacy done:true item, preserves order, clears history stacks", () => {
    const persisted = {
      widgets: {
        todoA: makeTodoWidgetLegacy("todoA", "First List", [
          { id: "a1", text: "still todo", status: "todo" },
          { id: "a2", text: "in progress", status: "progress" },
          { id: "a3", text: "already done", status: "done" },
          { id: "a4", text: "legacy done flag", done: true },
        ]),
        todoB: makeTodoWidgetLegacy("todoB", "Empty List", []),
        note1: makeWidget("note1", { type: WidgetType.Note, data: { content: "hello" } }),
      },
      undoStack: [{ bogus: "pre-p1 shape" }],
      redoStack: [{ bogus: "pre-p1 shape" }],
    }

    const migrated = migratePersistedState(persisted, 6) as {
      widgets: Record<string, Widget>
      lists: Record<string, List>
      listItems: Record<string, ListItem>
      undoStack?: unknown
      redoStack?: unknown
    }

    // non-todo widget untouched
    expect(migrated.widgets.note1.data).toEqual({ content: "hello" })

    // stacks cleared
    expect(migrated.undoStack).toBeUndefined()
    expect(migrated.redoStack).toBeUndefined()

    // todoA hoisted to a list named after the widget title
    const listAId = (migrated.widgets.todoA.data as { view: { source: { listId: string } } }).view.source.listId
    expect(migrated.lists[listAId].name).toBe("First List")

    const itemsA = Object.values(migrated.listItems)
      .filter((i) => i.listId === listAId)
      .sort((a, b) => (a.order < b.order ? -1 : 1))
    expect(itemsA.map((i) => i.text)).toEqual(["still todo", "in progress", "already done", "legacy done flag"])
    expect(itemsA.map((i) => i.status)).toEqual(["todo", "progress", "done", "done"])
    expect(itemsA[2].completedAt).toBeDefined()
    expect(itemsA[3].completedAt).toBeDefined()
    expect(itemsA[0].completedAt).toBeUndefined()
    expect(itemsA[1].completedAt).toBeUndefined()
    // order strictly increasing (sorted matches insertion order)
    for (let i = 1; i < itemsA.length; i++) {
      expect(itemsA[i].order > itemsA[i - 1].order).toBe(true)
    }
    // tags always [] from migration
    for (const item of itemsA) {
      expect(item.tags).toEqual([])
    }

    // todoB hoisted to an empty list
    const listBId = (migrated.widgets.todoB.data as { view: { source: { listId: string } } }).view.source.listId
    expect(migrated.lists[listBId].name).toBe("Empty List")
    expect(Object.values(migrated.listItems).filter((i) => i.listId === listBId)).toHaveLength(0)
  })

  function makeTodoWidgetLegacy(
    id: string,
    title: string,
    items: { id: string; text: string; done?: boolean; status?: string }[]
  ): Widget {
    return makeWidget(id, { type: WidgetType.Todo, title, data: { items } })
  }
})
