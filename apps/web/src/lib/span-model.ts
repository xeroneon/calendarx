/**
 * Time-grid span model (XER-549).
 *
 * The UI SDK's `createSpans`/`stackSpans` work in "the track's own units" —
 * for a calendar that is minutes from midnight, one track per day. This module
 * is the only place that translates between that geometry and our CalDAV
 * occurrence/item data, so the drag math stays pure and unit-testable.
 */
import type { CalendarItem, Occurrence } from '@calendarx/sdk'
import type { CalTime, HMS, YMD } from '@calendarx/calendar'
import { calTimeFromInputs, occDay, occTime, ymdKey, parseYmdKey } from './calendar'

/** A day has 1440 minutes; spans never cross midnight (one track per day). */
export const DAY_MINUTES = 1440

/** Grid snap / minimum event length, in minutes. */
export const GRID_STEP = 15

/** One event as the time grid draws it: a SDK `Span` plus what we render. */
export interface EventSpan {
  id: string
  track: string
  start: number
  end: number
  summary: string
  color: string
  kind: 'event' | 'task'
  /** Recurring occurrences can't be dragged: a move would rewrite the master. */
  locked: boolean
}

/** `HH:MM` → minutes from midnight. */
export function minutesOfHms(h: HMS): number {
  return h.hour * 60 + h.minute
}

/** Minutes from midnight → `HH:MM`, clamped into a single day. */
export function hmsOfMinutes(minutes: number): HMS {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)))
  return { hour: Math.floor(clamped / 60), minute: clamped % 60, second: 0 }
}

/** Stable span id for an occurrence (uid + its local start key). */
export function spanIdFor(occurrence: Occurrence): string {
  return `${occurrence.uid}|${occurrence.startLocal}`
}

/** ISO duration ("PT30M", "PT1H30M", "P1DT2H", "P1W") → integer minutes, null when absent. */
export function durationMinutes(d?: string | null): number | null {
  if (!d) return null
  if (d === 'P1W') return 10080
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(d.trim())
  if (!m) return null
  const [, weeks, days, hours, minutes, seconds] = m
  if (!weeks && !days && !hours && !minutes && !seconds) return null
  const total =
    Number(weeks ?? 0) * 10080 +
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Math.round(Number(seconds ?? 0) / 60)
  return total
}

/** Build the RFC 5545 duration string for an event of `minutes`. */
export function durationFromMinutes(minutes: number, allDay = false): string {
  const mins = Math.max(GRID_STEP, Math.round(minutes))
  return allDay ? `P${Math.max(1, Math.round(mins / DAY_MINUTES))}D` : `PT${mins}M`
}

/**
 * Project an occurrence onto the grid. Returns null for all-day occurrences
 * (they render in the all-day strip, not as timed spans).
 */
export function occToSpan(occurrence: Occurrence, item: CalendarItem | undefined, color: string): EventSpan | null {
  if (occurrence.allDay) return null
  const startTime = occTime(occurrence)
  if (!startTime) return null
  const start = minutesOfHms(startTime)
  const minutes = durationMinutes(item?.duration) ?? 60
  const end = Math.min(DAY_MINUTES, Math.max(start + GRID_STEP, start + minutes))
  const kind = item?.kind === 'task' ? 'task' : 'event'
  return {
    id: spanIdFor(occurrence),
    track: ymdKey(occDay(occurrence)),
    start,
    end,
    summary: item?.summary ?? occurrence.uid,
    color,
    kind,
    locked: kind === 'task' || !!item?.recurrence,
  }
}

/** Everything on the grid for a set of occurrences. */
export function occurrencesToSpans(
  occurrences: Occurrence[],
  byUid: Map<string, CalendarItem>,
  color: string,
): EventSpan[] {
  const spans: EventSpan[] = []
  for (const o of occurrences) {
    const span = occToSpan(o, byUid.get(o.uid), color)
    if (span) spans.push(span)
  }
  return spans
}

/** The day (track key) a span sits on. */
export function trackToYmd(track: string): YMD | null {
  return parseYmdKey(track)
}

/** A span's wall-clock start/end, for the edit dialog and the server patch. */
export function spanToTimes(span: { track: string; start: number; end: number }, timeZone?: string): { start: CalTime; duration: string } | null {
  const day = parseYmdKey(span.track)
  if (!day) return null
  const start = calTimeFromInputs(false, day, hmsOfMinutes(span.start), timeZone)
  if (!start) return null
  return { start, duration: durationFromMinutes(span.end - span.start) }
}

/** "09:00" label for a span edge. */
export function spanTimeLabel(minutes: number): string {
  const h = hmsOfMinutes(minutes)
  return `${String(h.hour).padStart(2, '0')}:${String(h.minute).padStart(2, '0')}`
}
