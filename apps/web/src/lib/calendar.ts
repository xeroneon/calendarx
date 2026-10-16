/**
 * Calendar web UI helpers (XER-79, Phase 2.2).
 *
 * Pure, dependency-free date math + RFC 5545 CalTime/recurrence builders for
 * the client. Reuses the canonical domain types from `@calendarx/calendar` so
 * the UI and the service stay in lock-step. All day-window math is Monday-first
 * (matches the recurrence engine's WKST=MO default).
 */
import { attendee, isTaskComplete, uriEmail } from '@calendarx/calendar'
import type { Alarm, Attendee, ByDayEntry, CalTime, HMS, RecurrenceRule, Weekday, YMD, Occurrence, CalendarTask } from '@calendarx/calendar'

export type { HMS, YMD, Weekday } from '@calendarx/calendar'
export type { ByDayEntry } from '@calendarx/calendar'

/* ── YMD / JS Date conversions (local wall clock) ───────────────────────── */

export function dateToYmd(d: Date): YMD {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

export function ymdToDate(y: YMD): Date {
  return new Date(y.year, y.month - 1, y.day, 0, 0, 0, 0)
}

export function todayYmd(): YMD {
  return dateToYmd(new Date())
}

/** Sortable "YYYY-MM-DD" key for a YMD. */
export function ymdKey(y: YMD): string {
  return `${y.year}-${pad2(y.month)}-${pad2(y.day)}`
}

/** Parse a "YYYY-MM-DD" key back into a YMD (null on malformed input). */
export function parseYmdKey(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y: YMD = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return isValidYmd(y) ? y : null
}

export function isValidYmd(y: YMD): boolean {
  return y.month >= 1 && y.month <= 12 && y.day >= 1 && y.day <= daysInMonth(y)
}

export function daysInMonth(y: YMD): number {
  return new Date(y.year, y.month, 0).getDate()
}

export function ymdEqual(a: YMD, b: YMD): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function addDays(y: YMD, n: number): YMD {
  const d = ymdToDate(y)
  d.setDate(d.getDate() + n)
  return dateToYmd(d)
}

export function addMonths(y: YMD, n: number): YMD {
  const first = ymdToDate({ year: y.year, month: y.month, day: 1 })
  first.setMonth(first.getMonth() + n)
  const ymd = dateToYmd(first)
  const maxDay = daysInMonth(ymd)
  return { year: ymd.year, month: ymd.month, day: Math.min(y.day, maxDay) }
}

export function addYears(y: YMD, n: number): YMD {
  return { year: y.year + n, month: y.month, day: Math.min(y.day, daysInMonth({ year: y.year + n, month: y.month, day: 1 })) }
}

/** Offset in days from the Monday of the week containing `y` (Mon-first). */
export function weekdayIndexMon(y: YMD): number {
  return (new Date(y.year, y.month - 1, y.day).getDay() + 6) % 7 // Sun=0 → shift Mon=0
}

/** The Monday that starts the week containing `y`. */
export function weekStart(y: YMD): YMD {
  return addDays(y, -weekdayIndexMon(y))
}

/** A full ISO-style week: Monday → Sunday. */
export function weekWindow(anchor: YMD): YMD[] {
  const start = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/**
 * A month grid as an array of weeks (each 7 YMDs, Monday-first). Days outside
 * the month are included so the grid stays a clean rectangle (Linear tiles).
 */
export function monthGrid(anchor: YMD): YMD[][] {
  const first = { year: anchor.year, month: anchor.month, day: 1 }
  const start = weekStart(first) // Monday on or before the 1st
  const dim = daysInMonth(anchor)
  // number of cells to cover: offset to the 1st, plus all days of the month,
  // rounded up to whole weeks
  const offset = weekdayIndexMon(first)
  const cells = offset + dim
  const rows = Math.ceil(cells / 7)
  const weeks: YMD[][] = []
  let cur = { ...start }
  for (let r = 0; r < rows; r++) {
    const week: YMD[] = []
    for (let c = 0; c < 7; c++) {
      week.push({ ...cur })
      cur = addDays(cur, 1)
    }
    weeks.push(week)
  }
  return weeks
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function monthLabel(y: YMD): string {
  return `${MONTH_NAMES[y.month - 1]} ${y.year}`
}

export function weekdayShort(i: number): string {
  return WEEKDAY_SHORT[((i % 7) + 7) % 7]!
}

/* ── CalTime + recurrence builders (create/edit form) ───────────────────── */

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

export function hmsFromInput(s?: string): HMS | null {
  if (!s) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute, second: 0 }
}

export function formatHms(h: HMS): string {
  return `${pad2(h.hour)}:${pad2(h.minute)}`
}

/**
 * Build a CalTime the server accepts from the create/edit form: all-day →
 * RFC DATE, otherwise a UTC DATE-TIME instant at the given wall clock.
 */
export function calTimeFromInputs(allDay: boolean, y: YMD, h: HMS | null): CalTime | undefined {
  if (allDay) return { kind: 'date', date: y }
  if (!h) return undefined
  return { kind: 'utc', date: y, time: h }
}

export type RecurFreq = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export const RECUR_FREQS: RecurFreq[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

export function recurLabel(f: RecurFreq): string {
  switch (f) {
    case 'NONE':
      return 'Does not repeat'
    case 'DAILY':
      return 'Daily'
    case 'WEEKLY':
      return 'Weekly'
    case 'MONTHLY':
      return 'Monthly'
    case 'YEARLY':
      return 'Yearly'
  }
}

/** Map a form RecurFreq to an RRULE (compact freq-only form). */
export function ruleForFreq(f: RecurFreq, interval = 1): RecurrenceRule | undefined {
  if (f === 'NONE') return undefined
  return { freq: f, interval: Math.max(1, Math.round(interval)) }
}

/** WEEKDAY codes in UI order (Mon-first, matching the grid). */
export const WEEKDAY_CODES: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** Inverse of ruleForFreq — recover the form frequency from a stored RRULE. */
export function freqFromRule(r?: RecurrenceRule | null): RecurFreq {
  if (!r) return 'NONE'
  switch (r.freq) {
    case 'DAILY':
    case 'WEEKLY':
    case 'MONTHLY':
    case 'YEARLY':
      return r.freq
    default:
      return 'NONE'
  }
}

/**
 * Build a full RRULE from the reccurrence rule-builder state (XER-306).
 * Supports the monthly/day anchors the UI exposes: a normal FREQ, an optional
 * interval, and (WEEKLY only) an explicit BYDAY set. Returns undefined for
 * NONE. The weekly byday defaults to the rule's existing BYDAY; when a caller
 * passes `byday`, it replaces the existing set so multi-select UI round-trips.
 */
export function buildRule(
  freq: RecurFreq,
  opts: { interval?: number; byday?: ByDayEntry[] } = {},
): RecurrenceRule | undefined {
  if (freq === 'NONE') return undefined
  const rule: RecurrenceRule = { freq, interval: Math.max(1, Math.round(opts.interval ?? 1)) }
  if (freq === 'WEEKLY' && opts.byday && opts.byday.length) rule.byday = opts.byday
  return rule
}

/** Read the builder state (freq / interval / weekly byday set) back off a stored rule. */
export function ruleToState(r?: RecurrenceRule | null): { freq: RecurFreq; interval: number; byday: ByDayEntry[] } {
  const freq = freqFromRule(r)
  const interval = r?.interval && r.interval > 0 ? r.interval : 1
  const byday = r?.freq === 'WEEKLY' && r.byday?.length ? r.byday : []
  return { freq, interval, byday }
}

/* ── Alarm helpers (VALARM, relative "minutes before") ──────────────────── */

export const ALARM_PRESETS: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: 'At time of event' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
]

/** Parse an RFC 5545 relative trigger (e.g. "-PT15M", "-PT1H30M") → minutes before. */
export function alarmMinutes(trigger: string): number | null {
  const m = /^(-?)P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/.exec(trigger.trim())
  if (!m) return null
  const days = m[2] ? Number(m[2]) : 0
  const hours = m[3] ? Number(m[3]) : 0
  const mins = m[4] ? Number(m[4]) : 0
  const total = days * 1440 + hours * 60 + mins
  return m[1] ? total : -total
}

/** Build a relative "minutes before" trigger string (negative, ISO 8601). */
export function triggerForMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  let s = '-P'
  if (d) s += `${d}D`
  if (h || mm) {
    s += 'T'
    if (h) s += `${h}H`
    if (mm) s += `${mm}M`
  }
  return s === '-P' ? '-PT0M' : s
}

/** Human label for an alarm's negative minutes (e.g. 15 → "15 minutes before"). */
export function alarmLabelFor(minutes: number): string {
  const preset = ALARM_PRESETS.find((p) => p.minutes === minutes)
  if (preset) return preset.label
  if (minutes <= 0) return 'At time of event'
  return `${minutes} minutes before`
}

/** Extract a display minutes value from a stored alarm (clamp negatives to 0). */
export function alarmMinutesFrom(a?: Alarm | null): number {
  if (!a) return 0
  const m = alarmMinutes(a.trigger)
  return m !== null ? Math.max(0, m) : 0
}

/* ── Attendee helpers (XER-306 full event dialog) ───────────────────────── */

/** Join an item's attendees into a comma-separated email string for the form. */
export function attendeesToText(attendees?: Attendee[] | null): string {
  return (attendees ?? []).map((a) => uriEmail(a.uri)).join(', ')
}

/** Parse a comma/newline-separated email list into RFC 5545 Attendee[] (deduped). */
export function parseAttendeeEmails(text: string): Attendee[] {
  const seen = new Set<string>()
  const out: Attendee[] = []
  for (const tok of text.split(/[\s,;]+/)) {
    const raw = tok.trim()
    if (!raw) continue
    const email = raw.replace(/^mailto:/i, '')
    const lower = email.toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || seen.has(lower)) continue
    seen.add(lower)
    out.push(attendee(email))
  }
  return out
}

