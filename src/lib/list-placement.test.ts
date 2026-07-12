import { describe, expect, it } from "vitest"
import { WidgetType, type Sheet, type Widget } from "@/types"
import { buildListPlacementMap, formatPlacementBadge } from "@/lib/list-placement"

function makeSheet(overrides: Partial<Sheet>): Sheet {
  return {
    id: "sheet-a",
    title: "Sheet A",
    widgetOrder: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeTodoWidget(id: string, listId: string): Widget {
  return {
    id,
    type: WidgetType.Todo,
    title: "Todo List",
    x: 0,
    y: 0,
    width: 280,
    height: 240,
    zIndex: 0,
    collapsed: false,
    data: { view: { source: { listId } } },
  }
}

describe("buildListPlacementMap", () => {
  it("maps a list with one bound widget to that sheet's title", () => {
    const sheets = [makeSheet({ id: "s1", title: "Sheet A", widgetOrder: ["w1"] })]
    const widgets = { w1: makeTodoWidget("w1", "list-1") }

    const map = buildListPlacementMap(sheets, widgets)

    expect(map.get("list-1")).toEqual({ sheetTitle: "Sheet A", count: 1 })
  })

  it("a list with no widget has no entry", () => {
    const sheets = [makeSheet({ id: "s1", title: "Sheet A", widgetOrder: [] })]
    const map = buildListPlacementMap(sheets, {})

    expect(map.get("list-1")).toBeUndefined()
  })

  it("a list bound to multiple widgets counts all of them, keeping the first sheet", () => {
    const sheets = [
      makeSheet({ id: "s1", title: "Sheet A", widgetOrder: ["w1"] }),
      makeSheet({ id: "s2", title: "Sheet B", widgetOrder: ["w2"] }),
    ]
    const widgets = {
      w1: makeTodoWidget("w1", "list-1"),
      w2: makeTodoWidget("w2", "list-1"),
    }

    const map = buildListPlacementMap(sheets, widgets)

    expect(map.get("list-1")).toEqual({ sheetTitle: "Sheet A", count: 2 })
  })

  it("ignores non-todo widgets and widgets without a valid source", () => {
    const sheets = [makeSheet({ id: "s1", title: "Sheet A", widgetOrder: ["w1", "w2"] })]
    const widgets: Record<string, Widget> = {
      w1: { ...makeTodoWidget("w1", "list-1"), type: WidgetType.Note, data: {} },
      w2: makeTodoWidget("w2", "list-2"),
    }

    const map = buildListPlacementMap(sheets, widgets)

    expect(map.has("list-1")).toBe(false)
    expect(map.get("list-2")).toEqual({ sheetTitle: "Sheet A", count: 1 })
  })
})

describe("formatPlacementBadge", () => {
  it("returns Unplaced when there is no placement", () => {
    expect(formatPlacementBadge(undefined)).toBe("Unplaced")
  })

  it("returns the sheet title alone for a single placement", () => {
    expect(formatPlacementBadge({ sheetTitle: "Sheet A", count: 1 })).toBe("Sheet A")
  })

  it("appends a +N suffix for multiple placements", () => {
    expect(formatPlacementBadge({ sheetTitle: "Sheet A", count: 3 })).toBe("Sheet A +2")
  })
})
