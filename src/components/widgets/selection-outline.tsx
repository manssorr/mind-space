"use client"

import { memo } from "react"
import { useStore } from "@/store"
import type { ResizeDirection } from "@/hooks/use-widget-resize"
import { useWidgetResize } from "@/hooks/use-widget-resize"
import type { ResizeHandleStyle } from "@/types"

interface SelectionOutlineProps {
  widgetId: string
  collapsed: boolean
}

const EDGE_THICKNESS = 12
const CORNER_SIZE = 20

const edgeZones: { dir: ResizeDirection; className: string; style: React.CSSProperties }[] = [
  {
    dir: "n",
    className: "cursor-n-resize",
    style: { top: -EDGE_THICKNESS / 2, left: 0, right: 0, height: EDGE_THICKNESS },
  },
  {
    dir: "s",
    className: "cursor-s-resize",
    style: { bottom: -EDGE_THICKNESS / 2, left: 0, right: 0, height: EDGE_THICKNESS },
  },
  {
    dir: "e",
    className: "cursor-e-resize",
    style: { right: -EDGE_THICKNESS / 2, top: 0, bottom: 0, width: EDGE_THICKNESS },
  },
  {
    dir: "w",
    className: "cursor-w-resize",
    style: { left: -EDGE_THICKNESS / 2, top: 0, bottom: 0, width: EDGE_THICKNESS },
  },
]

const cornerZones: { dir: ResizeDirection; className: string; style: React.CSSProperties }[] = [
  {
    dir: "ne",
    className: "cursor-ne-resize",
    style: { top: -CORNER_SIZE / 2, right: -CORNER_SIZE / 2, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    dir: "nw",
    className: "cursor-nw-resize",
    style: { top: -CORNER_SIZE / 2, left: -CORNER_SIZE / 2, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    dir: "se",
    className: "cursor-se-resize",
    style: { bottom: -CORNER_SIZE / 2, right: -CORNER_SIZE / 2, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    dir: "sw",
    className: "cursor-sw-resize",
    style: { bottom: -CORNER_SIZE / 2, left: -CORNER_SIZE / 2, width: CORNER_SIZE, height: CORNER_SIZE },
  },
]

const ResizeZone = memo(function ResizeZone({
  widgetId,
  dir,
  className,
  style,
}: {
  widgetId: string
  dir: ResizeDirection
  className: string
  style: React.CSSProperties
}) {
  const handlers = useWidgetResize(widgetId, dir)

  return (
    <div
      {...handlers}
      className={`absolute z-10 ${className}`}
      style={{ ...style, touchAction: "none" }}
    />
  )
})

// Visual position for each corner's style overlay, matching cornerZones'
// center point but sized for the smaller squares/brackets drawn there.
const cornerVisualPosition: Record<"ne" | "nw" | "se" | "sw", React.CSSProperties> = {
  ne: { top: 0, right: 0, transform: "translate(50%, -50%)" },
  nw: { top: 0, left: 0, transform: "translate(-50%, -50%)" },
  se: { bottom: 0, right: 0, transform: "translate(50%, 50%)" },
  sw: { bottom: 0, left: 0, transform: "translate(-50%, 50%)" },
}

const CornerSquares = memo(function CornerSquares() {
  return (
    <>
      {(["ne", "nw", "se", "sw"] as const).map((corner) => (
        <div
          key={corner}
          className="absolute h-2 w-2 rounded-sm border-2 border-primary bg-background shadow-sm pointer-events-none"
          style={cornerVisualPosition[corner]}
        />
      ))}
    </>
  )
})

// Bracket arm rotation per corner: the base bracket is drawn as an "L"
// open toward the bottom-right (border on top + left), then rotated to
// face outward from each corner of the selection box.
const bracketRotation: Record<"ne" | "nw" | "se" | "sw", string> = {
  nw: "rotate(0deg)",
  ne: "rotate(90deg)",
  se: "rotate(180deg)",
  sw: "rotate(270deg)",
}

const CornerBrackets = memo(function CornerBrackets() {
  return (
    <>
      {(["ne", "nw", "se", "sw"] as const).map((corner) => (
        <div
          key={corner}
          className="absolute h-3.5 w-3.5 border-t-2 border-l-2 border-primary rounded-tl-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ ...cornerVisualPosition[corner], transform: `${cornerVisualPosition[corner].transform} ${bracketRotation[corner]}` }}
        />
      ))}
    </>
  )
})

export const SelectionOutline = memo(function SelectionOutline({ widgetId, collapsed }: SelectionOutlineProps) {
  const handleStyle = useStore((s) => s.resizeHandleStyle)

  return (
    <>
      <div
        className="absolute inset-0 rounded-xl border-2 border-primary pointer-events-none"
        style={{ outline: "none" }}
      />

      {edgeZones
        .filter(({ dir }) => !collapsed || dir === "e" || dir === "w")
        .map(({ dir, className, style }) => (
          <ResizeZone key={dir} widgetId={widgetId} dir={dir} className={className} style={style} />
        ))}

      {!collapsed &&
        cornerZones.map(({ dir, className, style }) => (
          <ResizeZone key={dir} widgetId={widgetId} dir={dir} className={className} style={style} />
        ))}

      {!collapsed && <HandleVisuals style={handleStyle} />}
    </>
  )
})

function HandleVisuals({ style }: { style: ResizeHandleStyle }) {
  if (style === "corners") return <CornerSquares />
  if (style === "brackets") return <CornerBrackets />
  return null
}
