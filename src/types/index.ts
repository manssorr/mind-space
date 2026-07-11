export enum WidgetType {
  Note = "note",
  Todo = "todo",
  Image = "image",
  Link = "link",
  Drawing = "drawing",
  Code = "code",
  File = "file",
  Clock = "clock",
  Calendar = "calendar",
  Weather = "weather",
  Embed = "embed",
  Divider = "divider",
  Text = "text",
  Checklist = "checklist",
  MindMap = "mindmap",
  Kanban = "kanban",
  Habit = "habit",
  Mood = "mood",
  Counter = "counter",
  Timer = "timer",
  Stopwatch = "stopwatch",
  QuickLink = "quicklink",
}

export interface Widget {
  id: string
  type: WidgetType
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  collapsed: boolean
  data: Record<string, unknown>
  colorTheme?: string
}

export type BackgroundPattern = "grid" | "dots" | "none"

export interface CanvasBackground {
  color: string
  pattern: BackgroundPattern
}

export interface Sheet {
  id: string
  title: string
  description?: string
  widgetOrder: string[]
  createdAt: number
  updatedAt: number
  background?: Partial<CanvasBackground>
}

export interface CanvasState {
  offsetX: number
  offsetY: number
  scale: number
  gridSize: number
  snapToObjects: boolean
}

export interface ThemeSettings {
  mode: "light" | "dark" | "system"
  accentColor: string
  fontSize: number
}

export interface SelectionBox {
  x: number
  y: number
  width: number
  height: number
}
