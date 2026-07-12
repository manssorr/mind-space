"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import { toDateString, getMonthGrid } from "@/lib/date-utils"
import { getWidgetData } from "@/lib/widget-utils"
import { Plus, Check, ChevronLeft, ChevronRight } from "lucide-react"
import { InlineInput } from "@/components/ui/icon-button"
import { EmojiPicker } from "frimousse"
import * as Popover from "@radix-ui/react-popover"

interface HabitData {
  habitName?: string
  completionDates?: string[]
  emoji?: string
}

function getStreak(completionDates: string[]): number {
  const sorted = [...new Set(completionDates)].sort().reverse()
  if (sorted.length === 0) return 0

  let streak = 0
  const checkDate = new Date()

  for (const dateStr of sorted) {
    const expected = toDateString(checkDate)
    if (dateStr === expected) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else if (dateStr < expected) {
      break
    }
  }

  return streak
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export const HabitWidget = memo(function HabitWidget({ widgetId }: { widgetId: string }) {
  const widget = useStore((s) => s.widgets[widgetId])
  const updateWidget = useStore((s) => s.updateWidget)
  const [viewDate, setViewDate] = useState(() => new Date())
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [popping, setPopping] = useState(false)

  const data = useMemo(() => getWidgetData<HabitData>(widget), [widget])
  const habitName = data.habitName ?? "Coding"
  const habitEmoji = data.emoji ?? null
  const completionDates = data.completionDates ?? []
  const today = useMemo(() => toDateString(new Date()), [])

  const totalDone = completionDates.length
  const currentStreak = useMemo(() => getStreak(completionDates), [completionDates])
  const isTodayCompleted = completionDates.includes(today)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const cells = useMemo(() => getMonthGrid(year, month, 1), [year, month])

  const monthName = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const prevMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  const toggleToday = useCallback(() => {
    const hasToday = completionDates.includes(today)
    const newDates = hasToday
      ? completionDates.filter((d) => d !== today)
      : [...completionDates, today]
    updateWidget(widgetId, { data: { ...data, completionDates: newDates } })
  }, [completionDates, today, updateWidget, widgetId, data])

  const toggleDate = useCallback(
    (dateStr: string) => {
      const hasDate = completionDates.includes(dateStr)
      const newDates = hasDate
        ? completionDates.filter((d) => d !== dateStr)
        : [...completionDates, dateStr]
      updateWidget(widgetId, { data: { ...data, completionDates: newDates } })
    },
    [completionDates, updateWidget, widgetId, data]
  )

  const startEditName = useCallback(() => {
    setNameInput(habitName)
    setEditingName(true)
  }, [habitName])

  const finishEditName = useCallback(() => {
    const trimmed = nameInput.trim()
    if (trimmed) {
      updateWidget(widgetId, {
        data: { ...data, habitName: trimmed },
      })
    }
    setEditingName(false)
  }, [nameInput, updateWidget, widgetId, data])

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <div className="flex items-center gap-2">
        <Popover.Root>
          <Popover.Trigger
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-lg hover:bg-accent transition-colors cursor-pointer outline-hidden"
            aria-label="Choose icon"
          >
            {habitEmoji ?? <Plus className="h-4 w-4 text-muted-foreground" />}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              onPointerDown={(e) => e.stopPropagation()}
              className="z-50"
            >
              <EmojiPicker.Root
                className="isolate flex h-[326px] w-fit flex-col rounded-lg border bg-popover shadow-md"
                onEmojiSelect={({ emoji }: { emoji: string }) => {
                  updateWidget(widgetId, {
                    data: { ...data, emoji },
                  })
                }}
              >
                <EmojiPicker.Search className="z-10 mx-2 mt-2 mb-1 appearance-none rounded-md bg-muted px-2.5 py-1.5 text-xs outline-hidden placeholder:text-muted-foreground" />
                <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
                  <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    Loading…
                  </EmojiPicker.Loading>
                  <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    No emoji found.
                  </EmojiPicker.Empty>
                  <EmojiPicker.List
                    className="select-none pb-1.5"
                    components={{
                      CategoryHeader: ({ category, ...props }: { category: { label: string } } & React.ComponentProps<"div">) => (
                        <div
                          className="bg-popover px-3 pt-3 pb-1.5 font-medium text-xs text-muted-foreground"
                          {...props}
                        >
                          {category.label}
                        </div>
                      ),
                      Row: ({ children, ...props }: React.ComponentProps<"div">) => (
                        <div className="scroll-my-1.5 px-1.5" {...props}>
                          {children}
                        </div>
                      ),
                      Emoji: ({ emoji, ...props }: { emoji: { emoji: string } } & React.ComponentProps<"button">) => (
                        <button
                          className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
                          {...props}
                        >
                          {emoji.emoji}
                        </button>
                      ),
                    }}
                  />
                </EmojiPicker.Viewport>
              </EmojiPicker.Root>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {editingName ? (
          <InlineInput
            value={nameInput}
            onChange={setNameInput}
            onEnter={finishEditName}
            onEscape={() => setEditingName(false)}
            onBlur={finishEditName}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
            className="h-7 w-full"
          />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              startEditName()
            }}
            className="text-sm font-bold text-foreground truncate rounded px-1 -mx-1 transition-colors hover:bg-accent/50"
            title="Edit habit name"
          >
            {habitName}
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 py-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!isTodayCompleted) setPopping(true)
            toggleToday()
          }}
          onAnimationEnd={(e) => {
            if (e.animationName === "habit-pop") setPopping(false)
          }}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
            isTodayCompleted
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground",
            popping && "habit-pop"
          )}
          title={isTodayCompleted ? "Mark incomplete" : "Log completed session"}
          aria-label={isTodayCompleted ? "Mark incomplete" : "Log completed session"}
        >
          <Check className="h-6 w-6" />
        </button>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {totalDone} x done &middot; {currentStreak} day streak
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              prevMonth()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-semibold text-foreground">
            {monthName}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              nextMonth()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px mb-0.5">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className="text-[8px] font-medium text-muted-foreground text-center py-0.5"
            >
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px flex-1 content-start">
          {cells.map((cell) => {
            const isCompleted = completionDates.includes(cell.date)
            return (
              <button
                key={cell.date}
                onClick={(e) => {
                  e.stopPropagation()
                  if (cell.current) toggleDate(cell.date)
                }}
                className={cn(
                  "flex items-center justify-center transition-colors aspect-square",
                  cell.current
                    ? "hover:bg-accent/50 rounded-sm cursor-pointer"
                    : "opacity-20"
                )}
                aria-label={`${cell.date}${isCompleted ? " completed" : ""}`}
              >
                <span
                  className={cn(
                    "text-[10px]",
                    isCompleted
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground/50",
                    !cell.current && "opacity-20"
                  )}
                >
                  {cell.day}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
})
