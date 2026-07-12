export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export interface MonthGridCell {
  day: number
  current: boolean
  date: string
}

export function getMonthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 0): MonthGridCell[] {
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = weekStartsOn === 1 ? (firstDay === 0 ? 6 : firstDay - 1) : firstDay
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells: MonthGridCell[] = []
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ day: d, current: false, date: toDateString(new Date(year, month - 1, d)) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: toDateString(new Date(year, month, d)) })
  }
  const remaining = 7 - (cells.length % 7 || 7)
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false, date: toDateString(new Date(year, month + 1, d)) })
  }
  return cells
}
