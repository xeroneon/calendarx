/**
 * In-memory calendar store + occurrence expansion.
 *
 * `CalendarStore` is the Phase 2.1 backend surface: named calendar collections,
 * CRUD over events + tasks, and UTC-window expansion that resolves recurrence,
 * EXDATE/RDATE and per-instance overrides. The server router (`apps/server`)
 * mounts this behind `/api/calendar` and the CalDAV-flavoured ICS feed.
 *
 * Data is held in memory for the Phase 2.1 milestone (persistence lands with
 * the Postgres work in Phase 0.4/2.x); the store interface is intentionally
 * narrow so a repository can back it without callers changing.
 */
import { randomUUID } from 'node:crypto'
import type { CalendarCollection, CalendarEvent, CalendarItem, CalTime, CalendarTask, Occurrence } from './types.js'
import { calTimeToUtcEpoch, utcEpochToCalTime } from './times.js'
import { durationToSeconds, epochToIsoExtended, epochToIsoUtc, parseDuration } from './datetime.js'
import { expandRule } from './recurrence/expand.js'

export interface CalendarQuery {
  rangeStartUtc?: number
  rangeEndUtc?: number
  kind?: 'event' | 'task' | 'all'
  includeOverlapping?: boolean
}

export function newUid(prefix = 'xer'): string {
  return `${prefix}_${randomUUID()}`
}

export class CalendarStore {
  private calendars = new Map<string, CalendarCollection>()
  private items = new Map<string, CalendarItem>() // by uid

  /* ---------------- calendars ---------------- */

  createCalendar(key: string, displayName: string, extra: Partial<CalendarCollection> = {}): CalendarCollection {
    const cal: CalendarCollection = { key, displayName, ...extra }
    this.calendars.set(key, cal)
    return cal
  }

  listCalendars(): CalendarCollection[] {
    return [...this.calendars.values()]
  }

  getCalendar(key: string): CalendarCollection | undefined {
    return this.calendars.get(key)
  }

  /* ---------------- items ---------------- */

  createItem(calKey: string, item: CalendarItem, uid?: string): CalendarItem {
    if (uid) item.uid = uid
    if (!item.uid) item.uid = newUid(item.kind === 'event' ? 'evt' : 'tdo')
    item.created ??= epochToIsoUtc(Math.floor(Date.now() / 1000))
    item.lastModified ??= item.created
    item.sequence ??= 0
    this.items.set(item.uid, item)
    void calKey
    return item
  }

  updateItem(item: CalendarItem, calKey?: string): CalendarItem {
    item.lastModified = epochToIsoUtc(Math.floor(Date.now() / 1000))
    this.items.set(item.uid, item)
    void calKey
    return item
  }

  getItem(uid: string): CalendarItem | undefined {
    return this.items.get(uid)
  }

  deleteItem(uid: string): boolean {
    return this.items.delete(uid)
  }

  listItems(opts: { kind?: 'event' | 'task' | 'all' } = {}): CalendarItem[] {
    let all = [...this.items.values()]
    if (opts.kind === 'event') all = all.filter((i) => i.kind === 'event')
    else if (opts.kind === 'task') all = all.filter((i) => i.kind === 'task')
    return all
  }

  /* ---------------- expansion ---------------- */

  expand(opts: CalendarQuery = {}): Occurrence[] {
    const items = this.listItems(opts.kind === undefined ? {} : opts)
    const out: Occurrence[] = []
    for (const item of items) {
      out.push(...expandItem(item, opts))
    }
    return out.sort((a, b) => (a.startUtc > b.startUtc ? 1 : a.startUtc < b.startUtc ? -1 : 0))
  }
}

