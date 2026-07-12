"use client"

import * as Popover from "@radix-ui/react-popover"
import { Check, Grid3x3, Circle, Ban, Square, EyeOff, CornerUpLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { BACKGROUND_PRESETS } from "@/lib/backgrounds"
import type { BackgroundPattern, CanvasBackground, ResizeHandleStyle } from "@/types"
import { useTheme } from "@/components/theme-provider"

const PATTERNS: { id: BackgroundPattern; label: string; icon: typeof Grid3x3 }[] = [
  { id: "grid", label: "Grid", icon: Grid3x3 },
  { id: "dots", label: "Dots", icon: Circle },
  { id: "none", label: "None", icon: Ban },
]

const HANDLE_STYLES: { id: ResizeHandleStyle; label: string; icon: typeof Square }[] = [
  { id: "corners", label: "Corners", icon: Square },
  { id: "invisible", label: "Invisible", icon: EyeOff },
  { id: "brackets", label: "Brackets", icon: CornerUpLeft },
]

interface BackgroundPickerProps {
  value: CanvasBackground
  onChange: (partial: Partial<CanvasBackground>) => void
  onReset?: () => void
  resizeHandleStyle?: ResizeHandleStyle
  onResizeHandleStyleChange?: (style: ResizeHandleStyle) => void
  trigger: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

export function BackgroundPicker({
  value,
  onChange,
  onReset,
  resizeHandleStyle,
  onResizeHandleStyleChange,
  trigger,
  side = "top",
  align = "end",
}: BackgroundPickerProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          data-background-picker=""
          className="z-50 w-56 rounded-lg border bg-popover p-3 shadow-md"
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">Color</div>
          <div className="flex flex-wrap gap-2">
            {BACKGROUND_PRESETS.map((preset) => {
              const color = isDark ? preset.dark : preset.light
              const isSelected = value.color === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.name}
                  title={preset.name}
                  onClick={() => onChange({ color: preset.id })}
                  className={cn(
                    "relative flex size-7 items-center justify-center rounded-full border transition-colors",
                    isSelected ? "ring-2 ring-ring ring-offset-1 ring-offset-popover" : ""
                  )}
                  style={{ backgroundColor: color, borderColor: "hsl(var(--border))" }}
                >
                  {isSelected && (
                    <Check
                      className="size-3.5"
                      style={{ color: isDark ? "white" : "black", mixBlendMode: "difference" }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <div className="text-xs font-medium text-muted-foreground mt-3 mb-2">Pattern</div>
          <div className="flex gap-1 rounded-md bg-muted p-0.5">
            {PATTERNS.map((pattern) => {
              const Icon = pattern.icon
              const isSelected = value.pattern === pattern.id
              return (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => onChange({ pattern: pattern.id })}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-sm py-1 text-xs transition-colors",
                    isSelected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {pattern.label}
                </button>
              )
            })}
          </div>

          {resizeHandleStyle && onResizeHandleStyleChange && (
            <>
              <div className="text-xs font-medium text-muted-foreground mt-3 mb-2">Resize handles</div>
              <div className="flex gap-1 rounded-md bg-muted p-0.5">
                {HANDLE_STYLES.map((handle) => {
                  const Icon = handle.icon
                  const isSelected = resizeHandleStyle === handle.id
                  return (
                    <button
                      key={handle.id}
                      type="button"
                      onClick={() => onResizeHandleStyleChange(handle.id)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-sm py-1 text-xs transition-colors",
                        isSelected
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="size-3.5" />
                      {handle.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="mt-3 w-full rounded-md border border-input py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Use default
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
