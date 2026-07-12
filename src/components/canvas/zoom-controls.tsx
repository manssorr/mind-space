"use client"

import { memo, useCallback, useRef } from "react"
import type { PointerEvent, ChangeEvent } from "react"
import { useStore } from "@/store"
import { IconButton } from "@/components/ui/icon-button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import { buildBackup, downloadBackup, parseBackup } from "@/lib/backup"
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Paintbrush, Download, Upload } from "lucide-react"
import { AddWidgetButton } from "./add-widget-button"
import { BackgroundPicker } from "./background-picker"

function stopPropagation(e: PointerEvent) {
  e.stopPropagation()
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function animateCanvas() {
  if (prefersReducedMotion()) return
  useStore.getState().setCanvasAnimating(true)
  setTimeout(() => useStore.getState().setCanvasAnimating(false), 250)
}

function zoomAtCenter(factor: number) {
  const { canvasState: cs } = useStore.getState()
  const newScale = Math.min(Math.max(cs.scale * factor, 0.1), 5)
  const scaleChange = newScale / cs.scale
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  return {
    scale: newScale,
    offsetX: cx - (cx - cs.offsetX) * scaleChange,
    offsetY: cy - (cy - cs.offsetY) * scaleChange,
  }
}

export const ZoomControls = memo(function ZoomControls() {
  const canvasState = useStore((s) => s.canvasState)
  const setCanvasState = useStore((s) => s.setCanvasState)
  const canvasBackground = useStore((s) => s.canvasBackground)
  const setCanvasBackground = useStore((s) => s.setCanvasBackground)
  const resizeHandleStyle = useStore((s) => s.resizeHandleStyle)
  const setResizeHandleStyle = useStore((s) => s.setResizeHandleStyle)
  const importState = useStore((s) => s.importState)
  const confirm = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const zoomPercent = Math.round(canvasState.scale * 100)

  const zoomIn = useCallback(() => {
    animateCanvas()
    setCanvasState(zoomAtCenter(1.4))
  }, [setCanvasState])

  const zoomOut = useCallback(() => {
    animateCanvas()
    setCanvasState(zoomAtCenter(1 / 1.4))
  }, [setCanvasState])

  const resetView = useCallback(() => {
    animateCanvas()
    setCanvasState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [setCanvasState])

  const fitToScreen = useCallback(() => {
    const { currentSheetId, sheets, widgets: w } =
      useStore.getState()
    const sheet = sheets.find((s) => s.id === currentSheetId)
    if (!sheet) return

    const widgetList = sheet.widgetOrder
      .map((id) => w[id])
      .filter(Boolean)
    if (widgetList.length === 0) return

    const padding = 48
    const cw = window.innerWidth
    const ch = window.innerHeight

    const minX = Math.min(...widgetList.map((wi) => wi.x))
    const minY = Math.min(...widgetList.map((wi) => wi.y))
    const maxX = Math.max(...widgetList.map((wi) => wi.x + wi.width))
    const maxY = Math.max(...widgetList.map((wi) => wi.y + wi.height))

    const contentW = maxX - minX
    const contentH = maxY - minY

    if (contentW <= 0 && contentH <= 0) return

    const scale = Math.min(
      (cw - padding * 2) / (contentW || 1),
      (ch - padding * 2) / (contentH || 1),
      5
    )

    const offsetX = (cw - (minX + maxX) * scale) / 2
    const offsetY = (ch - (minY + maxY) * scale) / 2

    animateCanvas()
    setCanvasState({ scale, offsetX, offsetY })
  }, [setCanvasState])

  const exportBackup = useCallback(() => {
    const { sheets, widgets, currentSheetId } = useStore.getState()
    const backup = buildBackup(sheets, widgets, currentSheetId)
    downloadBackup(backup)
  }, [])

  const triggerImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return

      const text = await file.text()
      let backup
      try {
        backup = parseBackup(text)
      } catch (err) {
        toast.error("Import failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
        return
      }

      const confirmed = await confirm({
        title: "Import backup",
        description:
          "Replace all current sheets and widgets with this backup? Current data will be overwritten (undoable until you leave the page).",
        confirmLabel: "Import",
        cancelLabel: "Cancel",
        variant: "destructive",
      })
      if (!confirmed) return

      importState(backup)
      toast.success("Backup imported")
    },
    [confirm, importState]
  )

  return (
    <div
      className="absolute bottom-4 right-4 flex flex-col gap-0.5 rounded-lg border bg-background/80 backdrop-blur-sm p-1 shadow-sm"
      onPointerDown={stopPropagation}
    >
      <div className="flex items-center justify-center px-0.5 py-0.5">
        <ThemeToggle />
      </div>

      <div className="h-px bg-border mx-1" />

      <IconButton label="Zoom in" size="md" onClick={zoomIn}>
        <ZoomIn className="h-4 w-4" />
      </IconButton>

      <div className="flex h-8 items-center justify-center px-1 text-xs font-medium tabular-nums text-muted-foreground select-none">
        {zoomPercent}%
      </div>

      <IconButton label="Zoom out" size="md" onClick={zoomOut}>
        <ZoomOut className="h-4 w-4" />
      </IconButton>

      <div className="h-px bg-border mx-1" />

      <IconButton label="Fit to screen" size="md" onClick={fitToScreen}>
        <Maximize2 className="h-4 w-4" />
      </IconButton>

      <IconButton label="Reset zoom" size="md" onClick={resetView}>
        <RotateCcw className="h-4 w-4" />
      </IconButton>

      <div className="h-px bg-border mx-1" />

      <BackgroundPicker
        value={canvasBackground}
        onChange={setCanvasBackground}
        resizeHandleStyle={resizeHandleStyle}
        onResizeHandleStyleChange={setResizeHandleStyle}
        trigger={
          <IconButton label="Canvas background" size="md">
            <Paintbrush className="h-4 w-4" />
          </IconButton>
        }
      />

      <div className="h-px bg-border mx-1" />

      <IconButton label="Export backup" size="md" onClick={exportBackup}>
        <Download className="h-4 w-4" />
      </IconButton>

      <IconButton label="Import backup" size="md" onClick={triggerImport}>
        <Upload className="h-4 w-4" />
      </IconButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="h-px bg-border mx-1" />


      <AddWidgetButton />
    </div>
  )
})