/* ── Task list helpers (XER-307 Tasks UI) ──────────────────────────────── */

/** True when a task records a DUE (or DTSTART) — lets dated tasks float first. */
export function hasTaskDue(t: CalendarTask): boolean {
  return !!(t.due ?? t.dtstart)
}

/**
 * Sortable key for a task's due/start instant ('' when none → sorts last within
 * its group). Date-only and dated DUE both compare by calendar day first, then
 * by wall-clock time when present, so overdue/pending tasks order predictably.
 */
export function taskDueKey(t: CalendarTask): string {
  const d = t.due ?? t.dtstart
  if (!d) return ''
  const base = ymdKey(d.date)
  return d.kind === 'date' ? `${base}|` : `${base}|${pad2(d.time.hour)}:${pad2(d.time.minute)}`
}

/**
 * Filter tasks by a case-insensitive substring on summary. An empty query keeps
 * every task; completion state does NOT hide a matching task.
 */
export function filterTasks(tasks: CalendarTask[], q: string): CalendarTask[] {
  const query = q.trim().toLowerCase()
  if (!query) return tasks
  return tasks.filter((t) => (t.summary ?? '').toLowerCase().includes(query))
}

/**
 * Sort the task list (XER-307): open tasks first, then completed, then cancelled;
 * within the open group, tasks with a due/start date float ahead in Earliest-due
 * order. Stable for identical keys (Array#sort is stable in modern engines).
 */
