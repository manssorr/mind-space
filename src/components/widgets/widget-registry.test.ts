import { describe, expect, it } from "vitest"
import { WidgetType } from "@/types"
import { WIDGET_DEFS, widgetComponents } from "./widget-registry"

describe("WIDGET_DEFS", () => {
  it("has an entry for every WidgetType enum member", () => {
    expect(Object.values(WidgetType).every((t) => WIDGET_DEFS[t] !== undefined)).toBe(true)
  })

  it("has exactly 9 widget types", () => {
    expect(Object.values(WidgetType).length).toBe(9)
  })

  it("every def has a non-empty label, defaultTitle, a component, and a positive defaultSize", () => {
    for (const def of Object.values(WIDGET_DEFS)) {
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.defaultTitle.length).toBeGreaterThan(0)
      expect(def.component).toBeTruthy()
      expect(def.defaultSize.width).toBeGreaterThan(0)
      expect(def.defaultSize.height).toBeGreaterThan(0)
    }
  })

  it("derives widgetComponents from WIDGET_DEFS", () => {
    expect(widgetComponents[WidgetType.Note]).toBeDefined()
  })

  it("preserves the habit special case", () => {
    const habit = WIDGET_DEFS[WidgetType.Habit]
    expect(habit.defaultSize.height).toBe(340)
    expect(habit.defaultTitle).toBe("Coding Habit")
  })
})
