/**
 * RFC 5545 text (iCal) serialization.
 *
 * Renders CalendarItem(s) into a valid `VCALENDAR` payload (CRLF, 75-octet line
 * folding, TEXT/param escaping, RFC 4791-ish properties) and emits a VTIMEZONE
 * for each distinct TZID actually used, derived from the committed IANA table.
 */
import type { Alarm, Attendee, CalendarEvent, CalendarItem, CalendarTask, CalTime, Organizer } from '../types.js'
import { calTimeToIcal, calTimeTzidParam, nowIsoUtc } from '../datetime.js'
import { serializeRule } from '../recurrence/rrule.js'
import { offsetAtUtc, zoneTransitions } from '../timezone/index.js'

export const XC_PRODID = '-//Xeroneon//Xeroneon Cloud//EN'

export const LINE_MAX = 75

/* ---------------- escaping & folding ---------------- */

/** Escape a TEXT property value per RFC 5545. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

/** Unescape a TEXT property value. */
export function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\;/g, ';').replace(/\\,/g, ',').replace(/\\\\/g, '\\')
}

/** Fold a content line at LINE_MAX octets with CRLF + single space. */
export function foldLine(line: string): string {
  if (line.length <= LINE_MAX) return line + '\r\n'
  const out: string[] = []
  let cur = line
  while (cur.length > LINE_MAX) {
    out.push(cur.slice(0, LINE_MAX))
    cur = ' ' + cur.slice(LINE_MAX)
  }
  out.push(cur)
  return out.join('\r\n') + '\r\n'
}

/** Build a content line `NAME;PARAM=V;...:value` with escaping + folding. */
export function contentLine(name: string, value: string, params: Array<[string, string]> = []): string {
  let head = name
  for (const [k, v] of params) {
    if (v !== undefined && v !== null && v !== '') head += `;${k}=${escapeParam(v)}`
  }
  return foldLine(`${head}:${value}`)
}

