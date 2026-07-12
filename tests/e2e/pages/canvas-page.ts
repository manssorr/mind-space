import type { Locator, Page } from "@playwright/test"

export class CanvasPage {
  readonly page: Page
  readonly addWidgetButton: Locator
  readonly widgets: Locator
  readonly newSheetButton: Locator

  constructor(page: Page) {
    this.page = page
    this.addWidgetButton = page.getByRole("button", { name: "Add widget", exact: true })
    // The [data-widget] wrapper is zero-size (the card inside is absolutely
    // positioned), so target the card div - it has real geometry.
    this.widgets = page.locator("[data-widget] > div")
    this.newSheetButton = page.getByRole("button", { name: "New Sheet", exact: true })
  }

  async goto() {
    await this.page.goto("/app")
    // First visit seeds a default sheet (Welcome note, Getting Started todo,
    // Quick Links) after rehydration; wait for it rather than networkidle.
    await this.widgets.first().waitFor({ state: "visible" })
  }

  widget(titleText: string): Locator {
    return this.widgets.filter({ hasText: titleText })
  }

  dragHandle(widget: Locator): Locator {
    // BaseWidget's title bar is the drag surface.
    return widget.locator("div.cursor-grab").first()
  }

  async addWidget(menuLabel: string) {
    await this.addWidgetButton.click()
    await this.page.getByRole("button", { name: menuLabel, exact: true }).click()
  }

  async dragWidgetBy(widget: Locator, dx: number, dy: number) {
    const handle = this.dragHandle(widget)
    const box = await handle.boundingBox()
    if (!box) throw new Error("drag handle not visible")
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await this.page.mouse.down()
    // Two moves: the app latches drag state on the first pointermove.
    await this.page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2 + dy / 2)
    await this.page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
    await this.page.mouse.up()
  }

  async persistedState(): Promise<Record<string, unknown>> {
    // Writes are debounced 300 ms; wait past the window before reading.
    await this.page.waitForTimeout(500)
    return this.page.evaluate(() => {
      const raw = localStorage.getItem("mind-space-store")
      return raw ? JSON.parse(raw).state : null
    })
  }

  async undo() {
    await this.page.keyboard.press("ControlOrMeta+z")
  }
}
