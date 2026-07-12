"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { getWidgetData } from "@/lib/widget-utils"
import { InlineInput } from "@/components/ui/icon-button"
import { Plus, Minus, RotateCcw } from "lucide-react"

interface CounterData {
  count: number
  step: number
}

export const CounterWidget = memo(function CounterWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const updateWidget = useStore((s) => s.updateWidget)
  const [editingStep, setEditingStep] = useState(false)
  const [stepInput, setStepInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const data = useMemo(() => getWidgetData<CounterData>(widget), [widget])
  const count = data.count ?? 0
  const step = data.step ?? 1

  const handleIncrement = useCallback(() => {
    updateWidget(widgetId, { data: { ...data, count: count + step } })
  }, [updateWidget, widgetId, data, count, step])

  const handleDecrement = useCallback(() => {
    updateWidget(widgetId, { data: { ...data, count: count - step } })
  }, [updateWidget, widgetId, data, count, step])

  const handleReset = useCallback(() => {
    updateWidget(widgetId, { data: { ...data, count: 0 } })
  }, [updateWidget, widgetId, data])

  const handleSetCount = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setStepInput(String(step))
    setEditingStep(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [step])

  const handleFinishEdit = useCallback(() => {
    const val = parseInt(stepInput, 10)
    if (!isNaN(val) && val > 0) {
      updateWidget(widgetId, { data: { ...data, step: val } })
    }
    setEditingStep(false)
  }, [stepInput, updateWidget, widgetId, data])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <div className="text-5xl font-bold tabular-nums tracking-tight">
        {count}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleDecrement}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
          title="Decrease"
          aria-label="Decrease"
        >
          <Minus className="h-4 w-4" />
        </button>

        <button
          onClick={handleIncrement}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
          title="Increase"
          aria-label="Increase"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={handleReset}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
          title="Reset"
          aria-label="Reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Step:</span>
        {editingStep ? (
          <InlineInput
            inputRef={inputRef}
            type="number"
            min={1}
            value={stepInput}
            onChange={setStepInput}
            onEnter={handleFinishEdit}
            onEscape={() => setEditingStep(false)}
            onBlur={handleFinishEdit}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
            className="h-6 w-12 text-center text-[10px] font-mono"
          />
        ) : (
          <button
            onClick={handleSetCount}
            className="h-6 rounded px-2 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Click to change step"
          >
            {step}
          </button>
        )}
      </div>
    </div>
  )
})