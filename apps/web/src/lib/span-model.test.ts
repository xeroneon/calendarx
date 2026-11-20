import { describe, expect, it } from 'vitest'
import {
  appWeekStartsOn,
  monthGridLocale,
  quickRangeLabel,
  quickRangeMeta,
  resolveQuickRange,
  weekWindowLocale,
  ymdKey,
} from './calendar'
import {
  DAY_MINUTES,
  durationFromMinutes,
  durationMinutes,
  hmsOfMinutes,
  minutesOfHms,
  occToSpan,
  occurrencesToSpans,
  spanTimeLabel,
  spanToTimes,
} from './span-model'
import type { CalendarItem, Occurrence } from '@calendarx/sdk'

const occ = (over: Partial<Occurrence> = {}): Occurrence =>
  ({
    uid: 'a',
    startUtc: '2026-11-12T17:00:00Z',
    endUtc: '2026-11-12T18:00:00Z',
    startLocal: '2026-11-12T09:0',
    endLocal: '2026-11-12T10:0',
    allDay: false,
    ...over,
  }) as Occurrence

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({ uid: 'a', kind: 'event', duration: 'PT90M', ...over }) as CalendarItem

describe('span model (XER-549)', () => {
  it('round-trips minutes and HMS', () => {
    expect(minutesOfHms({ hour: 14, minute: 30, second: 0 })).toBe(870)
    expect(hmsOfMinutes(870)).toEqual({ hour: 14, minute: 30, second: 0 })
    expect(hmsOfMinutes(-30)).toEqual({ hour: 0, minute: 0, second: 0 })
    expect(hmsOfMinutes(9999)).toEqual({ hour: 23, minute: 59, second: 0 })
  })

  it('parses and builds RFC 5545 durations', () => {
    expect(durationMinutes('PT30M')).toBe(30)
    expect(durationMinutes('PT1H30M')).toBe(90)
    expect(durationMinutes('P1D')).toBe(1440)
    expect(durationMinutes('P1W')).toBe(10080)
    expect(durationMinutes(undefined)).toBe(null)
    expect(durationFromMinutes(90)).toBe('PT90M')
    expect(durationFromMinutes(1440, true)).toBe('P1D')
  })

  it('projects a timed occurrence onto its day track', () => {
    const span = occToSpan(occ(), item(), '#6366f1')!
    expect(span.track).toBe('2026-11-12')
    expect(span.start).toBe(9 * 60)
    expect(span.end).toBe(9 * 60 + 90)
    expect(span.locked).toBe(false)
    expect(span.summary).toBe('a')
  })

  it('keeps a minimum length and stays inside the day', () => {
    const span = occToSpan(occ(), item({ duration: 'PT0M' }), '#fff')!
    expect(span.end - span.start).toBe(15)
    const late = occToSpan(occ({ startLocal: '2026-11-12T23:0', startUtc: '2026-11-13T07:00:00Z' }), item({ duration: 'PT180M' }), '#fff')!
    expect(late.end).toBe(DAY_MINUTES)
  })

  it('skips all-day occurrences and locks recurring ones', () => {
    expect(occToSpan(occ({ allDay: true }), item(), '#fff')).toBe(null)
    const locked = occToSpan(occ(), item({ recurrence: { freq: 'WEEKLY' } as CalendarItem['recurrence'] }), '#fff')!
    expect(locked.locked).toBe(true)
    expect(occurrencesToSpans([occ({ allDay: true }), occ()], new Map([['a', item()]]), '#fff')).toHaveLength(1)
  })

  it('turns a span back into a CalTime + duration', () => {
    const times = spanToTimes({ track: '2026-11-12', start: 540, end: 660 }, 'UTC')!
    expect(times.duration).toBe('PT120M')
    expect(times.start).toEqual({ kind: 'utc', date: { year: 2026, month: 11, day: 12 }, time: { hour: 9, minute: 0, second: 0 } })
  })

  it('labels span edges', () => {
    expect(spanTimeLabel(0)).toBe('00:00')
    expect(spanTimeLabel(870)).toBe('14:30')
  })
})

describe('locale grid + quick ranges (XER-549)', () => {
  it('keeps English grids Monday-first (WKST=MO) and follows other locales', () => {
    expect(appWeekStartsOn('en-US')).toBe(1)
    expect(appWeekStartsOn('de-DE')).toBe(1)
    expect(appWeekStartsOn('ar-EG')).toBe(6)
  })

  it('builds a month grid that starts on the locale week start', () => {
    const weeks = monthGridLocale({ year: 2026, month: 11, day: 15 }, 1)
    expect(ymdKey(weeks[0]![0]!)).toBe('2026-10-26')
    expect(weeks.flat()).toHaveLength(weeks.length * 7)
    const sun = monthGridLocale({ year: 2026, month: 11, day: 15 }, 0)
    expect(sun[0]![0]!.day).toBe(1)
  })

  it('builds a week window from the week start', () => {
    const week = weekWindowLocale({ year: 2026, month: 11, day: 12 }, 1)
    expect(week.map(ymdKey)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
  })

  it('resolves quick ranges in the locale calendar', () => {
    expect(resolveQuickRange('this-week', '2026-11-12', 1)).toEqual({ start: '2026-11-09', end: '2026-11-15' })
    expect(resolveQuickRange('next-week', '2026-11-12', 1)).toEqual({ start: '2026-11-16', end: '2026-11-22' })
    expect(resolveQuickRange('this-month', '2026-11-12', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(resolveQuickRange('next-month', '2026-11-12', 1)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
    expect(resolveQuickRange('next-year', '2026-11-12', 1)).toEqual({ start: '2026-11-12', end: '2027-11-12' })
    const sundayWeek = resolveQuickRange('this-week', '2026-11-12', 0)
    expect(sundayWeek.start).toBe('2026-11-08')
  })

  it('labels a resolved range in the locale', () => {
    const range = { start: '2026-11-12', end: '2026-11-16' }
    expect(quickRangeLabel(range, 'en-US')).toBe('Nov 12 – 16, 2026')
    expect(quickRangeMeta(range, 'en-US')).toBe('5 days · November')
    expect(quickRangeMeta({ start: '2026-12-01', end: '2026-12-01' }, 'en-US')).toBe('1 day · December')
  })
})
