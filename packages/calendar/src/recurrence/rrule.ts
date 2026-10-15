/**
 * RFC 5545 RRULE parsing / serialization.
 */
import type { ByDayEntry, RecurrenceRule, Weekday } from '../types.js'
import { calTimeToIcal } from '../datetime.js'

const FREQS = ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
const WK = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** Serialize a RecurrenceRule to an RFC 5545 RRULE value. */
export function serializeRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`]
  if (rule.until) parts.push(`UNTIL=${calTimeToIcal(rule.until)}`)
  if (rule.count !== undefined && rule.count !== null) parts.push(`COUNT=${rule.count}`)
  if (rule.interval !== undefined && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.bysecond && rule.bysecond.length) parts.push(`BYSECOND=${rule.bysecond.join(',')}`)
  if (rule.byminute && rule.byminute.length) parts.push(`BYMINUTE=${rule.byminute.join(',')}`)
  if (rule.byhour && rule.byhour.length) parts.push(`BYHOUR=${rule.byhour.join(',')}`)
  if (rule.byday && rule.byday.length) parts.push(`BYDAY=${rule.byday.map(byDayToString).join(',')}`)
  if (rule.bymonthday && rule.bymonthday.length) parts.push(`BYMONTHDAY=${rule.bymonthday.join(',')}`)
  if (rule.byyearday && rule.byyearday.length) parts.push(`BYYEARDAY=${rule.byyearday.join(',')}`)
  if (rule.byweekno && rule.byweekno.length) parts.push(`BYWEEKNO=${rule.byweekno.join(',')}`)
  if (rule.bymonth && rule.bymonth.length) parts.push(`BYMONTH=${rule.bymonth.join(',')}`)
  if (rule.bysetpos && rule.bysetpos.length) parts.push(`BYSETPOS=${rule.bysetpos.join(',')}`)
  if (rule.wkst && rule.wkst !== 'MO') parts.push(`WKST=${rule.wkst}`)
  return parts.join(';')
}

export function byDayToString(b: ByDayEntry): string {
  return b.ord !== undefined ? `${b.ord}${b.weekday}` : b.weekday
}

/** Parse an RFC 5545 RRULE value into a RecurrenceRule, or null if invalid. */
export function parseRule(raw: string): RecurrenceRule | null {
  let freq: RecurrenceRule['freq'] | undefined
  let until: RecurrenceRule['until']
  let count: number | undefined
  let interval: number | undefined
  let byday: RecurrenceRule['byday']
  let bymonth: number[] | undefined
  let bymonthday: number[] | undefined
  let byyearday: number[] | undefined
  let byweekno: number[] | undefined
  let byhour: number[] | undefined
  let byminute: number[] | undefined
  let bysecond: number[] | undefined
  let bysetpos: number[] | undefined
  let wkst: Weekday | undefined

  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).toUpperCase()
    const value = part.slice(eq + 1)
    switch (name) {
      case 'FREQ':
        if (!FREQS.includes(value)) return null
        freq = value as RecurrenceRule['freq']
        break
      case 'UNTIL':
        until = parseIntTime(value)
        if (!until) return null
        break
      case 'COUNT':
        count = parsePositiveInt(value)
        if (count === undefined) return null
        break
      case 'INTERVAL':
        interval = parsePositiveInt(value)
        if (interval === undefined) return null
        break
      case 'BYDAY':
        byday = parseByDay(value)
        if (byday === undefined) return null
        break
      case 'BYMONTH':
        bymonth = parseNumList(value, 1, 12)
        if (!bymonth) return null
        break
      case 'BYMONTHDAY':
        bymonthday = parseNumList(value, -31, 31)
        if (bymonthday === undefined) return null
        break
      case 'BYYEARDAY':
        byyearday = parseNumList(value, -366, 366)
        break
      case 'BYWEEKNO':
        byweekno = parseNumList(value, -53, 53)
        break
      case 'BYHOUR':
        byhour = parseNumList(value, 0, 23)
        break
      case 'BYMINUTE':
        byminute = parseNumList(value, 0, 59)
        break
      case 'BYSECOND':
        bysecond = parseNumList(value, 0, 60)
        break
      case 'BYSETPOS':
        bysetpos = parseNumList(value, -366, 366)
        break
      case 'WKST':
        if (!WK.includes(value)) return null
        wkst = value as Weekday
        break
      default:
        // unknown part — ignore per RFC leniency
        break
    }
  }
  if (!freq) return null
  const rule: RecurrenceRule = { freq }
  if (until) rule.until = until
  if (count !== undefined) rule.count = count
  if (interval !== undefined) rule.interval = interval
  if (byday) rule.byday = byday
  if (bymonth) rule.bymonth = bymonth
  if (bymonthday !== undefined) rule.bymonthday = bymonthday
  if (byyearday !== undefined) rule.byyearday = byyearday
  if (byweekno !== undefined) rule.byweekno = byweekno
  if (byhour) rule.byhour = byhour
  if (byminute) rule.byminute = byminute
  if (bysecond) rule.bysecond = bysecond
  if (bysetpos) rule.bysetpos = bysetpos
  if (wkst) rule.wkst = wkst
  // RFC: COUNT and UNTIL are mutually exclusive; keep only UNTIL if both.
  if (rule.until && rule.count !== undefined) delete (rule as { count?: number }).count
  return rule
}

function parseIntTime(value: string): RecurrenceRule['until'] {
  if (/^\d{8}$/.test(value)) {
    return { kind: 'date', date: ymdOf(value) }
  }
  if (/^\d{8}T\d{6}Z$/i.test(value)) {
    return {
      kind: 'utc',
      date: ymdOf(value.slice(0, 8)),
      time: {
        hour: Number(value.slice(9, 11)),
        minute: Number(value.slice(11, 13)),
        second: Number(value.slice(13, 15)),
      },
    }
  }
  return undefined
}

function ymdOf(s: string) {
  return { year: Number(s.slice(0, 4)), month: Number(s.slice(4, 6)), day: Number(s.slice(6, 8)) }
}

function parsePositiveInt(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined
  const n = Number(value)
  return n >= 1 ? n : undefined;
}

function parseNumList(value: string, lo: number, hi: number): number[] | undefined {
  const out: number[] = []
  for (const tok of value.split(',')) {
    if (!/^-?\d+$/.test(tok)) return undefined
    const n = Number(tok)
    if (n < lo || n > hi) return undefined
    out.push(n)
  }
  return out.length ? out : undefined;
}

function parseByDay(value: string): ByDayEntry[] | undefined {
  const out: ByDayEntry[] = []
  for (const tok of value.split(',')) {
    const m = /^(-?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(tok)
    if (!m) return undefined
    const weekday = m[2] as Weekday
    if (m[1] !== undefined) {
      const ord = Number(m[1])
      if (ord === 0 || ord < -53 || ord > 53) return undefined
      out.push({ weekday, ord })
    } else {
      out.push({ weekday })
    }
  }
  return out.length ? out : undefined;
}
