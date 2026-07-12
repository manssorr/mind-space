import { describe, expect, it } from "vitest"
import { neighborsForDrop } from "@/lib/list-reorder"

describe("neighborsForDrop", () => {
  const ids = ["a", "b", "c", "d"]

  it("drop before the first item -> no beforeId", () => {
    const result = neighborsForDrop(ids, "d", { id: "a", position: "before" })
    expect(result).toEqual({ beforeId: null, afterId: "a" })
  })

  it("drop after the last item -> no afterId", () => {
    const result = neighborsForDrop(ids, "a", { id: "d", position: "after" })
    expect(result).toEqual({ beforeId: "d", afterId: null })
  })

  it("drop between two items", () => {
    const result = neighborsForDrop(ids, "d", { id: "b", position: "after" })
    expect(result).toEqual({ beforeId: "b", afterId: "c" })
  })

  it("drop before target equals drop after target's predecessor", () => {
    const before = neighborsForDrop(ids, "a", { id: "c", position: "before" })
    const after = neighborsForDrop(ids, "a", { id: "b", position: "after" })
    expect(before).toEqual(after)
  })

  it("returns null when target is the dragged item itself", () => {
    const result = neighborsForDrop(ids, "b", { id: "b", position: "after" })
    expect(result).toBeNull()
  })

  it("returns null when target id is not in the list", () => {
    const result = neighborsForDrop(ids, "a", { id: "missing", position: "after" })
    expect(result).toBeNull()
  })

  it("excludes the dragged item from index calculation", () => {
    // dragging "b" (index 1) to after "d" (last) should give beforeId "d", afterId null
    const result = neighborsForDrop(ids, "b", { id: "d", position: "after" })
    expect(result).toEqual({ beforeId: "d", afterId: null })
  })

  it("dragging the second item to before the first", () => {
    const result = neighborsForDrop(ids, "b", { id: "a", position: "before" })
    expect(result).toEqual({ beforeId: null, afterId: "a" })
  })
})
