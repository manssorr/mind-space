import { describe, expect, it } from "vitest"
import { applyHistoryEntry, diffForHistory, isValidHistoryEntry, type HistoryTrio } from "@/lib/history-diff"
import { WidgetType, type Widget, type List, type ListItem } from "@/types"

function makeWidget(id: string, overrides: Partial<Widget> = {}): Widget {
  return {
    id, type: WidgetType.Note, title: "w", x: 0, y: 0,
    width: 100, height: 100, zIndex: 1, collapsed: false, data: {},
    ...overrides,
  }
}

function makeList(id: string, overrides: Partial<List> = {}): List {
  return { id, name: "My List", createdAt: 0, ...overrides }
}

function makeListItem(id: string, overrides: Partial<ListItem> = {}): ListItem {
  return {
    id, listId: "l1", text: "item", status: "todo", order: "m", tags: [], createdAt: 0,
    ...overrides,
  }
}

function makeTrio(overrides: Partial<HistoryTrio> = {}): HistoryTrio {
  return {
    sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["w1"], createdAt: 0, updatedAt: 0 }],
    widgets: { w1: makeWidget("w1") },
    currentSheetId: "s1",
    lists: {},
    listItems: {},
    ...overrides,
  }
}

describe("diffForHistory", () => {
  it("returns null when nothing changed", () => {
    const trio = makeTrio()
    expect(diffForHistory(trio, trio)).toBeNull()
  })

  it("records a single-widget edit", () => {
    const prev = makeTrio()
    const editedWidget = { ...prev.widgets.w1, title: "updated" }
    const next = makeTrio({ sheets: prev.sheets, widgets: { w1: editedWidget } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.widgetsBefore).toEqual({ w1: prev.widgets.w1 })
    expect(entry!.sheetsBefore).toBeNull()
    expect(entry!.currentSheetIdBefore).toBeUndefined()
  })

  it("records a widget add as a null tombstone", () => {
    const prev = makeTrio()
    const w2 = makeWidget("w2")
    const next = makeTrio({ widgets: { w1: prev.widgets.w1, w2 } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.widgetsBefore).toEqual({ w2: null })
  })

  it("records a widget delete with its prior value", () => {
    const prev = makeTrio({ widgets: { w1: makeWidget("w1"), w2: makeWidget("w2") } })
    const next = makeTrio({ sheets: prev.sheets, widgets: { w1: prev.widgets.w1 } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.widgetsBefore).toEqual({ w2: prev.widgets.w2 })
  })

  it("records a multi-widget paste as multiple tombstones", () => {
    const prev = makeTrio()
    const w2 = makeWidget("w2")
    const w3 = makeWidget("w3")
    const next = makeTrio({ widgets: { w1: prev.widgets.w1, w2, w3 } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.widgetsBefore).toEqual({ w2: null, w3: null })
  })

  it("records sheet reorder via sheetsBefore", () => {
    const prev = makeTrio({
      sheets: [
        { id: "s1", title: "Sheet 1", widgetOrder: [], createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Sheet 2", widgetOrder: [], createdAt: 0, updatedAt: 0 },
      ],
      widgets: {},
    })
    const next = makeTrio({ sheets: [...prev.sheets].reverse(), widgets: prev.widgets })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.sheetsBefore).toBe(prev.sheets)
    expect(entry!.widgetsBefore).toEqual({})
  })

  it("records currentSheetId change", () => {
    const prev = makeTrio({ currentSheetId: "s1" })
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, currentSheetId: "s2" })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.currentSheetIdBefore).toBe("s1")
    expect(entry!.sheetsBefore).toBeNull()
    expect(entry!.widgetsBefore).toEqual({})
  })

  it("records a list add as a null tombstone", () => {
    const prev = makeTrio()
    const l1 = makeList("l1")
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: { l1 } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.listsBefore).toEqual({ l1: null })
    expect(entry!.listItemsBefore).toEqual({})
  })

  it("records a list rename with its prior value", () => {
    const prev = makeTrio({ lists: { l1: makeList("l1") } })
    const renamed = { ...prev.lists.l1, name: "renamed" }
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: { l1: renamed } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.listsBefore).toEqual({ l1: prev.lists.l1 })
  })

  it("records a list delete with its prior value (cascade)", () => {
    const prev = makeTrio({ lists: { l1: makeList("l1") } })
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: {} })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.listsBefore).toEqual({ l1: prev.lists.l1 })
  })

  it("records a listItem add, edit, and delete symmetrically with widgets", () => {
    const prev = makeTrio({ listItems: { i1: makeListItem("i1") } })
    const i2 = makeListItem("i2")
    const editedI1 = { ...prev.listItems.i1, text: "edited" }
    const next = makeTrio({
      sheets: prev.sheets,
      widgets: prev.widgets,
      listItems: { i1: editedI1, i2 },
    })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.listItemsBefore).toEqual({ i1: prev.listItems.i1, i2: null })
  })

  it("records a listItem status cycle (todo -> progress -> done) with completedAt tracked", () => {
    const prev = makeTrio({ listItems: { i1: makeListItem("i1", { status: "progress" }) } })
    const done = { ...prev.listItems.i1, status: "done" as const, completedAt: 123 }
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, listItems: { i1: done } })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()
    expect(entry!.listItemsBefore).toEqual({ i1: prev.listItems.i1 })
  })
})

