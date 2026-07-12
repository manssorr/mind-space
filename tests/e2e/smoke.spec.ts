import { expect, test } from "@playwright/test"
import { CanvasPage } from "./pages/canvas-page"

test.describe("Mind Space smoke", () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test("first visit seeds the default sheet", async ({ page }) => {
    await expect(canvas.widgets).toHaveCount(3)
    await expect(canvas.widget("Welcome!")).toBeVisible()
    await expect(canvas.widget("Getting Started")).toBeVisible()
    await expect(canvas.widget("Quick Links")).toBeVisible()
    await expect(page.getByText("Sheet 1").first()).toBeVisible()
  })

  test("add widget from the plus menu", async () => {
    await canvas.addWidget("Counter")
    await expect(canvas.widgets).toHaveCount(4)
    await expect(canvas.widget("Counter")).toBeVisible()

    const state = await canvas.persistedState()
    const types = Object.values(state.widgets as Record<string, { type: string }>).map((w) => w.type)
    expect(types).toContain("counter")
  })

  test("undo removes a just-added widget", async () => {
    await canvas.addWidget("Timer")
    await expect(canvas.widgets).toHaveCount(4)
    await canvas.undo()
    await expect(canvas.widgets).toHaveCount(3)
  })

  test("dragging a widget moves and persists its position", async () => {
    const note = canvas.widget("Welcome!")
    const before = await note.boundingBox()
    await canvas.dragWidgetBy(note, 120, 80)
    const after = await note.boundingBox()
    expect(after!.x).toBeGreaterThan(before!.x + 60)
    expect(after!.y).toBeGreaterThan(before!.y + 40)

    const state = await canvas.persistedState()
    const widgets = Object.values(state.widgets as Record<string, { type: string; x: number }>)
    const persistedNote = widgets.find((w) => w.type === "note")
    expect(persistedNote!.x).toBeGreaterThan(150)
  })

  test("note edits survive a reload", async ({ page }) => {
    const textarea = canvas.widget("Welcome!").locator("textarea")
    await textarea.fill("persistence check 42")
    // Note save debounce (400 ms) + storage debounce (300 ms).
    await page.waitForTimeout(1000)
    await page.reload()
    await canvas.widgets.first().waitFor({ state: "visible" })
    await expect(canvas.widget("Welcome!").locator("textarea")).toHaveValue("persistence check 42")
  })

  test("new sheet starts empty and tab switching works", async ({ page }) => {
    // New Sheet creates a tab but does not auto-switch to it (the store keeps
    // the current sheet). Switch by clicking the new tab, then back.
    await canvas.newSheetButton.click()
    await expect(page.getByText("Sheet 2")).toBeVisible()
    await page.getByText("Sheet 2").click()
    await expect(page.getByText("Canvas is empty")).toBeVisible()
    await expect(canvas.widgets).toHaveCount(0)
    await page.getByText("Sheet 1").click()
    await expect(canvas.widgets).toHaveCount(3)
  })

  test("zoom controls change the zoom level readout", async ({ page }) => {
    await expect(page.getByText("100%")).toBeVisible()
    await page.getByRole("button", { name: "Zoom in" }).click()
    await expect(page.getByText("140%")).toBeVisible()
    await page.getByRole("button", { name: "Reset zoom" }).click()
    await expect(page.getByText("100%")).toBeVisible()
  })
})
