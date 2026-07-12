import type { List, ListItem, Sheet, Widget } from "@/types"

export interface HistoryTrio {
  sheets: Sheet[]
  widgets: Record<string, Widget>
  currentSheetId: string | null
  lists: Record<string, List>
  listItems: Record<string, ListItem>
}

export interface HistoryEntry {
  widgetsBefore: Record<string, Widget | null>
  sheetsBefore: Sheet[] | null
  currentSheetIdBefore: string | null | undefined
  listsBefore: Record<string, List | null>
  listItemsBefore: Record<string, ListItem | null>
}

/**
 * Diffs one entity collection (keyed record) by reference: for every key
 * present in prev whose value changed (or is gone in next), records the
 * prior value (or null for a removal); for every key newly present in next,
 * records a null tombstone. Shared by widgets/lists/listItems - same shape.
 */
function diffCollection<T>(prev: Record<string, T>, next: Record<string, T>): { before: Record<string, T | null>; changed: boolean } {
  const before: Record<string, T | null> = {}
  let changed = false

  for (const id of Object.keys(prev)) {
    if (prev[id] !== next[id]) {
      before[id] = prev[id]
      changed = true
    }
  }
  for (const id of Object.keys(next)) {
    if (!(id in prev)) {
      before[id] = null
      changed = true
    }
  }

  return { before, changed }
}

/**
 * Applies a collection diff (as produced by diffCollection) to `current`,
 * restoring prior values / deleting tombstoned keys, and returns the
 * restored collection plus a mirror diff that reverses the application.
 */
function applyCollection<T>(
  current: Record<string, T>,
  before: Record<string, T | null>
): { restored: Record<string, T>; mirrorBefore: Record<string, T | null> } {
  const mirrorBefore: Record<string, T | null> = {}
  const restored = { ...current }

  for (const [id, priorValue] of Object.entries(before)) {
    mirrorBefore[id] = restored[id] ?? null
    if (priorValue === null) {
      delete restored[id]
    } else {
      restored[id] = priorValue
    }
  }

  return { restored, mirrorBefore }
}

/**
 * Compares prev/next trios by reference (store updates are immutable
 * spreads, so reference inequality means changed) and records only what
 * is needed to restore prev. Returns null when nothing history-relevant
 * changed.
 */
export function diffForHistory(prev: HistoryTrio, next: HistoryTrio): HistoryEntry | null {
  const widgetsDiff = diffCollection(prev.widgets, next.widgets)
  const listsDiff = diffCollection(prev.lists, next.lists)
  const listItemsDiff = diffCollection(prev.listItems, next.listItems)

  const sheetsChanged = prev.sheets !== next.sheets
  const currentSheetIdChanged = prev.currentSheetId !== next.currentSheetId

  if (!widgetsDiff.changed && !listsDiff.changed && !listItemsDiff.changed && !sheetsChanged && !currentSheetIdChanged) {
    return null
  }

  return {
    widgetsBefore: widgetsDiff.before,
    sheetsBefore: sheetsChanged ? prev.sheets : null,
    currentSheetIdBefore: currentSheetIdChanged ? prev.currentSheetId : undefined,
    listsBefore: listsDiff.before,
    listItemsBefore: listItemsDiff.before,
  }
}

/**
 * Applies a history entry to `state`, restoring the prior values it
 * captured. Returns the restored trio plus a mirror entry that reverses
 * the application (i.e. redoing after an undo, or undoing after a redo).
 */
export function applyHistoryEntry(
  state: HistoryTrio,
  entry: HistoryEntry
): { restored: HistoryTrio; mirror: HistoryEntry } {
  const widgetsResult = applyCollection(state.widgets, entry.widgetsBefore)
  const listsResult = applyCollection(state.lists, entry.listsBefore)
  const listItemsResult = applyCollection(state.listItems, entry.listItemsBefore)

  const sheets = entry.sheetsBefore !== null ? entry.sheetsBefore : state.sheets
  const currentSheetId =
    entry.currentSheetIdBefore !== undefined ? entry.currentSheetIdBefore : state.currentSheetId

  const mirror: HistoryEntry = {
    widgetsBefore: widgetsResult.mirrorBefore,
    sheetsBefore: entry.sheetsBefore !== null ? state.sheets : null,
    currentSheetIdBefore: entry.currentSheetIdBefore !== undefined ? state.currentSheetId : undefined,
    listsBefore: listsResult.mirrorBefore,
    listItemsBefore: listItemsResult.mirrorBefore,
  }

  return {
    restored: {
      sheets,
      widgets: widgetsResult.restored,
      currentSheetId,
      lists: listsResult.restored,
      listItems: listItemsResult.restored,
    },
    mirror,
  }
}

/**
 * Type guard for entries coming out of persisted storage - guards
 * against malformed/legacy blobs the same way the old JSON.parse
 * try/catch did.
 */
export function isValidHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.widgetsBefore !== "object" || entry.widgetsBefore === null) return false
  if (typeof entry.listsBefore !== "object" || entry.listsBefore === null) return false
  if (typeof entry.listItemsBefore !== "object" || entry.listItemsBefore === null) return false
  if (entry.sheetsBefore !== null && !Array.isArray(entry.sheetsBefore)) return false
  if (
    entry.currentSheetIdBefore !== undefined &&
    entry.currentSheetIdBefore !== null &&
    typeof entry.currentSheetIdBefore !== "string"
  ) {
    return false
  }
  return true
}
