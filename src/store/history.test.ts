import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useStore, flushPendingWrites, __resetPendingSnapshotForTests } from "@/store"
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

afterEach(() => {
  __resetPendingSnapshotForTests()
})

describe("recordSnapshot + moveWidget (drag) two-phase materialization", () => {
  it("recordSnapshot alone pushes nothing; the first moveWidget after it materializes one entry", () => {
    useStore.getState().recordSnapshot()
    expect(useStore.getState().undoStack).toHaveLength(0)

    useStore.getState().moveWidget("w1", 10, 20)
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(20)
    expect(state.widgets.w1.y).toBe(20)
    expect(state.undoStack).toHaveLength(1)
  })

  it("subsequent moveWidget calls in the same drag push nothing more (matches old drag-end-only history)", () => {
    useStore.getState().recordSnapshot()
    useStore.getState().moveWidget("w1", 10, 20)
    useStore.getState().moveWidget("w1", 15, 25)
    useStore.getState().moveWidget("w1", 20, 30)
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(20)
    expect(state.undoStack).toHaveLength(1)
  })

  it("undo after a recorded drag restores the pre-drag position", () => {
    useStore.getState().recordSnapshot()
    useStore.getState().moveWidget("w1", 10, 20)
    useStore.getState().moveWidget("w1", 50, 60)

    useStore.getState().undo()
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(0)
    expect(state.widgets.w1.y).toBe(0)
  })

  it("moveWidget without a preceding recordSnapshot still pushes nothing (case 5 preserved)", () => {
    useStore.getState().moveWidget("w1", 10, 20)
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(20)
    expect(state.undoStack).toHaveLength(0)
  })

  it("resizeWidget without a preceding recordSnapshot still pushes nothing (case 6 preserved)", () => {
    useStore.getState().resizeWidget("w1", 200, 300)
    const state = useStore.getState()
    expect(state.widgets.w1.width).toBe(200)
    expect(state.undoStack).toHaveLength(0)
  })

  it("recordSnapshot + resizeWidget materializes one entry and undo restores prior size", () => {
    useStore.getState().recordSnapshot()
    useStore.getState().resizeWidget("w1", 200, 300)
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().undo()
    const state = useStore.getState()
    expect(state.widgets.w1.width).toBe(100)
    expect(state.widgets.w1.height).toBe(100)
  })

  it("recordSnapshot + moveWidget + resizeWidget (combined drag-resize) materializes exactly one entry", () => {
    // use-widget-resize.ts calls moveWidget then resizeWidget on every move;
    // only the first mutation after recordSnapshot should push.
    useStore.getState().recordSnapshot()
    useStore.getState().moveWidget("w1", 5, 5)
    useStore.getState().resizeWidget("w1", 150, 150)
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().undo()
    const state = useStore.getState()
    expect(state.widgets.w1.x).toBe(0)
    expect(state.widgets.w1.width).toBe(100)
  })
})

describe("undo/redo round trip (identity property)", () => {
  it("mutate -> snapshot -> mutate -> undo restores prior state -> redo restores post state (deep-equal both ways)", () => {
    const initial = useStore.getState()
    const initialWidget = initial.widgets.w1

    useStore.getState().updateWidget("w1", { title: "first edit", x: 42 })
    const afterFirstEdit = useStore.getState().widgets.w1

    useStore.getState().updateWidget("w1", { title: "second edit", y: 99 })
    const afterSecondEdit = useStore.getState().widgets.w1

    expect(useStore.getState().undoStack).toHaveLength(2)

    useStore.getState().undo()
    let state = useStore.getState()
    expect(state.widgets.w1).toEqual(afterFirstEdit)
    expect(state.undoStack).toHaveLength(1)
    expect(state.redoStack).toHaveLength(1)

    useStore.getState().undo()
    state = useStore.getState()
    expect(state.widgets.w1).toEqual(initialWidget)
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(2)

    useStore.getState().redo()
    state = useStore.getState()
    expect(state.widgets.w1).toEqual(afterFirstEdit)

    useStore.getState().redo()
    state = useStore.getState()
    expect(state.widgets.w1).toEqual(afterSecondEdit)
    expect(state.undoStack).toHaveLength(2)
    expect(state.redoStack).toHaveLength(0)
  })

  it("undo(undo(x)) via redo is identity for a widget delete + add sequence", () => {
    const before = useStore.getState()
    const beforeWidgets = before.widgets
    const beforeSheets = before.sheets

    useStore.getState().deleteWidget("s1", "w1")
    expect(useStore.getState().widgets.w1).toBeUndefined()

    useStore.getState().addWidget("s1", makeWidget("w2"))
    const afterAdd = useStore.getState()

    useStore.getState().undo()
    useStore.getState().undo()
    const restored = useStore.getState()
    expect(restored.widgets).toEqual(beforeWidgets)
    expect(restored.sheets).toEqual(beforeSheets)

    useStore.getState().redo()
    useStore.getState().redo()
    const redone = useStore.getState()
    expect(redone.widgets).toEqual(afterAdd.widgets)
    expect(redone.sheets).toEqual(afterAdd.sheets)
  })
})

