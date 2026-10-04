const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const shortDate = new Intl.DateTimeFormat(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' })
const month = new Intl.DateTimeFormat(undefined, { month: 'long' })
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

/** Date shown in the notes list: “10:42 AM”, “Yesterday”, “Monday” or “9/28/26”. */
export function formatListDate(timestamp: number, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(timestamp))) / DAY_MS)
  if (days <= 0) return time.format(timestamp)
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday.format(timestamp)
  return shortDate.format(timestamp)
}

/** Date shown above the note text: “October 4, 2026 at 10:42 AM”. */
export function formatEditorDate(timestamp: number): string {
  return `${longDate.format(timestamp)} at ${time.format(timestamp)}`
}

/** Section headers used when notes are grouped by date. */
export function dateGroup(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 Days'
  if (days < 30) return 'Previous 30 Days'
  if (date.getFullYear() === now.getFullYear()) return month.format(date)
  return String(date.getFullYear())
}
