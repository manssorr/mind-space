export enum WidgetType {
  Note = "note",
  Todo = "todo",
  Calendar = "calendar",
  Text = "text",
  Habit = "habit",
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

export interface List {
  id: string
  name: string
  createdAt: number
}

export type ListItemStatus = "todo" | "progress" | "done"

export interface ListItem {
  id: string
  listId: string
  text: string
  status: ListItemStatus
  order: string
  tags: string[]
  createdAt: number
  completedAt?: number
}

export type BackgroundPattern = "grid" | "dots" | "none"

export type ResizeHandleStyle = "corners" | "invisible" | "brackets"

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
