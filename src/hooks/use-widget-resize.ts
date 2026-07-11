"use client"

import { useCallback, useRef } from "react"
import { useStore } from "@/store"
import { quantize } from "@/lib/geometry"

export type ResizeDirection =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"

export function useWidgetResize(
  widgetId: string,
  direction: ResizeDirection
) {
  const isResizing = useRef(false)
  const hasResized = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const widgetStart = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const MIN_WIDTH = 120
  const MIN_HEIGHT = 80

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      const widget = useStore.getState().widgets[widgetId]
      if (!widget) return

      isResizing.current = true
      hasResized.current = false
      startPos.current = { x: e.clientX, y: e.clientY }
      widgetStart.current = {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [widgetId]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing.current) return

      if (!hasResized.current) {
        useStore.getState().recordSnapshot()
        hasResized.current = true
      }

      const state = useStore.getState()
      const scale = state.canvasState.scale
      const dx = (e.clientX - startPos.current.x) / scale
      const dy = (e.clientY - startPos.current.y) / scale

      const { x, y, width, height } = widgetStart.current
      const grid = state.canvasState.gridSize

      let newX = x
      let newY = y
      let newW = width
      let newH = height

      // The fixed edge (x/y, both already grid-aligned since widgetStart
      // comes from persisted geometry) plus the quantized size gives the
      // moving edge's exact on-grid position, so we quantize size first
      // and derive x/y from it rather than quantizing a raw x/y that could
      // round independently and desync from the fixed edge.
      if (direction.includes("e")) {
        newW = Math.max(MIN_WIDTH, quantize(width + dx, grid))
      }
      if (direction.includes("w")) {
        newW = Math.max(MIN_WIDTH, quantize(width - dx, grid))
        newX = x + width - newW
      }
      if (direction.includes("s")) {
        newH = Math.max(MIN_HEIGHT, quantize(height + dy, grid))
      }
      if (direction.includes("n")) {
        newH = Math.max(MIN_HEIGHT, quantize(height - dy, grid))
        newY = y + height - newH
      }

      state.moveWidget(widgetId, newX, newY)
      state.resizeWidget(widgetId, newW, newH)
    },
    [widgetId, direction]
  )

  const handlePointerUp = useCallback(() => {
    isResizing.current = false
  }, [])

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
  }
}
