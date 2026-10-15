/**
 * RFC 5545 iCal parser — the inverse of `serialize.ts`.
 *
 * Parses a `VCALENDAR` payload (unfolding + unescaping + component walk) into
 * CalendarItem models. Used to round-trip the feed and to ingest existing CalDAV
 * exports (e.g. a Nextcloud calendar) so "existing consumers keep working".
 * The parser is lenient: unknown components/properties are skipped, and
 * malformed single lines do not abort the whole payload.
 */
import type {
  Alarm,
  Attendee,
  CalendarEvent,
  CalendarItem,
  CalendarTask,
  CalTime,
  Organizer,
  ParticipationRole,
  ParticipationStatus,
  RecurrenceRule,
} from '../types.js'
import { parseCalTime, parseDuration } from '../datetime.js'
import { parseRule } from '../recurrence/rrule.js'
import { unescapeText } from './serialize.js'

export interface ParsedLine {
  name: string
  params: Record<string, string>
  value: string
}

/** Split content lines + unfold continuation lines (leading space/tab). */
export function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines: string[] = []
  for (const ln of raw.split('\n')) {
    if (ln.startsWith(' ') || ln.startsWith('\t')) {
      const prev = lines.pop()
      lines.push(prev !== undefined ? prev + ln.slice(1) : ln.slice(1))
    } else {
      lines.push(ln)
    }
  }
  return lines.filter((l) => l.length > 0)
}

/** Parse a single content line into name / params / value. */
export function parseLine(line: string): ParsedLine {
  // find the first unquoted ':'
  let inQ = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
      continue
    }
    if (c === ':' && !inQ) {
      colon = i
      break
    }
  }
  if (colon < 0) return { name: line.trim().toUpperCase(), params: {}, value: '' }
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  // head = NAME;PARAM=V;PARAM=V
  const seg = head.split(';')
  const name = seg[0]!.trim().toUpperCase()
  const params: Record<string, string> = {}
  for (const p of seg.slice(1)) {
    const eq = p.indexOf('=')
    if (eq < 0) continue
    const k = p.slice(0, eq).toUpperCase()
    let v = p.slice(eq + 1)
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    params[k] = unescapeText(v)
  }
  return { name, params, value }
}

interface RawComponent {
  name: string
  props: ParsedLine[]
  children: RawComponent[]
}

function parseComponents(lines: ParsedLine[]): RawComponent[] {
  const stack: RawComponent[] = []
  const roots: RawComponent[] = []
  for (const l of lines) {
    if (l.name === 'BEGIN') {
      const comp: RawComponent = { name: l.value.toUpperCase(), props: [], children: [] }
      if (stack.length) stack[stack.length - 1]!.children.push(comp)
      else roots.push(comp)
      stack.push(comp)
    } else if (l.name === 'END') {
      stack.pop()
    } else {
      const top = stack[stack.length - 1]
      if (top) top.props.push(l)
    }
  }
  return roots
}

export function parseCalendar(text: string): CalendarItem[] {
  const lines = unfoldLines(text).map(parseLine)
  const root = parseComponents(lines).find((c) => c.name.toUpperCase() === 'VCALENDAR')
  if (!root) return []
  const items: CalendarItem[] = []
  for (const comp of root.children) {
    const cn = comp.name.toUpperCase()
    if (cn === 'VEVENT') {
      const ev = parseEvent(comp)
      if (ev) items.push(ev)
    } else if (cn === 'VTODO') {
      const tk = parseTask(comp)
      if (tk) items.push(tk)
    }
  }
  return items
}

function firstProp(comp: RawComponent, name: string): ParsedLine | undefined {
  return comp.props.find((p) => p.name === name)
}

function propValues(comp: RawComponent, name: string): string[] {
  return comp.props.filter((p) => p.name === name).map((p) => p.value)
}

function textOf(p: ParsedLine | undefined): string | undefined {
  return p === undefined ? undefined : unescapeText(p.value)
}

function calTimeOf(p: ParsedLine | undefined): CalTime | undefined {
  if (p === undefined) return undefined
  const t = parseCalTime(p.value)
  if (!t) return undefined
  if (t.kind === 'floating' && p.params['TZID']) {
    return { kind: 'zoned', tzid: p.params['TZID'], date: t.date, time: t.time }
  }
  return t
}

function attendeeOf(p: ParsedLine, uri: string): Attendee {
  const a: Attendee = { uri }
  if (p.params['CN']) a.cn = p.params['CN']
  if (p.params['ROLE']) a.role = p.params['ROLE'] as ParticipationRole
  if (p.params['PARTSTAT']) a.partstat = p.params['PARTSTAT'] as ParticipationStatus
  if (p.params['RSVP']) a.rsvp = p.params['RSVP'].toUpperCase() === 'TRUE'
  if (p.params['MEMBER']) a.member = p.params['MEMBER']
  if (p.params['DELEGATED-TO']) a.delegatedTo = p.params['DELEGATED-TO']
  if (p.params['DELEGATED-FROM']) a.delegatedFrom = p.params['DELEGATED-FROM']
  if (p.params['SENT-BY']) a.sentBy = p.params['SENT-BY']
  return a
}

function organizerOf(p: ParsedLine | undefined): Organizer | undefined {
  if (!p) return undefined
  const o: Organizer = { uri: p.value }
  if (p.params['CN']) o.cn = p.params['CN']
  if (p.params['SENT-BY']) o.sentBy = p.params['SENT-BY']
  return o
}

function ruleOf(p: ParsedLine | undefined): RecurrenceRule | undefined {
  if (p === undefined) return undefined
  const r = parseRule(p.value)
  return r === null ? undefined : r
}