function escapeParam(v: string): string {
  // Parameter values that aren't a simple token get double-quoted; plain values
  // (& in URI) kept raw. Escape bare double quotes.
  const clean = v.replace(/"/g, "'")
  return /^[-A-Za-z0-9._:/+*'-]+$/.test(clean) && !/[:;]/u.test(clean) && !/[,]/.test(clean)
    ? clean
    : `"${clean}"`
}

function datetimeParams(t: CalTime): Array<[string, string]> {
  const tzid = calTimeTzidParam(t)
  return tzid ? [['TZID', tzid]] : []
}

/* ---------------- main entry ---------------- */

export interface SerializeOptions {
  method?: 'PUBLISH' | 'REQUEST' | 'REPLY' | 'CANCEL' | 'ADD' | 'REFRESH' | 'COUNTER'
  prodid?: string
  /** Freeform calendar name used for an X-WR-CALNAME (helpful for consumers). */
  calendarName?: string
  /** UTC instant for DTSTAMP/CREATED/LAST-MODIFIED defaults. */
  now?: string
  includeVtimezone?: boolean
}

export function serializeCalendar(items: CalendarItem[], opts: SerializeOptions = {}): string {
  const now = opts.now ?? nowIsoUtc()
  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push(`PRODID:${opts.prodid ?? XC_PRODID}`)
  lines.push('CALSCALE:GREGORIAN')
  if (opts.method) lines.push(`METHOD:${opts.method}`)
  if (opts.calendarName) lines.push(contentLine('X-WR-CALNAME', opts.calendarName))

  if (opts.includeVtimezone !== false) {
    for (const vz of buildVTimezones(items)) {
      lines.push(...vz)
    }
  }

  for (const item of items) {
    if (item.kind === 'event') lines.push(...serializeEvent(item, now))
    else lines.push(...serializeTask(item, now))
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('')
}

/* ---------------- VEVENT ---------------- */

export function serializeEvent(ev: CalendarEvent, now: string): string[] {
  const l: string[] = ['BEGIN:VEVENT']
  l.push(`UID:${ev.uid}`)
  l.push(`DTSTAMP:${ev.created ?? now}`)
  if (ev.created) l.push(`CREATED:${ev.created}`)
  l.push(`LAST-MODIFIED:${ev.lastModified ?? now}`)
  l.push(`SEQUENCE:${ev.sequence ?? 0}`)
  l.push(contentLine('DTSTART', calTimeToIcal(ev.dtstart), datetimeParams(ev.dtstart)))
  if (ev.dtend) l.push(contentLine('DTEND', calTimeToIcal(ev.dtend), datetimeParams(ev.dtend)))
  else if (ev.duration) l.push(`DURATION:${ev.duration}`)
  if (ev.summary) l.push(contentLine('SUMMARY', escapeText(ev.summary)))
  if (ev.description) l.push(contentLine('DESCRIPTION', escapeText(ev.description)))
  if (ev.location) l.push(contentLine('LOCATION', escapeText(ev.location)))
  if (ev.categories && ev.categories.length) l.push(contentLine('CATEGORIES', ev.categories.map(escapeText).join(',')))
  if (ev.url) l.push(contentLine('URL', ev.url))
  if (ev.class) l.push(`CLASS:${ev.class}`)
  if (ev.status) l.push(`STATUS:${ev.status}`)
  if (ev.transparency) l.push(`TRANSP:${ev.transparency}`)
  if (ev.organizer) l.push(serializeOrganizer(ev.organizer))
  for (const a of ev.attendees ?? []) l.push(serializeAttendee(a))
  if (ev.recurrence) l.push(contentLine('RRULE', serializeRule(ev.recurrence)))
  if (ev.recurrenceId) l.push(serializeRecurrenceId(ev.recurrenceId))
  for (const ex of ev.exdate ?? []) l.push(contentLine('EXDATE', calTimeToIcal(ex), datetimeParams(ex)))
  for (const rd of ev.rdate ?? []) l.push(contentLine('RDATE', calTimeToIcal(rd), datetimeParams(rd)))
  for (const alarm of ev.alarms ?? []) l.push(...serializeAlarm(alarm))
  l.push('END:VEVENT')
  return l
}

/* ---------------- VTODO ---------------- */

function serializeTask(t: CalendarTask, now: string): string[] {
  const l: string[] = ['BEGIN:VTODO']
  l.push(`UID:${t.uid}`)
  l.push(`DTSTAMP:${t.created ?? now}`)
  if (t.created) l.push(`CREATED:${t.created}`)
  l.push(`LAST-MODIFIED:${t.lastModified ?? now}`)
  l.push(`SEQUENCE:${t.sequence ?? 0}`)
  if (t.dtstart) l.push(contentLine('DTSTART', calTimeToIcal(t.dtstart), datetimeParams(t.dtstart)))
  if (t.due) l.push(contentLine('DUE', calTimeToIcal(t.due), datetimeParams(t.due)))
  else if (t.duration) l.push(`DURATION:${t.duration}`)
  if (t.completed) l.push(contentLine('COMPLETED', calTimeToIcal(t.completed), datetimeParams(t.completed)))
  if (t.percentComplete !== undefined && t.percentComplete !== null)
    l.push(`PERCENT-COMPLETE:${Math.max(0, Math.min(100, Math.round(t.percentComplete)))}`)
  if (t.status) l.push(`STATUS:${t.status}`)
  if (t.priority !== undefined && t.priority !== null) l.push(`PRIORITY:${t.priority}`)
  if (t.summary) l.push(contentLine('SUMMARY', escapeText(t.summary)))
  if (t.description) l.push(contentLine('DESCRIPTION', escapeText(t.description)))
  if (t.location) l.push(contentLine('LOCATION', escapeText(t.location)))
  if (t.categories && t.categories.length) l.push(contentLine('CATEGORIES', t.categories.map(escapeText).join(',')))
  if (t.url) l.push(contentLine('URL', t.url))
  if (t.class) l.push(`CLASS:${t.class}`)
  if (t.organizer) l.push(serializeOrganizer(t.organizer))
  for (const a of t.attendees ?? []) l.push(serializeAttendee(a))
  if (t.recurrence) l.push(contentLine('RRULE', serializeRule(t.recurrence)))
  if (t.recurrenceId) l.push(serializeRecurrenceId(t.recurrenceId))
  for (const ex of t.exdate ?? []) l.push(contentLine('EXDATE', calTimeToIcal(ex), datetimeParams(ex)))
  for (const rd of t.rdate ?? []) l.push(contentLine('RDATE', calTimeToIcal(rd), datetimeParams(rd)))
  for (const alarm of t.alarms ?? []) l.push(...serializeAlarm(alarm))
  l.push('END:VTODO')
  return l
}

/* ---------------- shared sub-serializers ---------------- */

function serializeOrganizer(o: Organizer): string {
  const params: Array<[string, string]> = []
  if (o.cn) params.push(['CN', o.cn])
  if (o.sentBy) params.push(['SENT-BY', o.sentBy])
  return contentLine('ORGANIZER', o.uri, params)
}

function serializeAttendee(a: Attendee): string {
  const params: Array<[string, string]> = []
  if (a.cn) params.push(['CN', a.cn])
  if (a.role) params.push(['ROLE', a.role])
  if (a.partstat) params.push(['PARTSTAT', a.partstat])
  if (a.rsvp !== undefined) params.push(['RSVP', a.rsvp ? 'TRUE' : 'FALSE'])
  if (a.member) params.push(['MEMBER', a.member])
  if (a.delegatedTo) params.push(['DELEGATED-TO', a.delegatedTo])
  if (a.delegatedFrom) params.push(['DELEGATED-FROM', a.delegatedFrom])
  if (a.sentBy) params.push(['SENT-BY', a.sentBy])
  return contentLine('ATTENDEE', a.uri.trim(), params)
}

function serializeRecurrenceId(t: CalTime): string {
  return contentLine('RECURRENCE-ID', calTimeToIcal(t), datetimeParams(t))
}

function serializeAlarm(a: Alarm): string[] {
  const l: string[] = ['BEGIN:VALARM']
  l.push(`ACTION:${a.action}`)
  l.push(contentLine('TRIGGER', a.trigger))
  if (a.description) l.push(contentLine('DESCRIPTION', escapeText(a.description)))
  l.push('END:VALARM')
  return l
}

/* ---------------- VTIMEZONE ---------------- */

/**
 * Build VTIMEZONE block lines for every distinct TZID used by the items.
 * Non-DST zones emit a single STANDARD component; DST zones emit STANDARD +
 * DAYLIGHT with a best-effort RRULE derived from recent transitions in the
 * committed table (correct for the standard North-America/Europe families).
 */
function buildVTimezones(items: CalendarItem[]): string[][] {
  const used = new Set<string>()
  for (const item of items) collectTzids(item, used)
  const blocks: string[][] = []
  for (const tzid of used) {
    if (tzid === '' || tzid === 'UTC' || tzid === 'Z') continue
    const b = buildVTimezone(tzid)
    if (b) blocks.push(b)
  }
  return blocks
}

function collectTzids(item: CalendarItem, acc: Set<string>): void {
  const times: Array<CalTime | undefined> = []
  if (item.kind === 'event') {
    times.push(item.dtstart, item.dtend)
  } else {
    times.push(item.dtstart, item.due, item.completed)
  }
  times.push(item.recurrenceId)
  for (const t of times) {
    if (t?.kind === 'zoned') acc.add(t.tzid)
  }
  for (const ex of item.exdate ?? []) if (ex.kind === 'zoned') acc.add(ex.tzid)
  for (const rd of item.rdate ?? []) if (rd.kind === 'zoned') acc.add(rd.tzid)
}

function buildVTimezone(tzid: string): string[] | null {
  let stdOff: number | null = null
  let dstOff: number | null = null
  // Sample fixed Jan 15 / Jul 15 instants over recent years to find the
  // standard (winter) and daylight (summer) offsets.
  const thisYear = new Date().getFullYear()
  for (let y = thisYear - 14; y <= thisYear; y++) {
    const w = offsetAtUtc(tzid, Date.UTC(y, 0, 15) / 1000)
    const s = offsetAtUtc(tzid, Date.UTC(y, 6, 15) / 1000)
    if (w === null || s === null) break
    if (stdOff === null || w < stdOff) stdOff = w
    if (dstOff === null || s > dstOff) dstOff = s
  }
  if (stdOff === null) return null
  if (dstOff === null) dstOff = stdOff
  const hasDst = dstOff !== stdOff

  const lines: string[] = ['BEGIN:VTIMEZONE']
  lines.push(contentLine('TZID', tzid))

  if (!hasDst) {
    lines.push('BEGIN:STANDARD')
    lines.push(`TZOFFSETFROM:${formatOffset(stdOff)}`)
    lines.push(`TZOFFSETTO:${formatOffset(stdOff)}`)
    lines.push(`TZNAME:${tzidToAbbr(tzid, stdOff)}`)
    lines.push('DTSTART:19700101T000000')
    lines.push('END:STANDARD')
    lines.push('END:VTIMEZONE')
    return lines
  }

  // DST zone: derive start/end (month + nth-weekday + time) from transitions.
  const pat = deriveDstPattern(tzid)
  if (pat) {
    lines.push('BEGIN:DAYLIGHT')
    lines.push(`TZOFFSETFROM:${formatOffset(stdOff)}`)
    lines.push(`TZOFFSETTO:${formatOffset(dstOff)}`)
    lines.push(`TZNAME:${tzidToAbbr(tzid, dstOff)}`)
    lines.push(`DTSTART:${pat.daylight.start}`)
    lines.push(`RRULE:FREQ=YEARLY;BYMONTH=${pat.daylight.month};BYDAY=${pat.daylight.byday}`)
    lines.push('END:DAYLIGHT')
    lines.push('BEGIN:STANDARD')
    lines.push(`TZOFFSETFROM:${formatOffset(dstOff)}`)
    lines.push(`TZOFFSETTO:${formatOffset(stdOff)}`)
    lines.push(`TZNAME:${tzidToAbbr(tzid, stdOff)}`)
    lines.push(`DTSTART:${pat.standard.start}`)
    lines.push(`RRULE:FREQ=YEARLY;BYMONTH=${pat.standard.month};BYDAY=${pat.standard.byday}`)
    lines.push('END:STANDARD')
  } else {
    // Approximate fallback: single STANDARD at current offset.
    lines.push('BEGIN:STANDARD')
    lines.push(`TZOFFSETFROM:${formatOffset(stdOff)}`)
    lines.push(`TZOFFSETTO:${formatOffset(stdOff)}`)
    lines.push(`TZNAME:${tzidToAbbr(tzid, stdOff)}`)
    lines.push('DTSTART:19700101T000000')
    lines.push('END:STANDARD')
  }
  lines.push('END:VTIMEZONE')
  return lines
}

interface DstPattern {
  daylight: { month: number; byday: string; start: string }
  standard: { month: number; byday: string; start: string }
}

/** Detect recurring DST start/end as RRULE-friendly nth-weekday-of-month. */
function deriveDstPattern(tzid: string): DstPattern | null {
  interface Tx {
    month: number
    nth: number // +n = nth weekday, -n = nth from last
    dow: number // 0=MO
    hms: string
  }
  const recent = (years: number): { daylight: Tx[]; standard: Tx[] } => {
    const day: Tx[] = []
    const std: Tx[] = []
    const year = new Date().getFullYear()
    for (let y = year - years; y <= year; y++) {
      const changes = transitionsInYear(tzid, y)
      if (!changes) return { daylight: day, standard: std }
      const standoffs = changes.filter((c) => !c.isDst)
      const dstoffs = changes.filter((c) => c.isDst)
      // The FIRST DST transition of the year = DST start; the first back = end.
      // (winter-time transitions that aren't the standard DST pair are ignored.)
      const dstStart = dstoffs.sort((a, b) => a.epoch - b.epoch)[0]
      const stdEnd = standoffs.sort((a, b) => a.epoch - b.epoch)[0]
      if (dstStart) day.push(txOf(dstStart))
      if (stdEnd) std.push(txOf(stdEnd))
    }
    return { daylight: day, standard: std }
  }

  const { daylight, standard } = recent(8)
  if (daylight.length < 3 || standard.length < 3) return null
  const dPrime = majorityTx(daylight)
  const sPrime = majorityTx(standard)
  if (!dPrime || !sPrime) return null
  const dowMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  const d = dPrime
  const s = sPrime
  return {
    daylight: {
      month: d.month,
      byday: `${d.nth}${dowMap[d.dow]}`,
      start: `19700101T${d.hms}`,
    },
    standard: {
      month: s.month,
      byday: `${s.nth}${dowMap[s.dow]}`,
      start: `19700101T${s.hms}`,
    },
  }
}

interface Change {
  epoch: number
  isDst: boolean
  /** Offset in effect BEFORE the transition (used to derive local wall time). */
  preOffset: number
}

function transitionsInYear(tzid: string, year: number): Change[] | null {
  const segs = zoneTransitions(tzid)
  if (!segs) return null
  const startU = Date.UTC(year, 0, 1) / 1000
  const endU = Date.UTC(year, 11, 31, 23, 59, 59) / 1000
  const out: Change[] = []
  // previous segment = the last one starting at or before startU
  let prevOff = 0
  let prevDst = false
  for (const s of segs) {
    if (s[0] <= startU) {
      prevOff = s[1]
      prevDst = s[2] === 1
    } else {
      break
    }
  }
  for (const s of segs) {
    const [epoch, off, dst] = s
    if (epoch <= startU) continue
    if (epoch > endU) break
    const isDst = dst === 1
    if (isDst !== prevDst) {
      out.push({ epoch, isDst, preOffset: prevOff })
    }
    prevDst = isDst
    prevOff = off
  }
  return out.length ? out : null
}

/** Derive (month, nth-weekday, dow, local hms) of a transition. */
function txOf(c: Change): { month: number; nth: number; dow: number; hms: string } {
  const localEpoch = c.epoch + c.preOffset // wall-clock encoded as UTC
  const d = new Date(localEpoch * 1000)
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const dow = (d.getUTCDay() + 6) % 7 // 0=MO
  const firstDow0 = (new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getUTCDay() + 6) % 7
  const nth = Math.floor((day - 1 + firstDow0) / 7) + 1
  const hms = `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00`
  return { month, nth, dow, hms }
}

function majorityTx(seq: Array<{ month: number; nth: number; dow: number; hms: string }>) {
  const counts = new Map<string, { month: number; nth: number; dow: number; hms: string; n: number }>()
  for (const tx of seq) {
    const key = `${tx.month}-${tx.nth}-${tx.dow}`
    const cur = counts.get(key)
    if (cur) cur.n++
    else counts.set(key, { month: tx.month, nth: tx.nth, dow: tx.dow, hms: tx.hms, n: 1 })
  }
  let best: { month: number; nth: number; dow: number; hms: string; n: number } | undefined
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v
  }
  return best && best.n >= seq.length * 0.6 ? best : null
}

function formatOffset(sec: number): string {
  const sign = sec < 0 ? '-' : '+'
  const a = Math.abs(sec)
  const h = Math.floor(a / 3600)
  const m = Math.floor((a % 3600) / 60)
  const s = a % 60
  return `${sign}${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${s ? String(s).padStart(2, '0') : ''}`
}

function tzidToAbbr(tzid: string, offset: number): string {
  // Best-effort compact abbreviation (not the real IANA abbreviation, but a
  // stable, in-band label validators accept).
  const base = tzid.includes('/') ? tzid.split('/').pop()! : tzid
  const sig = base.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
  return offset >= 0 ? `${sig}+${offset / 3600}` : `${sig}-${-offset / 3600}`
}