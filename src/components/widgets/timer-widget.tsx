"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { getWidgetData } from "@/lib/widget-utils"
import { RoundButton, InlineInput } from "@/components/ui/icon-button"
import { Play, Pause, RotateCcw } from "lucide-react"

interface TimerData {
  duration: number
  endsAt: number | null
  pausedRemaining: number | null
}

function computeRemaining(data: TimerData): number {
  const duration = data.duration ?? 300
  if (data.endsAt != null) {
    return Math.max(0, (data.endsAt - Date.now()) / 1000)
  }
  if (data.pausedRemaining != null) {
    return data.pausedRemaining
  }
  return duration
}

export const TimerWidget = memo(function TimerWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const updateWidget = useStore((s) => s.updateWidget)
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationInput, setDurationInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const data = useMemo(() => getWidgetData<TimerData>(widget), [widget])
  const duration = data.duration ?? 300
  const running = data.endsAt != null
  const paused = data.pausedRemaining != null

  const [remaining, setRemaining] = useState(() => computeRemaining(data))

  useEffect(() => {
    setRemaining(computeRemaining(data))
  }, [data])

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      const w = useStore.getState().widgets[widgetId]
      if (!w) return
      const d = getWidgetData<TimerData>(w)
      const newRemaining = computeRemaining(d)
      if (newRemaining <= 0) {
        updateWidget(widgetId, {
          data: { ...d, endsAt: null, pausedRemaining: 0 },
        })
        clearInterval(interval)
      } else {
        setRemaining(newRemaining)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [running, widgetId, updateWidget])

  const minutes = Math.floor(remaining / 60)
  const seconds = Math.floor(remaining % 60)
  const tenths = Math.floor((remaining - Math.floor(remaining)) * 10)

  const handleStart = useCallback(() => {
    const remainingSeconds = remaining || duration
    updateWidget(widgetId, {
      data: { ...data, endsAt: Date.now() + remainingSeconds * 1000, pausedRemaining: null },
    })
  }, [updateWidget, widgetId, data, remaining, duration])

  const handlePause = useCallback(() => {
    updateWidget(widgetId, {
      data: { ...data, endsAt: null, pausedRemaining: computeRemaining(data) },
    })
  }, [updateWidget, widgetId, data])

  const handleResume = useCallback(() => {
    const remainingSeconds = data.pausedRemaining ?? duration
    updateWidget(widgetId, {
      data: { ...data, endsAt: Date.now() + remainingSeconds * 1000, pausedRemaining: null },
    })
  }, [updateWidget, widgetId, data, duration])

  const handleReset = useCallback(() => {
    updateWidget(widgetId, {
      data: { ...data, endsAt: null, pausedRemaining: null },
    })
  }, [updateWidget, widgetId, data])

  const handleStartEdit = useCallback(() => {
    setDurationInput(String(duration))
    setEditingDuration(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [duration])

  const handleFinishEdit = useCallback(() => {
    const val = parseInt(durationInput, 10)
    if (!isNaN(val) && val > 0) {
      updateWidget(widgetId, {
        data: { ...data, duration: val, endsAt: null, pausedRemaining: null },
      })
    }
    setEditingDuration(false)
  }, [durationInput, updateWidget, widgetId, data])

  const isComplete = remaining <= 0 && !running

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      {editingDuration ? (
        <InlineInput
          inputRef={inputRef}
          type="number"
          min={1}
          value={durationInput}
          onChange={setDurationInput}
          onEnter={handleFinishEdit}
          onEscape={() => setEditingDuration(false)}
          onBlur={handleFinishEdit}
          onPointerDown={(e) => e.stopPropagation()}
          autoFocus
          className="h-8 w-24 text-center text-sm font-mono"
        />
      ) : (
        <div
          className={cn(
            "text-4xl font-mono font-bold tabular-nums tracking-tight",
            ((!running && !paused) || isComplete) && "cursor-pointer",
            isComplete && "text-destructive animate-pulse"
          )}
          onClick={(!running && !paused) || isComplete ? handleStartEdit : undefined}
          title={(!running && !paused) || isComplete ? "Click to set duration" : undefined}
        >
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          <span className="text-xl text-muted-foreground">.{tenths}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!running && !paused && !isComplete && (
          <RoundButton label="Start" variant="primary" onClick={handleStart}>
            <Play className="h-4 w-4 fill-current" />
          </RoundButton>
        )}
        {running && (
          <RoundButton
            label="Pause"
            onClick={handlePause}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            <Pause className="h-4 w-4 fill-current" />
          </RoundButton>
        )}
        {!running && paused && remaining > 0 && (
          <RoundButton label="Resume" variant="primary" onClick={handleResume}>
            <Play className="h-4 w-4 fill-current" />
          </RoundButton>
        )}
        <RoundButton label="Reset" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
        </RoundButton>
      </div>
    </div>
  )
})
