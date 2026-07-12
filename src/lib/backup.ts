import type { Sheet, Widget } from "@/types"
import { PERSIST_VERSION } from "@/store"

export interface BackupFile {
  app: "mind-space"
  version: number
  exportedAt: string
  sheets: Sheet[]
  widgets: Record<string, Widget>
  currentSheetId: string | null
}

export function buildBackup(
  sheets: Sheet[],
  widgets: Record<string, Widget>,
  currentSheetId: string | null
): BackupFile {
  return {
    app: "mind-space",
    version: PERSIST_VERSION,
    exportedAt: new Date().toISOString(),
    sheets,
    widgets,
    currentSheetId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isValidSheet(value: unknown): value is Sheet {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.widgetOrder)
  )
}

function isValidWidget(value: unknown): value is Widget {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  )
}

export function parseBackup(raw: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("File is not valid JSON.")
  }

  if (!isRecord(parsed)) {
    throw new Error("Backup file must contain a JSON object.")
  }

  if (parsed.app !== "mind-space") {
    throw new Error("This file is not a Mind Space backup.")
  }

  if (typeof parsed.version !== "number" || parsed.version > PERSIST_VERSION) {
    throw new Error(
      "This backup was created by a newer version of Mind Space and cannot be imported."
    )
  }

  if (!Array.isArray(parsed.sheets) || !parsed.sheets.every(isValidSheet)) {
    throw new Error("Backup file has an invalid or missing sheets list.")
  }

  if (!isRecord(parsed.widgets) || !Object.values(parsed.widgets).every(isValidWidget)) {
    throw new Error("Backup file has invalid or missing widget data.")
  }

  const sheets = parsed.sheets as Sheet[]
  const widgets = parsed.widgets as Record<string, Widget>

  // Drop dangling widgetOrder ids that don't exist in widgets, rather than failing.
  const cleanedSheets = sheets.map((sheet) => ({
    ...sheet,
    widgetOrder: sheet.widgetOrder.filter((id) => id in widgets),
  }))

  const currentSheetId =
    typeof parsed.currentSheetId === "string" ? parsed.currentSheetId : null

  return {
    app: "mind-space",
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    sheets: cleanedSheets,
    widgets,
    currentSheetId,
  }
}

export function downloadBackup(file: BackupFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement("a")
  a.href = url
  a.download = `mind-space-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
