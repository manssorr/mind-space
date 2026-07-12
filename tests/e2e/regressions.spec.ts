import { expect, test } from "@playwright/test"
import { CanvasPage } from "./pages/canvas-page"

// Each spec below reproduces a bug that exists on main and is fixed by an
// open PR. They are marked fixme so the suite stays green on main; flip each
// to a live test when its PR merges.
//
//   #1 https://github.com/AhmedNasser1010/mind-space/pull/1  (quick-link crash)
//   #2 https://github.com/AhmedNasser1010/mind-space/pull/2  (persisted undo stacks)
//   #3 https://github.com/AhmedNasser1010/mind-space/pull/3  (month-boundary date keys)
//   #4 https://github.com/AhmedNasser1010/mind-space/pull/4  (undo wiped by timers)

test.describe("regressions", () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test("saving a malformed quick-link URL must not crash the app", async ({ page }) => {
    test.fixme(true, "Crashes on main; fixed by PR #1")
    await canvas.widget("Quick Links").hover()
    await page.getByRole("button", { name: "Edit URL" }).click()
    await page.getByPlaceholder("https://example.com").fill("http://")
    await page.keyboard.press("Enter")
    // App must keep rendering, show a fallback, and survive reload.
    await expect(canvas.widgets).toHaveCount(3)
    await expect(page.getByText("Invalid URL")).toBeVisible()
    await page.reload()
    await canvas.widgets.first().waitFor({ state: "visible" })
    await expect(canvas.widgets).toHaveCount(3)
  })

  test("a running stopwatch must not consume undo history", async ({ page }) => {
    test.fixme(true, "Undo stack fills with tick snapshots on main; fixed by PR #4 (with #2)")
    await canvas.addWidget("Stopwatch")
    const stopwatch = canvas.widget("Stopwatch")
    // Scope to the widget: the seeded "Getting Started" todo tab also matches
    // the accessible name "Start" by substring.
    await stopwatch.getByRole("button", { name: "Start", exact: true }).click()
    await page.waitForTimeout(3000)
    await stopwatch.getByRole("button", { name: "Stop", exact: true }).click()

    const note = canvas.widget("Welcome!")
    const before = await note.boundingBox()
    await canvas.dragWidgetBy(note, 120, 80)
    await canvas.undo()
    const after = await note.boundingBox()
    // A single undo right after a drag must restore the drag, not a tick.
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(2)
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2)
  })

  test("a completed timer shows 00:00 with the complete state", async ({ page }) => {
    test.fixme(true, "Tick-based countdown on main; fixed by PR #4")
    await canvas.addWidget("Timer")
    const timer = canvas.widget("Timer").first()
    await timer.locator("[title='Click to set duration']").click()
    await timer.locator("input[type='number']").fill("2")
    await page.keyboard.press("Enter")
    await timer.getByRole("button", { name: "Start", exact: true }).click()
    await expect(timer.locator(".text-4xl")).toContainText("00:00", { timeout: 5000 })
    await expect(timer.locator(".text-4xl")).toHaveClass(/text-destructive/)
  })

  test("January habit grid must not produce month-00 date keys", async ({ page }) => {
    test.fixme(true, "Filler cells keyed YYYY-00-DD on main; fixed by PR #3")
    await canvas.addWidget("Habit Tracker")
    const habit = canvas.widget("Coding Habit")
    // Navigate back to January of the current year.
    const monthHeading = /January \d{4}/
    for (let i = 0; i < 12; i++) {
      if (await habit.getByText(monthHeading).count()) break
      await habit.getByRole("button", { name: "Previous month" }).click()
    }
    await expect(habit.getByText(monthHeading)).toBeVisible()
    const invalidCells = habit.locator("button[aria-label*='-00-'], button[aria-label*='-13-']")
    await expect(invalidCells).toHaveCount(0)
  })
})
