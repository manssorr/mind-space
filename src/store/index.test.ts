import { beforeEach, describe, expect, it } from "vitest"
import { useStore, migratePersistedState, __resetPendingSnapshotForTests } from "@/store"
import { WidgetType, type Widget } from "@/types"

function makeWidget(id: string, overrides: Partial<Widget> = {}): Widget {
  return {
    id, type: WidgetType.Note, title: "w", x: 0, y: 0,
    width: 100, height: 100, zIndex: 1, collapsed: false, data: {},
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  __resetPendingSnapshotForTests()
  useStore.setState({
    sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["w1"], createdAt: 0, updatedAt: 0 }],
    currentSheetId: "s1",
    widgets: { w1: makeWidget("w1") },
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
})
