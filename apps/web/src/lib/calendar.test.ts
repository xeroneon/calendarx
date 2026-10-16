import { describe, expect, it } from 'vitest'
import {
  parseYmdKey,
  todayYmd,
  monthGrid,
  calTimeFromInputs,
  buildRule,
  ruleToState,
  alarmMinutes,
  triggerForMinutes,
  alarmLabelFor,
  alarmMinutesFrom,
  attendeesToText,
  parseAttendeeEmails,
} from './calendar'
import { attendee } from '@calendarx/calendar'

describe('@calendarx/web calendar helpers', () => {
  it('parses a YYYY-MM-DD key', () => {
    expect(parseYmdKey('2026-03-02')).toEqual({ year: 2026, month: 3, day: 2 })
    expect(parseYmdKey('not-a-date')).toBeNull()
  })

  it('returns a full Monday-first month grid', () => {
    const grid = monthGrid({ year: 2026, month: 3, day: 1 })
    // March 2026 starts on a Sunday → offset 6, 31 days → 6 rows.
    expect(grid).toHaveLength(6)
    expect(grid[0]).toHaveLength(7)
  })

  it('builds an all-day RFC DATE CalTime', () => {
    const t = calTimeFromInputs(true, { year: 2026, month: 3, day: 2 }, null)
    expect(t).toEqual({ kind: 'date', date: { year: 2026, month: 3, day: 2 } })
  })

  it('reports a parseable today', () => {
    const y = todayYmd()
    expect(y.year).toBeGreaterThan(2000)
  })
})

describe('recurrence rule builder (XER-306)', () => {
  it('builds a simple DAILY rule', () => {
    expect(buildRule('DAILY')).toEqual({ freq: 'DAILY', interval: 1 })
  })

  it('honours a custom interval', () => {
    expect(buildRule('WEEKLY', { interval: 2 })).toEqual({ freq: 'WEEKLY', interval: 2 })
  })

  it('adds weekly BYDAY only when WEEKLY and a set is provided', () => {
    expect(buildRule('WEEKLY', { byday: [{ weekday: 'MO' }, { weekday: 'WE' }] })).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byday: [{ weekday: 'MO' }, { weekday: 'WE' }],
    })
    // byday is ignored for non-WEEKLY freqs
    expect(buildRule('MONTHLY', { byday: [{ weekday: 'MO' }] })).toEqual({ freq: 'MONTHLY', interval: 1 })
  })

  it('returns undefined for NONE', () => {
    expect(buildRule('NONE')).toBeUndefined()
  })

  it('round-trips rule state back off a stored rule', () => {
    const rule = buildRule('WEEKLY', { interval: 2, byday: [{ weekday: 'TU' }] })
    expect(ruleToState(rule)).toEqual({ freq: 'WEEKLY', interval: 2, byday: [{ weekday: 'TU' }] })
    expect(ruleToState(undefined)).toEqual({ freq: 'NONE', interval: 1, byday: [] })
  })
})

describe('alarm helpers (XER-306)', () => {
  it('parses relative triggers to minutes-before', () => {
    expect(alarmMinutes('-PT15M')).toBe(15)
    expect(alarmMinutes('-PT1H30M')).toBe(90)
    expect(alarmMinutes('-P1D')).toBe(1440)
    expect(alarmMinutes('-PT0M')).toBe(0)
    expect(alarmMinutes('PT10M')).toBe(-10)
    expect(alarmMinutes('garbage')).toBeNull()
  })

  it('builds ISO triggers for minutes-before', () => {
    expect(triggerForMinutes(15)).toBe('-PT15M')
    expect(triggerForMinutes(90)).toBe('-PT1H30M')
    expect(triggerForMinutes(1440)).toBe('-P1D')
  })

  it('round-trips a trigger string through minutes', () => {
    for (const mins of [5, 15, 60, 120, 1440]) {
      expect(alarmMinutes(triggerForMinutes(mins))).toBe(mins)
    }
  })

  it('labels presets and unknown values', () => {
    expect(alarmLabelFor(15)).toBe('15 minutes before')
    expect(alarmLabelFor(0)).toBe('At time of event')
    expect(alarmLabelFor(45)).toBe('45 minutes before')
  })

  it('extracts display minutes from a stored alarm', () => {
    expect(alarmMinutesFrom({ action: 'DISPLAY', trigger: '-PT30M' })).toBe(30)
    expect(alarmMinutesFrom(undefined)).toBe(0)
  })
})

describe('attendee helpers (XER-306)', () => {
  it('round-trips attendees to text and back', () => {
    const atts = [attendee('a@example.com'), attendee('b@example.com')]
    expect(attendeesToText(atts)).toBe('a@example.com, b@example.com')
    const parsed = parseAttendeeEmails('a@example.com, b@example.com')
    expect(parsed.map((a) => a.uri)).toEqual(['mailto:a@example.com', 'mailto:b@example.com'])
  })

  it('dedupes and drops invalid addresses', () => {
    const parsed = parseAttendeeEmails('x@y.com x@y.com not-an-email ;z@w.io')
    expect(parsed.map((a) => a.uri)).toEqual(['mailto:x@y.com', 'mailto:z@w.io'])
  })

  it('tolerates empty / whitespace input', () => {
    expect(parseAttendeeEmails('')).toEqual([])
    expect(parseAttendeeEmails('   ,  ')).toEqual([])
  })
})