/**
 * RFC 5545 recurrence expansion engine.
 *
 * Generates the concrete occurrence set for a RecurrenceRule from a DTSTART,
 * honoring INTERVAL/COUNT/UNTIL and the BY* filters (BYMONTH, BYMONTHDAY,
 * BYDAY with ordinates, BYYEARDAY, BYWEEKNO, BYSETPOS, BYHOUR/BYMINUTE/
 * BYSECOND) plus WKST. Operates on the wall-clock calendar (civil days are
 * zone-independent), producing occurrence START values as CalTime of the same
 * kind as DTSTART so authored local times survive DST (weekly 09:00 stays
 * 09:00 local across spring-forward). Bounded by UNTIL/COUNT and a hard
 * iteration cap so a malformed rule can never hang the service.
 */
import type { ByDayEntry, CalTime, RecurrenceRule, Weekday, YMD } from '../types.js'
import {
  WEEKDAY_INDEX,
  dayOfYear,
  daysInMonth,
  epochDays,
  fromDayOfYear,
  fromEpochDays,
  isLeapYear,
  weekdayIndex,
} from '../datetime.js'
import { calTimeToUtcEpoch } from '../times.js'

export const MAX_ITERATIONS = 100_000

export interface ExpandOptions {
  /** Only emit occurrences whose START is within [rangeStartUtc, rangeEndUtc). */
  rangeStartUtc?: number
  rangeEndUtc?: number
  /** Cap for safety; defaults to MAX_ITERATIONS. */
  countCap?: number
  /** Hard UTC bound beyond which generation stops. */
  untilUtc?: number
}

export interface ExpandedInstance {
  start: CalTime
  recurrenceId: CalTime
  startUtc: number
  isMaster: boolean
}

export function expandRule(rule: RecurrenceRule, dtstart: CalTime, opts: ExpandOptions = {}): ExpandedInstance[] {
  const startUtcBase = calTimeToUtcEpoch(dtstart)
  if (startUtcBase === null) return []

  const ruleUntilUtc = rule.until === undefined ? null : calTimeToUtcEpoch(rule.until)
  // An all-day UNTIL (DATE) is inclusive of the entire day.
  const untilUtc = opts.untilUtc ?? (untilIsWholeDay(rule) && ruleUntilUtc !== null ? ruleUntilUtc + 86_399 : ruleUntilUtc)
  const count = rule.count
  const cap = opts.countCap ?? MAX_ITERATIONS

  const candidates = expandCandidates(rule, dtstart, {
    untilUtc,
    cap,
  })

  const out: ExpandedInstance[] = []
  let countSoFar = 0
  for (const cand of candidates) {
    if (count !== undefined && countSoFar >= count) break
    const start = cand.hms !== undefined ? buildStartCalTime(dtstart, cand.ymd, cand.hms) : buildStartCalTime(dtstart, cand.ymd, timeOf(dtstart))
    const startUtc = calTimeToUtcEpoch(start)
    if (startUtc === null) continue
    if (untilUtc !== null && startUtc > untilUtc) break
    if (opts.rangeStartUtc !== undefined && startUtc < opts.rangeStartUtc) continue
    if (opts.rangeEndUtc !== undefined && startUtc >= opts.rangeEndUtc) break
    countSoFar++
    out.push({ start, recurrenceId: start, startUtc, isMaster: countSoFar === 1 })
  }
  return out
}

function timeOf(t: CalTime): { hour: number; minute: number; second: number } {
  return t.kind === 'date' ? { hour: 0, minute: 0, second: 0 } : t.time
}

function untilIsWholeDay(rule: RecurrenceRule): boolean {
  return rule.until?.kind === 'date'
}

interface Cand {
  ymd: YMD
  /** Present when a specific sub-day time applies (sub-daily freqs). */
  hms?: { hour: number; minute: number; second: number }
}

function expandCandidates(
  rule: RecurrenceRule,
  dtstart: CalTime,
  env: { untilUtc: number | null; cap: number },
): Cand[] {
  const out: Cand[] = []
  let guard = 0
  const ok = () => ++guard < env.cap
  const startYmd = dtstart.date

  switch (rule.freq) {
    case 'DAILY':
      daily(rule, startYmd, env, out, ok)
      break
    case 'WEEKLY':
      weekly(rule, startYmd, env, out, ok)
      break
    case 'MONTHLY':
      monthly(rule, startYmd, env, out, ok)
      break
    case 'YEARLY':
      yearly(rule, startYmd, env, out, ok)
      break
    case 'HOURLY':
    case 'MINUTELY':
    case 'SECONDLY':
      subDaily(rule, dtstart, env, out, ok)
      break
  }
  return out
}

