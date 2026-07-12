import { WidgetType, type Sheet, type Widget } from "@/types"

export interface ListPlacement {
  sheetTitle: string
  count: number
}

interface TodoSourceData {
  view?: { source?: { listId?: unknown } }
}

function todoListId(widget: Widget): string | null {
  if (widget.type !== WidgetType.Todo) return null
  const data = widget.data as TodoSourceData
  const listId = data.view?.source?.listId
  return typeof listId === "string" ? listId : null
}

/**
 * Maps each listId to where it is placed: the sheet title of the first
 * widget found bound to it (in sheet order, then widgetOrder), plus how
 * many widgets in total point at that list. A list with no bound widget
 * has no entry (caller renders "Unplaced"). Single pass over all widgets
 * across all sheets, meant to run once per hub render.
 */
export function buildListPlacementMap(
  sheets: Sheet[],
  widgets: Record<string, Widget>
): Map<string, ListPlacement> {
  const map = new Map<string, ListPlacement>()

  for (const sheet of sheets) {
    for (const widgetId of sheet.widgetOrder) {
      const widget = widgets[widgetId]
      if (!widget) continue
      const listId = todoListId(widget)
      if (!listId) continue

      const existing = map.get(listId)
      if (existing) {
        existing.count += 1
      } else {
        map.set(listId, { sheetTitle: sheet.title, count: 1 })
      }
    }
  }

  return map
}

/** Formats a placement into the hub's badge text, e.g. "A" or "A +2". */
export function formatPlacementBadge(placement: ListPlacement | undefined): string {
  if (!placement) return "Unplaced"
  if (placement.count <= 1) return placement.sheetTitle
  return `${placement.sheetTitle} +${placement.count - 1}`
}
