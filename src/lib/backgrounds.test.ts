import { describe, expect, it } from "vitest"
import { resolveBackgroundColor, BACKGROUND_PRESETS } from "@/lib/backgrounds"

describe("resolveBackgroundColor", () => {
  it("resolves the light color for a known preset", () => {
    expect(resolveBackgroundColor("ocean", false)).toBe("hsl(200 35% 93%)")
  })

  it("resolves the dark color for a known preset", () => {
    expect(resolveBackgroundColor("ocean", true)).toBe("hsl(205 30% 10%)")
  })

  it("falls back to the default preset for an unknown id", () => {
    const fallback = BACKGROUND_PRESETS[0]
    expect(resolveBackgroundColor("not-a-real-preset", false)).toBe(fallback.light)
    expect(resolveBackgroundColor("not-a-real-preset", true)).toBe(fallback.dark)
  })
})