describe("corrupt persisted entry guard", () => {
  it("undo drops a malformed top-of-stack entry instead of throwing", () => {
    useStore.setState({ undoStack: [{ bogus: true } as never] })
    expect(() => useStore.getState().undo()).not.toThrow()
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  it("redo drops a malformed top-of-stack entry instead of throwing", () => {
    useStore.setState({ redoStack: [{ bogus: true } as never] })
    expect(() => useStore.getState().redo()).not.toThrow()
    expect(useStore.getState().redoStack).toHaveLength(0)
  })
})

describe("size proof: delta entries stay small under repeated single-widget edits", () => {
  it("50 single-widget edits across 10 widgets with ~1KB notes keep persisted undoStack under 100KB", () => {
    const bigContent = "x".repeat(1024)
    const widgets: Record<string, Widget> = {}
    for (let i = 0; i < 10; i++) {
      widgets[`w${i}`] = makeWidget(`w${i}`, { data: { content: bigContent } })
    }
    useStore.setState({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: Object.keys(widgets), createdAt: 0, updatedAt: 0 }],
      widgets,
      undoStack: [],
      redoStack: [],
    })

    for (let i = 0; i < 50; i++) {
      const id = `w${i % 10}`
      useStore.getState().updateWidget(id, { title: `edit ${i}` })
    }

    const persistedUndoStack = useStore.getState().undoStack
    expect(persistedUndoStack).toHaveLength(50)

    const serialized = JSON.stringify(persistedUndoStack)
    expect(serialized.length).toBeLessThan(100 * 1024)

    // No entry should carry a full-state snapshot (i.e. more than one
    // widget's worth of ~1KB content) - each entry is one widget's prior
    // value, not the whole trio.
    for (const entry of persistedUndoStack) {
      const widgetIds = Object.keys(entry.widgetsBefore)
      expect(widgetIds.length).toBeLessThanOrEqual(1)
    }
  })
})

describe("reload survival", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("undo history survives a debounced persist + rehydrate cycle", async () => {
    useStore.getState().updateWidget("w1", { title: "before reload edit" })
    expect(useStore.getState().undoStack).toHaveLength(1)

    // flush the 300ms debounced localStorage write
    vi.advanceTimersByTime(350)
    flushPendingWrites()

    const persistedRaw = localStorage.getItem("mind-space-store")
    expect(persistedRaw).toBeTruthy()
    const persisted = JSON.parse(persistedRaw!)
    expect(persisted.state.undoStack).toHaveLength(1)

    // simulate a fresh load: reset in-memory state, then rehydrate from
    // the same localStorage the debounced write landed in.
    useStore.setState({ undoStack: [], redoStack: [], widgets: { w1: makeWidget("w1", { title: "wiped" }) } })
    await useStore.persist.rehydrate()

    const rehydrated = useStore.getState()
    expect(rehydrated.undoStack).toHaveLength(1)
    expect(rehydrated.widgets.w1.title).toBe("before reload edit")

    rehydrated.undo()
    expect(useStore.getState().widgets.w1.title).toBe("w")
  })
})
