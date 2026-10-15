/**
 * Pure wall-clock / RFC 5545 date-time primitives.
 *
 * All arithmetic here is done on the UTC calendar (the civil calendar is
 * identical in every zone — only the offset differs — so wall-clock days align
 * with UTC calendar days, which the recurrence engine relies on). Zone offset
 * math lives in `timezone/`.
 */
import type { CalTime, HMS, Weekday, YMD } from './types.js'

export const WEEKDAY_INDEX: Record<Weekday, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 }

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

/** Day-of-year for a YMD (1-based). */
export function dayOfYear(y: YMD): number {
  let d = y.day
  for (let m = 1; m < y.month; m++) d += daysInMonth(y.year, m)
  return d
}

/** YMD from a 1-based day-of-year (year must be provided). */
export function fromDayOfYear(year: number, doy: number): YMD {
  let m = 1
  let rem = doy
  while (rem > daysInMonth(year, m)) {
    rem -= daysInMonth(year, m)
    m++
  }
  return { year, month: m, day: rem }
}

/** Weekday of a YMD as an RFC Weekday code. */
export function weekdayOf(y: YMD): Weekday {
  const dow = weekdayIndex(y)
  return (['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as Weekday[])[dow] as Weekday
}

/**
 * 0=MO ... 6=SU (Monday-first), via the integer Zeller/Kong algorithm.
 * The raw Kong result is 0=Sunday; we shift so Monday is 0 to match the
 * recurrence engine's WEEKDAY_INDEX convention.
 */
export function weekdayIndex(y: YMD): number {
  const [yy, m, d] = [y.year, y.month, y.day]
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const yy2 = yy - (m < 3 ? 1 : 0)
  const f =
    yy2 +
    Math.floor(yy2 / 4) -
    Math.floor(yy2 / 100) +
    Math.floor(yy2 / 400) +
    (t[m - 1] as number) +
    d
  const kong = Math.floor(f) % 7 // 0=Sunday
  return ((kong + 6) % 7) // shift Sunday→6, Monday→0
}

/** Days from civil 1970-01-01 (UTC) — allows simple date arithmetic. */
export function epochDays(y: YMD): number {
  let y2 = y.year
  let m2 = y.month
  if (m2 <= 2) {
    y2 -= 1
    m2 += 12
  }
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400)
  const yoe = y2 - era * 400
  const doy = Math.floor((153 * (m2 + (m2 > 2 ? -3 : 9)) + 2) / 5) + y.day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Civil YMD from an epoch-day count (alias of ER := days since 1970-01-01). */
export function fromEpochDays(z: number): YMD {
  const zc = z + 719468
  const era = Math.floor(zc / 146097)
  const doe = zc - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d }
}

/* ---------------------------------------------------------------- */
/* CalTime helpers                                                   */
/* ---------------------------------------------------------------- */

export function allDay(t: CalTime): boolean {
  return t.kind === 'date'
}

/** RFC 5545 basic DATE value "YYYYMMDD". */
export function formatDate(d: YMD): string {
  return (
    `${pad4(d.year)}${pad2(d.month)}${pad2(d.day)}`
  )
}

/** RFC 5545 basic DATE-TIME value "YYYYMMDDTHHMMSS" (no zone suffix). */
export function formatDateTime(y: YMD, hms: HMS): string {
  return `${formatDate(y)}T${pad2(hms.hour)}${pad2(hms.minute)}${pad2(hms.second)}`
}

/** Serialize a CalTime to its RFC 5545 text value (without TZID param). */
export function calTimeToIcal(t: CalTime): string {
  switch (t.kind) {
    case 'date':
      return formatDate(t.date)
    case 'utc':
      return `${formatDateTime(t.date, t.time)}Z`
    case 'floating':
      return formatDateTime(t.date, t.time)
    case 'zoned':
      return formatDateTime(t.date, t.time)
  }
}

/** The TZID param (or none) to emit for a CalTime. */
export function calTimeTzidParam(t: CalTime): string | undefined {
  return t.kind === 'zoned' ? t.tzid : undefined
}

/** Textual TIME (HH:MM:SS) of a time-bearing CalTime; undefined for all-day. */
export function calTimeHms(t: CalTime): HMS | undefined {
  return t.kind === 'date' ? undefined : t.time
}

/** The YMD of a CalTime (always present). */
export function calTimeYmd(t: CalTime): YMD {
  return t.date
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n
const pad4 = (n: number) => (n < 0 ? '-' : '') + `${Math.abs(n)}`.padStart(4, '0')

/**
 * Parse an RFC 5545 DATE or DATE-TIME basic value into a CalTime.
 * Accepts "YYYYMMDD", "YYYYMMDDTHHMMSS[Z]", and tolerantly handles a missing
 * seconds component ("YYYYMMDDTHHMM"). Returns null on malformed input.
 */
export function parseCalTime(raw: string): CalTime | null {
  const s = raw.trim().toUpperCase()
  let offset = 0
  let kind: CalTime['kind'] = 'date'
  if (s.includes('T')) {
    const ti = s.indexOf('T')
    const timePart = s.slice(ti + 1)
    if (timePart.endsWith('Z')) {
      kind = 'utc'
      offset = 1
    } else {
      kind = 'floating'
    }
    const d = parseYmd(s.slice(0, ti))
    if (!d) return null
    const hm = parseHms(timePart, offset)
    if (!hm) return null
    return { kind, date: d, time: hm }
  }
  const d = parseYmd(s)
  if (!d) return null
  return { kind: 'date', date: d }
}

function parseYmd(s: string): YMD | null {
  if (!/^\d{8}$/.test(s)) return null
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(4, 6))
  const day = Number(s.slice(6, 8))
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

function parseHms(s: string, _offsetForZ: number): HMS | null {
  // strip trailing Z if present
  let body = s
  if (body.endsWith('Z')) body = body.slice(0, -1)
  // HHMMSS or HHMM
  if (/^\d{6}$/.test(body)) {
    const hour = Number(body.slice(0, 2))
    const minute = Number(body.slice(2, 4))
    const second = Number(body.slice(4, 6))
    if (!validHms(hour, minute, second)) return null
    return { hour, minute, second }
  }
  if (/^\d{4}$/.test(body)) {
    const hour = Number(body.slice(0, 2))
    const minute = Number(body.slice(2, 4))
    if (hour > 23 || minute > 59) return null
    return { hour, minute, second: 0 }
  }
  return null
}

function validHms(h: number, m: number, s: number): boolean {
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 60
}

/* ---------------------------------------------------------------- */
/* ISO 8601 durations ("PT1H30M", "P1D", "P1W") used for DURATION/DUE */
/* ---------------------------------------------------------------- */

export interface DurationParts {
  weeks?: number
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
}

const DUR_RE = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i

export function parseDuration(raw: string): DurationParts | null {
  const m = DUR_RE.exec(raw.trim())
  if (!m) return null
  return {
    weeks: m[1] ? Number(m[1]) : undefined,
    days: m[2] ? Number(m[2]) : undefined,
    hours: m[3] ? Number(m[3]) : undefined,
    minutes: m[4] ? Number(m[4]) : undefined,
    seconds: m[5] ? Number(m[5]) : undefined,
  }
}

export function durationToSeconds(d: DurationParts): number {
  return (
    (d.weeks ?? 0) * 604800 +
      (d.days ?? 0) * 86400 +
      (d.hours ?? 0) * 3600 +
      (d.minutes ?? 0) * 60 +
      (d.seconds ?? 0)
  )
}

export function secondsToDuration(sec: number): string {
  const s = Math.round(sec)
  if (s < 0) {
    return `-${secondsToDuration(-s)}`
  }
  const parts: string[] = []
  let rem = s
  const weeks = Math.floor(rem / 604800)
  if (weeks) {
    parts.push(`${weeks}W`)
    rem %= 604800
  }
  const days = Math.floor(rem / 86400)
  if (days) {
    parts.push(`${days}D`)
    rem %= 86400
  }
  const hours = Math.floor(rem / 3600)
  rem %= 3600
  const minutes = Math.floor(rem / 60)
  rem %= 60
  let time = ''
  if (hours) time += `${hours}H`
  if (minutes) time += `${minutes}M`
  if (rem) time += `${rem}S`
  const t = time ? `T${time}` : ''
  return `P${parts.join('')}${t}`
}

/* ---------------------------------------------------------------- */
/* UTC ISO instants (for DTSTAMP / CREATED / LAST-MODIFIED)          */
/* ---------------------------------------------------------------- */

/** Format a UTC epoch as a YMD+HMS. */
export function epochToUtcYmd(epochSeconds: number): YMD & { _time: HMS } {
  let days = Math.floor(epochSeconds / 86400)
  let rem = epochSeconds - days * 86400
  let hour = Math.floor(rem / 3600)
  rem -= hour * 3600
  const minute = Math.floor(rem / 60)
  const second = rem - minute * 60
  // normalize negative epochs
  if (hour < 0) {
    days -= 1
    hour += 24
  }
  return { ...fromEpochDays(days), _time: { hour, minute, second } }
}

export function epochToIsoUtc(epochSeconds: number): string {
  const { _time, ...ymd } = epochToUtcYmd(epochSeconds)
  return `${formatDateTime(ymd, _time)}Z`
}

/** Extended ISO-8601 instant "YYYY-MM-DDTHH:MM:SSZ" — JS Date.parse() safe. */
export function epochToIsoExtended(epochSeconds: number): string {
  const { _time, ...ymd } = epochToUtcYmd(epochSeconds)
  const d = formatDate(ymd).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
  const t = `${pad2(_time.hour)}:${pad2(_time.minute)}:${pad2(_time.second)}`
  return `${d}T${t}Z`
}

/** Convert a UTC YMD+HMS to epoch seconds. */
export function utcYmdToEpoch(y: YMD, t: HMS): number {
  return epochDays(y) * 86400 + (t.hour * 3600 + t.minute * 60 + t.second)
}

/** Convert a CalTime whose kind is utc to epoch seconds. */
export function utcCalTimeToEpoch(t: Extract<CalTime, { kind: 'utc' }>): number {
  return utcYmdToEpoch(t.date, t.time)
}

export function nowIsoUtc(): string {
  return epochToIsoUtc(Math.floor(Date.now() / 1000))
}

/** Human-friendly "2026-01-01 09:00" for logging / UI. */
export function wallClockLabel(t: CalTime): string {
  if (t.kind === 'date') return formatDate(t.date)
  return `${formatDate(t.date)} ${pad2(t.time.hour)}:${pad2(t.time.minute)}`
}