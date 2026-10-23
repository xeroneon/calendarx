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
  filterTasks,
  sortTasks,
  hasTaskDue,
  taskDueKey,
} from './calendar'
import { attendee } from '@calendarx/calendar'
import type { CalendarTask, CalTime } from '@calendarx/calendar'

/** Minimal task builder for tests. */
function task(over: Partial<CalendarTask> & { uid: string; summary: string }): CalendarTask {
  return { kind: 'task', ...over } as CalendarTask
}
function dateDue(y: number, m: number, d: number): CalTime {
  return { kind: 'date', date: { year: y, month: m, day: d } }
}
function utcDue(y: number, m: number, d: number, h: number, min: number): CalTime {
  return { kind: 'utc', date: { year: y, month: m, day: d }, time: { hour: h, minute: min, second: 0 } }
}

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

  it('converts a zoned wall clock to the correct absolute UTC instant (XER-332)', () => {
    // A user in America/Los_Angeles (PDT in July, UTC-7) picks 06:40 local on
    // 2026-07-23. That must be stored as 13:40Z, NOT the wall clock copied as UTC.
    const t = calTimeFromInputs(
      false,
      { year: 2026, month: 7, day: 23 },
      { hour: 6, minute: 40, second: 0 },
      'America/Los_Angeles',
    )
    expect(t).toEqual({
      kind: 'utc',
      date: { year: 2026, month: 7, day: 23 },
      time: { hour: 13, minute: 40, second: 0 },
    })
  })

  it('leaves a wall clock in UTC zone unchanged', () => {
    const t = calTimeFromInputs(
      false,
      { year: 2026, month: 7, day: 23 },
      { hour: 6, minute: 40, second: 0 },
      'UTC',
    )
    expect(t).toEqual({
      kind: 'utc',
      date: { year: 2026, month: 7, day: 23 },
      time: { hour: 6, minute: 40, second: 0 },
    })
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

describe('task list helpers (XER-307)', () => {
  it('hasTaskDue reflects a DUE or DTSTART', () => {
    expect(hasTaskDue(task({ uid: 'a', summary: 'a', due: dateDue(2026, 10, 1) }))).toBe(true)
    expect(hasTaskDue(task({ uid: 'b', summary: 'b', dtstart: utcDue(2026, 10, 2, 9, 0) }))).toBe(true)
    expect(hasTaskDue(task({ uid: 'c', summary: 'c' }))).toBe(false)
  })

  it('taskDueKey orders by day then time, empty for undated', () => {
    expect(taskDueKey(task({ uid: 'a', summary: 'a', due: dateDue(2026, 10, 5) }))).toBe('2026-10-05|')
    expect(taskDueKey(task({ uid: 'b', summary: 'b', due: utcDue(2026, 10, 5, 9, 30) }))).toBe('2026-10-05|09:30')
    expect(taskDueKey(task({ uid: 'c', summary: 'c' }))).toBe('')
  })

  it('filterTasks matches summary case-insensitively', () => {
    const tasks = [
      task({ uid: 'a', summary: 'Ship CalendarX' }),
      task({ uid: 'b', summary: 'fix login' }),
    ]
    expect(filterTasks(tasks, '')).toHaveLength(2)
    expect(filterTasks(tasks, 'SHIP').map((t) => t.uid)).toEqual(['a'])
    expect(filterTasks(tasks, '  cal  ').map((t) => t.uid)).toEqual(['a'])
    expect(filterTasks(tasks, 'zzz')).toEqual([])
  })

  it('sortTasks puts open (dated first, earliest due) then completed then cancelled', () => {
    const tasks = [
      task({ uid: 'none', summary: 'no due', status: 'NEEDS-ACTION' }),
      task({ uid: 'done', summary: 'done', status: 'COMPLETED', percentComplete: 100 }),
      task({ uid: 'late', summary: 'late', status: 'NEEDS-ACTION', due: utcDue(2026, 9, 1, 8, 0) }),
      task({ uid: 'soon', summary: 'soon', status: 'NEEDS-ACTION', due: dateDue(2026, 10, 1) }),
      task({ uid: 'cancelled', summary: 'cancelled', status: 'CANCELLED' }),
      task({ uid: 'mid', summary: 'mid', status: 'IN-PROCESS', due: utcDue(2026, 9, 15, 17, 0) }),
    ]
    const order = sortTasks(tasks).map((t) => t.uid)
    // open dated, earliest due first: late(09-01) → mid(09-15) → soon(10-01)
    expect(order.slice(0, 3)).toEqual(['late', 'mid', 'soon'])
    expect(order[3]).toBe('none') // open undated
    expect(order[4]).toBe('done') // completed
    expect(order[5]).toBe('cancelled') // cancelled last
  })

  it('sortTasks leaves task arrays unmodified (returns a copy)', () => {
    const tasks = [
      task({ uid: 'b', summary: 'b' }),
      task({ uid: 'a', summary: 'a', status: 'COMPLETED' }),
    ]
    const before = tasks.map((t) => t.uid).join(',')
    sortTasks(tasks)
    expect(tasks.map((t) => t.uid).join(',')).toBe(before)
  })
})