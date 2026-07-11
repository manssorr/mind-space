import type { SelectionBox } from "@/types"

// Strict AABB overlap: touching edges (e.g. a.x + a.width === b.x) do NOT
// count as intersecting, since widgets are unrotated rects placed edge to
// edge routinely and shouldn't marquee-select each other from a shared edge.
export function rectsIntersect(a: SelectionBox, b: SelectionBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function quantize(value: number, grid: number): number {
  return Math.round(value / grid) * grid
}