/** Expand a single item into concrete occurrences over a UTC window. */
export function expandItem(item: CalendarItem, opts: CalendarQuery = {}): Occurrence[] {
  const { rangeStartUtc, rangeEndUtc } = opts
  const durSec = itemDurationSeconds(item)

  // Recurring (RRULE) + EXDATE + RDATE
  if (item.recurrence) {
    const dtstart =
      item.kind === 'event' ? item.dtstart : (item.dtstart ?? item.due)
    if (!dtstart) return singleOccurrence(item, durSec, rangeStartUtc, rangeEndUtc, opts)
    const instances = expandRule(item.recurrence, dtstart, { rangeStartUtc, rangeEndUtc })
    const exdates = (item.exdate ?? []).map(calTimeToUtcEpoch).filter((e) => e !== null) as number[]
    const rdates = (item.rdate ?? []).map(calTimeToUtcEpoch).filter((e) => e !== null) as number[]
    const out: Occurrence[] = []
    const seen = new Set<number>()
    for (const inst of instances) {
      if (exdates.includes(inst.startUtc)) continue
      if (seen.has(inst.startUtc)) continue
      seen.add(inst.startUtc)
      const oc = occurrenceFrom(item, durSec, inst.startUtc, inst.recurrenceId, false)
      if (oc && inWindow(oc, rangeStartUtc, rangeEndUtc, opts)) out.push(oc)
    }
    for (const rd of rdates) {
      if (seen.has(rd)) continue
      seen.add(rd)
      const rid = utcEpochToCalTime(dtstart, rd)
      const oc = occurrenceFrom(item, durSec, rd, rid, true)
      if (oc && inWindow(oc, rangeStartUtc, rangeEndUtc, opts)) out.push(oc)
    }
    return out
  }

  return singleOccurrence(item, durSec, rangeStartUtc, rangeEndUtc, opts)
}

function singleOccurrence(
  item: CalendarItem,
  durSec: number,
  rs: number | undefined,
  re: number | undefined,
  opts: CalendarQuery,
): Occurrence[] {
  const start =
    item.kind === 'event' ? item.dtstart : (item.dtstart ?? item.due ?? item.completed)
  if (!start) return []
  const startUtc = calTimeToUtcEpoch(start)
  if (startUtc === null) return []
  const oc = occurrenceFrom(item, durSec, startUtc, start, false)
  return oc && inWindow(oc, rs, re, opts) ? [oc] : []
}

function occurrenceFrom(
  item: CalendarItem,
  durSec: number,
  startUtc: number,
  recurrenceId: CalTime,
  fromRdate: boolean,
): Occurrence | null {
  const template = item.kind === 'event' ? item.dtstart : (item.dtstart ?? item.due)
  if (!template) return null
  const local = utcEpochToCalTime(template, startUtc)
  return {
    uid: item.uid,
    startUtc: epochToIsoExtended(startUtc),
    endUtc: epochToIsoExtended(startUtc + durSec),
    startLocal: calTimeKey(local),
    allDay: template.kind === 'date',
    recurrenceId,
    fromRdate,
  }
}

function calTimeKey(t: CalTime): string {
  if (t.kind === 'date') return `${t.date.year}-${t.date.month}-${t.date.day}`
  return `${t.date.year}-${t.date.month}-${t.date.day}T${t.time.hour}:${t.time.minute}`
}

function inWindow(oc: Occurrence, rs: number | undefined, re: number | undefined, opts: CalendarQuery): boolean {
  const start = epochFromIso(oc.startUtc)
  const end = epochFromIso(oc.endUtc)
  if (re !== undefined && start >= re) return false
  if (rs !== undefined) {
    if (start >= rs) return true
    // include events that start before the window but overlap it
    return opts.includeOverlapping === true && end > rs
  }
  return true
}

function epochFromIso(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

/** Duration (seconds) of an item: DTEND-DTSTART, DURATION, or a sensible default. */
export function itemDurationSeconds(item: CalendarItem): number {
  if (item.kind === 'event') {
    if (item.dtend) {
      const s = calTimeToUtcEpoch(item.dtstart)
      const e = calTimeToUtcEpoch(item.dtend)
      if (s !== null && e !== null) return Math.max(0, e - s)
    }
    if (item.duration) {
      const d = parseDuration(item.duration)
      if (d) return durationToSeconds(d)
    }
    return item.dtstart.kind === 'date' ? 86_400 : 0
  }
  // task
  if (item.due && item.dtstart) {
    const s = calTimeToUtcEpoch(item.dtstart)
    const e = calTimeToUtcEpoch(item.due)
    if (s !== null && e !== null) return Math.max(0, e - s)
  }
  if (item.duration) {
    const d = parseDuration(item.duration)
    if (d) return durationToSeconds(d)
  }
  return 0
}

export function toEvent(i: CalendarItem): CalendarEvent | undefined {
  return i.kind === 'event' ? i : undefined
}

export function toTask(i: CalendarItem): CalendarTask | undefined {
  return i.kind === 'task' ? i : undefined
}