function categoriesOf(comp: RawComponent): string[] | undefined {
  const v = propValues(comp, 'CATEGORIES')
  if (!v.length) return undefined
  return v.flatMap((s) => s.split(',').map(unescapeText)).filter(Boolean)
}

function exdatesOf(comp: RawComponent): CalTime[] | undefined {
  const linesp = comp.props.filter((p) => p.name === 'EXDATE').map(calTimeOf).filter((t) => t !== undefined)
  return linesp.length ? (linesp as CalTime[]) : undefined
}

function rdatesOf(comp: RawComponent): CalTime[] | undefined {
  const linesp = comp.props.filter((p) => p.name === 'RDATE').map(calTimeOf).filter((t) => t !== undefined)
  return linesp.length ? (linesp as CalTime[]) : undefined
}

function alarmsOf(comp: RawComponent): Alarm[] | undefined {
  const alarms: Alarm[] = []
  for (const child of comp.children) {
    if (child.name.toUpperCase() !== 'VALARM') continue
    const action = textOf(firstProp(child, 'ACTION')) ?? 'DISPLAY'
    const trigger = textOf(firstProp(child, 'TRIGGER'))
    if (!trigger) continue
    const alarm: Alarm = { action: action as Alarm['action'], trigger }
    const desc = textOf(firstProp(child, 'DESCRIPTION'))
    if (desc) alarm.description = desc
    alarms.push(alarm)
  }
  return alarms.length ? alarms : undefined
}

function parseEvent(comp: RawComponent): CalendarEvent | null {
  const dtstart = calTimeOf(comp.props.find((x) => x.name === 'DTSTART'))
  if (!dtstart) return null
  const ev: CalendarEvent = { kind: 'event', uid: textOf(firstProp(comp, 'UID')) ?? 'x', dtstart }
  applyCommon(ev, comp)
  const dtend = calTimeOf(comp.props.find((x) => x.name === 'DTEND'))
  if (dtend) ev.dtend = dtend
  const dur = textOf(firstProp(comp, 'DURATION'))
  if (dur) {
    const d = parseDuration(dur)
    if (d) ev.duration = dur
  }
  const st = textOf(firstProp(comp, 'STATUS'))
  if (st) ev.status = st as CalendarEvent['status']
  const transp = textOf(firstProp(comp, 'TRANSP'))
  if (transp) ev.transparency = transp as CalendarEvent['transparency']
  const alarms = alarmsOf(comp)
  if (alarms) ev.alarms = alarms
  return ev
}

function parseTask(comp: RawComponent): CalendarTask | null {
  const tk: CalendarTask = { kind: 'task', uid: textOf(firstProp(comp, 'UID')) ?? 'x' }
  applyCommon(tk, comp)
  const dtstart = calTimeOf(comp.props.find((x) => x.name === 'DTSTART'))
  if (dtstart) tk.dtstart = dtstart
  const due = calTimeOf(comp.props.find((x) => x.name === 'DUE'))
  if (due) tk.due = due
  const dur = textOf(firstProp(comp, 'DURATION'))
  if (dur) {
    const d = parseDuration(dur)
    if (d) tk.duration = dur
  }
  const completed = calTimeOf(comp.props.find((x) => x.name === 'COMPLETED'))
  if (completed) tk.completed = completed
  const pc = textOf(firstProp(comp, 'PERCENT-COMPLETE'))
  if (pc) {
    const n = Number(pc)
    if (!Number.isNaN(n)) tk.percentComplete = n
  }
  const st = textOf(firstProp(comp, 'STATUS'))
  if (st) tk.status = st as CalendarTask['status']
  const pri = textOf(firstProp(comp, 'PRIORITY'))
  if (pri) {
    const n = Number(pri)
    if (!Number.isNaN(n)) tk.priority = n
  }
  const alarms = alarmsOf(comp)
  if (alarms) tk.alarms = alarms
  return tk
}

function applyCommon(item: CalendarEvent | CalendarTask, comp: RawComponent): void {
  item.summary = textOf(firstProp(comp, 'SUMMARY'))
  item.description = textOf(firstProp(comp, 'DESCRIPTION'))
  item.location = textOf(firstProp(comp, 'LOCATION'))
  item.url = textOf(firstProp(comp, 'URL'))
  const cls = textOf(firstProp(comp, 'CLASS'))
  if (cls === 'PUBLIC' || cls === 'PRIVATE' || cls === 'CONFIDENTIAL') item.class = cls
  item.organizer = organizerOf(firstProp(comp, 'ORGANIZER'))
  const atts = comp.props.filter((x) => x.name === 'ATTENDEE')
  if (atts.length) item.attendees = atts.map((a) => attendeeOf(a, a.value))
  item.created = textOf(firstProp(comp, 'CREATED'))
  item.lastModified = textOf(firstProp(comp, 'LAST-MODIFIED'))
  const seq = textOf(firstProp(comp, 'SEQUENCE'))
  if (seq) {
    const n = Number(seq)
    if (!Number.isNaN(n)) item.sequence = n
  }
  item.recurrence = ruleOf(firstProp(comp, 'RRULE'))
  const rid = calTimeOf(comp.props.find((x) => x.name === 'RECURRENCE-ID'))
  if (rid) item.recurrenceId = rid
  item.exdate = exdatesOf(comp)
  item.rdate = rdatesOf(comp)
  item.categories = categoriesOf(comp)
}

/** Extract a human-readable feed title (for logging/tests). */
export function feedSummary(items: CalendarItem[]): string {
  const evs = items.filter((i) => i.kind === 'event').length
  const tks = items.length - evs
  return `${items.length} item(s) [${evs} event(s), ${tks} task(s)]`
}