export function sortTasks(tasks: CalendarTask[]): CalendarTask[] {
  const group = (t: CalendarTask): number => {
    if (t.status === 'CANCELLED') return 3
    if (isTaskComplete(t)) return 2
    return hasTaskDue(t) ? 0 : 1
  }
  return [...tasks].sort((a, b) => {
    const ga = group(a)
    const gb = group(b)
    if (ga !== gb) return ga - gb
    const da = taskDueKey(a)
    const db = taskDueKey(b)
    if (da && db) return da.localeCompare(db)
    return da ? -1 : db ? 1 : 0
  })
}

/* ── Occurrence placement ───────────────────────────────────────────────── */

/** Parse the authored wall-clock key "2026-1-5T17:0" → YMD (and HMS). */
export function parseLocalKey(key: string): { ymd: YMD; hms: HMS | null } | null {
  const m = /^(\d+)-(\d+)-(\d+)(?:T(\d+):(\d+))?$/.exec(key)
  if (!m) return null
  const ymd: YMD = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  const hms: HMS | null = m[4] ? { hour: Number(m[4]), minute: Number(m[5] ?? 0), second: 0 } : null
  return { ymd, hms }
}

/** Local (wall-clock) day an occurrence lands on, for grid placement. */
export function occDay(o: Occurrence): YMD {
  const local = parseLocalKey(o.startLocal)
  if (o.allDay && local) return local!.ymd
  const d = new Date(o.startUtc)
  if (Number.isNaN(d.getTime())) return local?.ymd ?? { year: 1970, month: 1, day: 1 }
  return dateToYmd(d)
}

/** Local (wall-clock) time of a timed occurrence. */
export function occTime(o: Occurrence): HMS | null {
  if (o.allDay) return null
  const d = new Date(o.startUtc)
  if (Number.isNaN(d.getTime())) return null
  return { hour: d.getHours(), minute: d.getMinutes(), second: 0 }
}

/** UTC window covering a set of YMDs (for the expand query). */
export function windowUtc(ymds: YMD[]): { start: string; end: string } {
  const sorted = [...ymds].sort((a, b) => ymdKey(a).localeCompare(ymdKey(b)))
  const first = sorted[0] ?? todayYmd()
  const last = sorted[sorted.length - 1] ?? first
  const endDay = addDays(last, 1)
  return { start: `${ymdKey(first)}T00:00:00Z`, end: `${ymdKey(endDay)}T00:00:00Z` }
}

/* ── Small formatting for event chips ───────────────────────────────────── */

/** "09:00–10:30" for a timed event, or "All day" when all-day. */
export function timeRangeLabel(startHms: HMS | null, endHms: HMS | null, allDay: boolean): string {
  if (allDay || !startHms) return 'All day'
  if (endHms) return `${formatHms(startHms)}–${formatHms(endHms)}`
  return formatHms(startHms)
}