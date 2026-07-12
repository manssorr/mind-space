export interface DropTarget {
  id: string
  position: "before" | "after"
}

/**
 * Given the ordered active item ids, the id being dragged, and a drop target
 * (item id + before/after), returns the neighbor ids to pass to
 * moveListItem(id, beforeId, afterId). Drop target referring to the dragged
 * item itself is not a valid move (returns null).
 */
export function neighborsForDrop(
  orderedIds: string[],
  draggingId: string,
  target: DropTarget
): { beforeId: string | null; afterId: string | null } | null {
  if (target.id === draggingId) return null

  const withoutDragging = orderedIds.filter((id) => id !== draggingId)
  const targetIndex = withoutDragging.indexOf(target.id)
  if (targetIndex === -1) return null

  const insertIndex = target.position === "before" ? targetIndex : targetIndex + 1

  return {
    beforeId: insertIndex > 0 ? withoutDragging[insertIndex - 1] : null,
    afterId: insertIndex < withoutDragging.length ? withoutDragging[insertIndex] : null,
  }
}
