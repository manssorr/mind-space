"use client"

import { useCallback, useRef } from "react"
import { useStore } from "@/store"
import { useInteractionStore } from "@/store/interaction"
import { computeGaps, computeSnap, SNAP_THRESHOLD_PX, type Gap, type Rect } from "@/lib/snap-align"

const setGuides = useInteractionStore.getState().setGuides

export function useWidgetDrag(widgetId: string) {
  const isDragging = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const widgetsStart = useRef<Record<string, { x: number; y: number }>>({})
  const dragIds = useRef<string[]>([])
  const candidates = useRef<Rect[]>([])
  const unionStart = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 })
  const gapsRef = useRef<{ x: Gap[]; y: Gap[] }>({ x: [], y: [] })

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const state = useStore.getState()
      const widget = state.widgets[widgetId]
      if (!widget) return

      isDragging.current = true
      startPos.current = { x: e.clientX, y: e.clientY }
      dragIds.current = []
      widgetsStart.current = {}
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [widgetId]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return

      const state = useStore.getState()

      if (dragIds.current.length === 0) {
        useStore.getState().recordSnapshot()

        const selectedIds = state.selectedWidgetIds
        dragIds.current =
          selectedIds.includes(widgetId) && selectedIds.length > 1
            ? selectedIds
            : [widgetId]

        if (e.altKey) {
          const sheetId = state.currentSheetId
          if (sheetId) {
            const cloneIds = useStore.getState().duplicateWidgetsAt(sheetId, dragIds.current)
            if (cloneIds.length > 0) dragIds.current = cloneIds
          }
        }

        const postState = useStore.getState()

        for (const id of dragIds.current) {
          const w = postState.widgets[id]
          if (w) {
            widgetsStart.current[id] = { x: w.x, y: w.y }
          }
        }

        const dragIdSet = new Set(dragIds.current)
        const sheet = postState.sheets.find((s) => s.id === postState.currentSheetId)
        candidates.current = (sheet?.widgetOrder ?? [])
          .filter((id) => !dragIdSet.has(id))
          .map((id) => postState.widgets[id])
          .filter((w): w is NonNullable<typeof w> => Boolean(w))
          .map((w) => ({ x: w.x, y: w.y, width: w.width, height: w.height }))
        gapsRef.current = computeGaps(candidates.current)

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const id of dragIds.current) {
          const w = postState.widgets[id]
          if (!w) continue
          minX = Math.min(minX, w.x)
          minY = Math.min(minY, w.y)
          maxX = Math.max(maxX, w.x + w.width)
          maxY = Math.max(maxY, w.y + w.height)
        }
        unionStart.current = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }

      let dx =
        (e.clientX - startPos.current.x) / state.canvasState.scale
      let dy =
        (e.clientY - startPos.current.y) / state.canvasState.scale

      let lockedAxis: "x" | "y" | null = null
      if (e.shiftKey) {
        lockedAxis = Math.abs(dx) < Math.abs(dy) ? "x" : "y"
        if (lockedAxis === "x") dx = 0
        else dy = 0
      }

      const snapEnabled = state.canvasState.snapToObjects !== false && !(e.metaKey || e.ctrlKey)
      let snapDx = 0
      let snapDy = 0
      let snappedX = lockedAxis === "x"
      let snappedY = lockedAxis === "y"
      if (snapEnabled) {
        const movingNow: Rect = {
          x: unionStart.current.x + dx,
          y: unionStart.current.y + dy,
          width: unionStart.current.width,
          height: unionStart.current.height,
        }
        const result = computeSnap(
          movingNow,
          candidates.current,
          SNAP_THRESHOLD_PX / state.canvasState.scale,
          lockedAxis ?? undefined,
          gapsRef.current
        )
        snapDx = result.dx
        snapDy = result.dy
        snappedX = snappedX || result.snappedX
        snappedY = snappedY || result.snappedY
        setGuides(result.guides)
      } else {
        setGuides([])
      }

      const grid = state.canvasState.gridSize
      const batch: { id: string; x: number; y: number }[] = []
      for (const [id, start] of Object.entries(widgetsStart.current)) {
        let newX = start.x + dx + snapDx
        let newY = start.y + dy + snapDy

        if (!snappedX) newX = Math.round(newX / grid) * grid
        if (!snappedY) newY = Math.round(newY / grid) * grid

        batch.push({ id, x: newX, y: newY })
      }
      state.moveWidgets(batch)
    },
    [widgetId]
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
    candidates.current = []
    gapsRef.current = { x: [], y: [] }
    setGuides([])
  }, [])

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
  }
}