describe("applyHistoryEntry apply+mirror round trip", () => {
  function roundTrip(prev: HistoryTrio, next: HistoryTrio) {
    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()

    // undo: apply entry to `next` -> should restore `prev`
    const undone = applyHistoryEntry(next, entry!)
    expect(undone.restored).toEqual(prev)

    // redo: apply the mirror to the undone state -> should restore `next`
    const redone = applyHistoryEntry(undone.restored, undone.mirror)
    expect(redone.restored).toEqual(next)

    return { undone, redone }
  }

  it("round-trips a single-widget edit", () => {
    const prev = makeTrio()
    const next = makeTrio({ sheets: prev.sheets, widgets: { w1: { ...prev.widgets.w1, title: "updated" } } })
    roundTrip(prev, next)
  })

  it("round-trips a widget add", () => {
    const prev = makeTrio()
    const w2 = makeWidget("w2")
    const next = makeTrio({ sheets: prev.sheets, widgets: { ...prev.widgets, w2 } })
    roundTrip(prev, next)
  })

  it("round-trips a widget delete", () => {
    const prev = makeTrio({ widgets: { w1: makeWidget("w1"), w2: makeWidget("w2") } })
    const next = makeTrio({ sheets: prev.sheets, widgets: { w1: prev.widgets.w1 } })
    roundTrip(prev, next)
  })

  it("round-trips a multi-widget paste", () => {
    const prev = makeTrio()
    const w2 = makeWidget("w2")
    const w3 = makeWidget("w3")
    const next = makeTrio({ sheets: prev.sheets, widgets: { ...prev.widgets, w2, w3 } })
    roundTrip(prev, next)
  })

  it("round-trips a sheet reorder", () => {
    const prev = makeTrio({
      sheets: [
        { id: "s1", title: "Sheet 1", widgetOrder: [], createdAt: 0, updatedAt: 0 },
        { id: "s2", title: "Sheet 2", widgetOrder: [], createdAt: 0, updatedAt: 0 },
      ],
    })
    const next = makeTrio({ sheets: [...prev.sheets].reverse() })
    roundTrip(prev, next)
  })

  it("round-trips a currentSheetId change", () => {
    const prev = makeTrio({ currentSheetId: "s1" })
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, currentSheetId: "s2" })
    roundTrip(prev, next)
  })

  it("round-trips a list add", () => {
    const prev = makeTrio()
    const l1 = makeList("l1")
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: { l1 } })
    roundTrip(prev, next)
  })

  it("round-trips a list rename", () => {
    const prev = makeTrio({ lists: { l1: makeList("l1") } })
    const next = makeTrio({
      sheets: prev.sheets,
      widgets: prev.widgets,
      lists: { l1: { ...prev.lists.l1, name: "renamed" } },
    })
    roundTrip(prev, next)
  })

  it("round-trips a list delete cascading its items", () => {
    const prev = makeTrio({
      lists: { l1: makeList("l1") },
      listItems: { i1: makeListItem("i1", { listId: "l1" }), i2: makeListItem("i2", { listId: "l1" }) },
    })
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: {}, listItems: {} })
    roundTrip(prev, next)
  })

  it("round-trips a listItem add", () => {
    const prev = makeTrio({ lists: { l1: makeList("l1") } })
    const i1 = makeListItem("i1")
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, lists: prev.lists, listItems: { i1 } })
    roundTrip(prev, next)
  })

  it("round-trips a listItem status cycle todo -> progress -> done -> todo", () => {
    const prev = makeTrio({ listItems: { i1: makeListItem("i1", { status: "todo" }) } })
    const toProgress = makeTrio({
      sheets: prev.sheets,
      widgets: prev.widgets,
      listItems: { i1: { ...prev.listItems.i1, status: "progress" } },
    })
    const toDone = makeTrio({
      sheets: prev.sheets,
      widgets: prev.widgets,
      listItems: { i1: { ...toProgress.listItems.i1, status: "done", completedAt: 999 } },
    })
    const backToTodo = makeTrio({
      sheets: prev.sheets,
      widgets: prev.widgets,
      listItems: { i1: { ...toDone.listItems.i1, status: "todo", completedAt: undefined } },
    })

    roundTrip(prev, toProgress)
    roundTrip(toProgress, toDone)
    roundTrip(toDone, backToTodo)
  })

  it("round-trips a listItem delete", () => {
    const prev = makeTrio({ listItems: { i1: makeListItem("i1"), i2: makeListItem("i2") } })
    const next = makeTrio({ sheets: prev.sheets, widgets: prev.widgets, listItems: { i1: prev.listItems.i1 } })
    roundTrip(prev, next)
  })

  it("undo then redo returns to identity for a combined multi-field change", () => {
    const prev = makeTrio({
      sheets: [{ id: "s1", title: "Sheet 1", widgetOrder: ["w1"], createdAt: 0, updatedAt: 0 }],
      currentSheetId: "s1",
      lists: { l1: makeList("l1") },
      listItems: { i1: makeListItem("i1") },
    })
    const w2 = makeWidget("w2")
    const l2 = makeList("l2")
    const next = makeTrio({
      sheets: [
        { id: "s1", title: "Sheet 1 renamed", widgetOrder: ["w1"], createdAt: 0, updatedAt: 1 },
      ],
      widgets: { w1: { ...prev.widgets.w1, title: "edited" }, w2 },
      currentSheetId: "s2",
      lists: { l1: prev.lists.l1, l2 },
      listItems: { i1: { ...prev.listItems.i1, status: "done", completedAt: 5 } },
    })

    const entry = diffForHistory(prev, next)
    expect(entry).not.toBeNull()

    const undone = applyHistoryEntry(next, entry!)
    expect(undone.restored).toEqual(prev)

    const redone = applyHistoryEntry(undone.restored, undone.mirror)
    expect(redone.restored).toEqual(next)
  })
})

describe("isValidHistoryEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(
      isValidHistoryEntry({
        widgetsBefore: {},
        sheetsBefore: null,
        currentSheetIdBefore: undefined,
        listsBefore: {},
        listItemsBefore: {},
      })
    ).toBe(true)
  })

  it("rejects malformed entries", () => {
    expect(isValidHistoryEntry(null)).toBe(false)
    expect(isValidHistoryEntry("legacy-json-string")).toBe(false)
    expect(isValidHistoryEntry({})).toBe(false)
    expect(
      isValidHistoryEntry({ widgetsBefore: {}, sheetsBefore: "not-array", listsBefore: {}, listItemsBefore: {} })
    ).toBe(false)
  })

  it("rejects a pre-P1 entry missing listsBefore/listItemsBefore instead of crashing (old undoStack entries dropped, not applied, across the v6->v7 migration)", () => {
    expect(
      isValidHistoryEntry({ widgetsBefore: {}, sheetsBefore: null, currentSheetIdBefore: undefined })
    ).toBe(false)
  })
})
