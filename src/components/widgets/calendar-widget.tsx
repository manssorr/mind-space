"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { toDateString, getMonthGrid } from "@/lib/date-utils"
import { getWidgetData } from "@/lib/widget-utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CalendarData {
  notes: Record<string, string>
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const CalendarWidget = memo(function CalendarWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const updateWidget = useStore((s) => s.updateWidget)
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")

  const data = useMemo(() => getWidgetData<CalendarData>(widget), [widget])
  const notes = useMemo(() => data.notes ?? {}, [data.notes])
  const today = useMemo(() => toDateString(new Date()), [])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const cells = useMemo(() => getMonthGrid(year, month, 0), [year, month])

  const monthName = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const prevMonth = useCallback(() => {
    setViewDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }, [year, month])

  const nextMonth = useCallback(() => {
    setViewDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }, [year, month])

  const handleDayClick = useCallback(
    (dateStr: string) => {
      if (selectedDate === dateStr) {
        setSelectedDate(null)
      } else {
        setSelectedDate(dateStr)
        setNoteInput(notes[dateStr] ?? "")
      }
    },
    [selectedDate, notes]
  )

  const handleSaveNote = useCallback(() => {
    if (!selectedDate) return
    const trimmed = noteInput.trim()
    const newNotes = { ...notes }
    if (trimmed) {
      newNotes[selectedDate] = trimmed
    } else {
      delete newNotes[selectedDate]
    }
    updateWidget(widgetId, { data: { notes: newNotes } })
    setSelectedDate(null)
    setNoteInput("")
  }, [selectedDate, noteInput, notes, updateWidget, widgetId])

  const handleNoteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSaveNote()
      }
      if (e.key === "Escape") {
        setSelectedDate(null)
        setNoteInput("")
      }
    },
    [handleSaveNote]
  )

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold">{monthName}</span>
        <button
          onClick={nextMonth}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-1">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-[9px] font-medium text-muted-foreground text-center py-0.5"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px flex-1">
        {cells.map((cell) => {
          const hasNote = notes[cell.date] !== undefined
          const isToday = cell.date === today
          const isSelected = cell.date === selectedDate
          return (
            <button
              key={cell.date}
              onClick={() => handleDayClick(cell.date)}
              className={cn(
                "relative flex items-center justify-center text-xs rounded-sm transition-colors aspect-square",
                cell.current
                  ? "text-foreground hover:bg-accent"
                  : "text-muted-foreground/30",
                isToday && "font-bold ring-1 ring-primary ring-inset",
                isSelected && "bg-primary/10 ring-1 ring-primary",
                hasNote &&
                  "after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary"
              )}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add a note..."
              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={handleNoteKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              autoFocus
            />
            <button
              onClick={handleSaveNote}
              className="h-6 shrink-0 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
