import { WidgetType } from "@/types"
import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import { StickyNote, Type, Timer, Clock, Link, Calendar, CheckSquare, ListTodo, Calculator } from "lucide-react"
import { TimerWidget } from "./timer-widget"
import { StopwatchWidget } from "./stopwatch-widget"
import { QuickLinkWidget } from "./quick-link-widget"
import { CalendarWidget } from "./calendar-widget"
import { HabitWidget } from "./habit-widget"
import { TodoWidget } from "./todo-widget"
import { CounterWidget } from "./counter-widget"
import { NoteWidget } from "./note-widget"
import { TextWidget } from "./text-widget"

export interface WidgetDef {
  type: WidgetType
  label: string
  icon: LucideIcon
  component: ComponentType<{ widgetId: string }>
  defaultTitle: string
  defaultSize: { width: number; height: number }
  defaultData: Record<string, unknown>
}

export const WIDGET_DEFS: Record<WidgetType, WidgetDef> = {
  [WidgetType.Note]: {
    type: WidgetType.Note,
    label: "Note",
    icon: StickyNote,
    component: NoteWidget,
    defaultTitle: "Note",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Text]: {
    type: WidgetType.Text,
    label: "Label",
    icon: Type,
    component: TextWidget,
    defaultTitle: "Label",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Timer]: {
    type: WidgetType.Timer,
    label: "Timer",
    icon: Timer,
    component: TimerWidget,
    defaultTitle: "Timer",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Stopwatch]: {
    type: WidgetType.Stopwatch,
    label: "Stopwatch",
    icon: Clock,
    component: StopwatchWidget,
    defaultTitle: "Stopwatch",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.QuickLink]: {
    type: WidgetType.QuickLink,
    label: "Quick Link",
    icon: Link,
    component: QuickLinkWidget,
    defaultTitle: "Quick Link",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Calendar]: {
    type: WidgetType.Calendar,
    label: "Calendar",
    icon: Calendar,
    component: CalendarWidget,
    defaultTitle: "Calendar",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Habit]: {
    type: WidgetType.Habit,
    label: "Habit Tracker",
    icon: CheckSquare,
    component: HabitWidget,
    defaultTitle: "Coding Habit",
    defaultSize: { width: 280, height: 340 },
    defaultData: {},
  },
  [WidgetType.Todo]: {
    type: WidgetType.Todo,
    label: "Todo List",
    icon: ListTodo,
    component: TodoWidget,
    defaultTitle: "Todo List",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
  [WidgetType.Counter]: {
    type: WidgetType.Counter,
    label: "Counter",
    icon: Calculator,
    component: CounterWidget,
    defaultTitle: "Counter",
    defaultSize: { width: 280, height: 240 },
    defaultData: {},
  },
}

export const widgetComponents = Object.fromEntries(
  Object.values(WIDGET_DEFS).map((d) => [d.type, d.component])
) as Partial<Record<WidgetType, ComponentType<{ widgetId: string }>>>