/* ---------------- matching helpers ---------------- */

function weekdayOfYmd(ymd: YMD): Weekday {
  const idx = (weekdayIndex(ymd) + 7) % 7 // 0=MO
  return (['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as Weekday[])[idx] as Weekday
}

function dayMatchesFilters(rule: RecurrenceRule, ymd: YMD): boolean {
  if (rule.bymonth && !rule.bymonth.includes(ymd.month)) return false
  if (rule.bymonthday) {
    const dim = daysInMonth(ymd.year, ymd.month)
    if (!rule.bymonthday.includes(ymd.day) && !rule.bymonthday.includes(ymd.day - dim - 1)) return false
  }
  if (rule.byyearday) {
    const doy = dayOfYear(ymd)
    const n = isLeapYear(ymd.year) ? 366 : 365
    if (!rule.byyearday.includes(doy) && !rule.byyearday.includes(doy - n - 1)) return false
  }
  if (rule.byweekno) {
    const wn = isoWeekNo(ymd, rule.wkst ?? 'MO')
    if (!rule.byweekno.includes(wn) && !rule.byweekno.includes(wn - 53 - 1)) return false
  }
  if (rule.byday && rule.byday.every((b) => b.ord === undefined)) {
    // With ordinates (1MO/-1FR) the weekday set is resolved by the per-frequency
    // generator (weekDayDaysInMonth); here we only filter plain weekday lists.
    const wd = weekdayOfYmd(ymd)
    if (!rule.byday.some((b) => b.weekday === wd)) return false
  }
  return true
}

function isoWeekNo(ymd: YMD, wkst: Weekday): number {
  const targetWkst = WEEKDAY_INDEX[wkst]
  const jan1 = weekdayIndex({ year: ymd.year, month: 1, day: 1 })
  let week = Math.floor((dayOfYear(ymd) - 1 + (jan1 + 7 - targetWkst) % 7) / 7) + 1
  if (week === 0) {
    week = isoWeekNo({ year: ymd.year - 1, month: 12, day: 31 }, wkst)
  }
  return week
}

function applyDayToYmd(base: YMD, k: number): YMD {
  return fromEpochDays(epochDays(base) + k)
}

function beyondYear(ymd: YMD, untilUtc: number | null): boolean {
  if (untilUtc !== null && epochDays(ymd) * 86_400 > untilUtc + 86_400) return true
  return ymd.year > 2100
}

/* ---------------- DAILY ---------------- */
function daily(
  rule: RecurrenceRule,
  startYmd: YMD,
  env: { untilUtc: number | null; cap: number },
  out: Cand[],
  ok: () => boolean,
): void {
  const interval = Math.max(1, rule.interval ?? 1)
  const usesFilter = Boolean(rule.byday || rule.bymonth || rule.bymonthday || rule.byyearday || rule.byweekno)
  const step = usesFilter ? 1 : interval
  let k = 0
  while (ok()) {
    const ymd = applyDayToYmd(startYmd, k * step)
    if (beyondYear(ymd, env.untilUtc)) break
    const onInterval = usesFilter ? k % interval === 0 : true
    if (onInterval && dayMatchesFilters(rule, ymd)) out.push({ ymd })
    k++
  }
}

/* ---------------- WEEKLY ---------------- */
function weekly(
  rule: RecurrenceRule,
  startYmd: YMD,
  env: { untilUtc: number | null; cap: number },
  out: Cand[],
  ok: () => boolean,
): void {
  const interval = Math.max(1, rule.interval ?? 1)
  const wkst = WEEKDAY_INDEX[rule.wkst ?? 'MO']
  const startD = epochDays(startYmd)
  const startDow = (weekdayIndex(startYmd) + 7) % 7
  const startOfWeek = startD - ((startDow - wkst + 7) % 7)
  const byday = rule.byday
  const targetDow: number[] = byday
    ? byday.filter((b) => b.ord === undefined).map((b) => WEEKDAY_INDEX[b.weekday])
    : [(startDow)]
  if (byday && byday.every((b) => b.ord !== undefined)) return // invalid for WEEKLY

  let weekIdx = 0
  while (ok()) {
    if (weekIdx % interval !== 0) {
      weekIdx++
      continue
    }
    const weekStart = startOfWeek + weekIdx * 7
    for (const dow of targetDow) {
      const day = weekStart + dow
      const ymd = fromEpochDays(day)
      if (beyondYear(ymd, env.untilUtc)) return
      // Skip days before DTSTART (partial first week).
      if (day < startD) continue
      if (dayMatchesFilters(rule, ymd)) out.push({ ymd })
    }
    weekIdx++
  }
}

/* ---------------- MONTHLY ---------------- */
function monthly(
  rule: RecurrenceRule,
  startYmd: YMD,
  env: { untilUtc: number | null; cap: number },
  out: Cand[],
  ok: () => boolean,
): void {
  const interval = Math.max(1, rule.interval ?? 1)
  const monthBase = 12 * startYmd.year + (startYmd.month - 1)
  const byDay = rule.byday
  const byMonthDay = rule.bymonthday
  let ym = monthBase
  while (ok()) {
    if ((ym - monthBase) % interval !== 0) {
      ym += 1
      continue
    }
    const year = Math.floor(ym / 12)
    const month = (ym % 12) + 1
    if (year > 2100) break
    const dim = daysInMonth(year, month)

    let days: number[]
    if (byMonthDay && byMonthDay.length) {
      days = []
      for (const md of byMonthDay) {
        const d = md > 0 ? md : dim + md + 1
        if (d >= 1 && d <= dim) days.push(d)
      }
    } else if (byDay && byDay.length) {
      days = weekDayDaysInMonth(year, month, byDay)
    } else {
      days = [Math.min(startYmd.day, dim)]
    }
    days.sort((a, b) => a - b)
    let chosen = applyBySetPos(days, rule.bysetpos)
    chosen = chosen.filter((d) => dayMatchesFilters(rule, { year, month, day: d }))
    for (const d of chosen) {
      const cand = { year, month, day: d }
      if (beyondYear(cand, env.untilUtc)) return
      out.push({ ymd: cand })
    }
    ym += 1
  }
}

/* ---------------- YEARLY ---------------- */
function yearly(
  rule: RecurrenceRule,
  startYmd: YMD,
  env: { untilUtc: number | null; cap: number },
  out: Cand[],
  ok: () => boolean,
): void {
  const interval = Math.max(1, rule.interval ?? 1)
  const byDay = rule.byday
  let year = startYmd.year
  while (ok()) {
    if ((year - startYmd.year) % interval !== 0) {
      year += 1
      continue
    }
    const months = rule.bymonth && rule.bymonth.length ? [...rule.bymonth].sort((a, b) => a - b) : [startYmd.month]
    for (const month of months) {
      const dim = daysInMonth(year, month)
      let days: number[]
      if (rule.bymonthday && rule.bymonthday.length) {
        days = []
        for (const md of rule.bymonthday) {
          const d = md > 0 ? md : dim + md + 1
          if (d >= 1 && d <= dim) days.push(d)
        }
      } else if (byDay && byDay.length) {
        days = weekDayDaysInMonth(year, month, byDay)
      } else if (rule.byyearday && rule.byyearday.length) {
        const n = isLeapYear(year) ? 366 : 365
        days = []
        for (const yd of rule.byyearday) {
          const d = yd > 0 ? yd : n + yd + 1
          if (d >= 1 && d <= n) days.push(fromDayOfYear(year, d).day)
        }
      } else {
        days = [Math.min(startYmd.day, dim)]
      }
      days.sort((a, b) => a - b)
      let chosen = applyBySetPos(days, rule.bysetpos)
      chosen = chosen.filter((d) => dayMatchesFilters(rule, { year, month, day: d }))
      for (const d of chosen) {
        const cand = { year, month, day: d }
        if (beyondYear(cand, env.untilUtc)) return
        out.push({ ymd: cand })
      }
    }
    year += 1
  }
}

/* ---------------- Nth-occurrence weekday sets within a month ---------------- */
function weekDayDaysInMonth(year: number, month: number, byDay: ByDayEntry[]): number[] {
  const dim = daysInMonth(year, month)
  const days: number[] = []
  for (const b of byDay) {
    const target = WEEKDAY_INDEX[b.weekday]
    if (b.ord === undefined) {
      for (let d = 1; d <= dim; d++) {
        if ((weekdayIndex({ year, month, day: d }) + 7) % 7 === target) days.push(d)
      }
      continue
    }
    if (b.ord > 0) {
      let count = 0
      for (let d = 1; d <= dim; d++) {
        if ((weekdayIndex({ year, month, day: d }) + 7) % 7 === target && ++count === b.ord) {
          days.push(d)
          break
        }
      }
    } else {
      let count = 0
      for (let d = dim; d >= 1; d--) {
        if ((weekdayIndex({ year, month, day: d }) + 7) % 7 === target && ++count === -b.ord) {
          days.push(d)
          break
        }
      }
    }
  }
  return days
}

function applyBySetPos(days: number[], bysetpos?: number[]): number[] {
  if (!bysetpos || !bysetpos.length) return days
  const n = days.length
  const keep: number[] = []
  for (const p of bysetpos) {
    const idx = p > 0 ? p - 1 : n + p
    if (idx >= 0 && idx < n) keep.push(days[idx]!)
  }
  return keep
}

/* ---------------- HOURLY / MINUTELY / SECONDLY ---------------- */
function subDaily(
  rule: RecurrenceRule,
  dtstart: CalTime,
  env: { untilUtc: number | null; cap: number },
  out: Cand[],
  ok: () => boolean,
): void {
  const interval = Math.max(1, rule.interval ?? 1)
  const unitSec = rule.freq === 'HOURLY' ? 3600 : rule.freq === 'MINUTELY' ? 60 : 1
  let t = calTimeToUtcEpoch(dtstart) ?? 0
  let i = 0
  const prev = new Set<number>()
  while (ok() && i < MAX_ITERATIONS) {
    if (i % interval === 0) {
      const w = utcToWall(t)
      const key = epochDays(w.ymd) * 86_400 + w.hms.hour * 3600 + w.hms.minute * 60 + w.hms.second
      if (!prev.has(key) && matchesTimeFilters(rule, w.ymd, w.hms)) {
        out.push({ ymd: w.ymd, hms: w.hms })
        prev.add(key)
      }
      if (env.untilUtc !== null && t > env.untilUtc) break
    }
    i++
    t += unitSec
  }
}

function utcToWall(epoch: number): { ymd: YMD; hms: { hour: number; minute: number; second: number } } {
  const days = Math.floor(epoch / 86_400)
  let rem = epoch - days * 86_400
  const ymd = fromEpochDays(days)
  let hour = Math.floor(rem / 3600)
  rem -= hour * 3600
  const minute = Math.floor(rem / 60)
  const second = rem - minute * 60
  if (hour < 0) hour += 24
  return { ymd, hms: { hour, minute, second } }
}

function matchesTimeFilters(
  rule: RecurrenceRule,
  ymd: YMD,
  hms: { hour: number; minute: number; second: number },
): boolean {
  if (rule.bymonth && !rule.bymonth.includes(ymd.month)) return false
  if (rule.bymonthday) {
    const dim = daysInMonth(ymd.year, ymd.month)
    if (!rule.bymonthday.includes(ymd.day) && !rule.bymonthday.includes(ymd.day - dim - 1)) return false
  }
  if (rule.byday) {
    const wd = weekdayOfYmd(ymd)
    if (!rule.byday.some((b) => b.weekday === wd && b.ord === undefined)) return false
  }
  if (rule.byhour && !rule.byhour.includes(hms.hour)) return false
  if (rule.byminute && !rule.byminute.includes(hms.minute)) return false
  if (rule.bysecond && !rule.bysecond.includes(hms.second)) return false
  return true
}

/* ---------------- start value construction ---------------- */
function buildStartCalTime(
  template: CalTime,
  ymd: YMD,
  hms: { hour: number; minute: number; second: number },
): CalTime {
  switch (template.kind) {
    case 'date':
      return { kind: 'date', date: ymd }
    case 'utc':
      return { kind: 'utc', date: ymd, time: { ...hms } }
    case 'floating':
      return { kind: 'floating', date: ymd, time: { ...hms } }
    case 'zoned':
      return { kind: 'zoned', tzid: template.tzid, date: ymd, time: { ...hms } }
  }
}

/** Convert a UTC ISO instant to binary epoch seconds (helpers for callers). */
export function isoToEpoch(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}