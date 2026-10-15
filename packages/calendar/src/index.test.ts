import { describe, expect, it } from 'vitest'
import {
  CalTime,
  calTimeToUtcEpoch,
  completeTask,
  expandRule,
  feedSummary,
  parseCalendar,
  parseRule,
  resolveLocalToUtc,
  resolveUtcToLocal,
  serializeCalendar,
  serializeRule,
  zoneKnown,
} from './index.js'

/** Date.UTC in SECONDS (the engine's epoch unit), avoiding ms confusion. */
const U = (...a: [number, number, number, number?, number?, number?, number?]) => Date.UTC(...a) / 1000

const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): CalTime => ({
  kind: 'utc',
  date: { year: y, month: mo, day: d },
  time: { hour: h, minute: mi, second: s },
})
const date = (y: number, mo: number, d: number): CalTime => ({ kind: 'date', date: { year: y, month: mo, day: d } })
const zoned = (y: number, mo: number, d: number, h: number, mi: number, tzid: string): CalTime => ({
  kind: 'zoned',
  tzid,
  date: { year: y, month: mo, day: d },
  time: { hour: h, minute: mi, second: 0 },
})
const o10 = (o: { startUtc: number }) => new Date(o.startUtc * 1000).toISOString().slice(0, 10)

describe('timezone registry (IANA table)', () => {
  it('resolves DST offsets from the committed table', () => {
    expect(zoneKnown('America/Los_Angeles')).toBe(true)
    expect(zoneKnown('Europe/Berlin')).toBe(true)
    expect(zoneKnown('Not/AZone')).toBe(false)
    // 09:00 PST (UTC-8) == 17:00Z on a winter day
    const winter = resolveLocalToUtc('America/Los_Angeles', { year: 2026, month: 1, day: 15 }, { hour: 9, minute: 0, second: 0 })
    expect(winter).not.toBeNull()
    expect(calTimeToUtcEpoch(zoned(2026, 1, 15, 9, 0, 'America/Los_Angeles'))).toBe(U(2026, 0, 15, 17))
    // 09:00 PDT (UTC-7) == 16:00Z on a summer day
    expect(calTimeToUtcEpoch(zoned(2026, 7, 15, 9, 0, 'America/Los_Angeles'))).toBe(U(2026, 6, 15, 16))
  })

  it('round-trips UTC ↔ local', () => {
    const local = resolveUtcToLocal('Europe/Berlin', U(2026, 0, 15, 12))
    expect(local).not.toBeNull()
    expect(local!.hms.hour).toBe(13) // CET = UTC+1 in January
    expect(local!.ymd.day).toBe(15)
  })
})

describe('recurrence expansion', () => {
  it('DAILY with COUNT', () => {
    const occ = expandRule({ freq: 'DAILY', count: 5 }, utc(2026, 1, 1, 9), {})
    expect(occ).toHaveLength(5)
    expect(o10(occ[0]!)).toBe('2026-01-01')
    expect(o10(occ[4]!)).toBe('2026-01-05')
  })

  it('WEEKLY MO/WE/FR keeps 09:00 local and shifts UTC across DST', () => {
    const occ = expandRule(
      { freq: 'WEEKLY', byday: [{ weekday: 'MO' }, { weekday: 'WE' }, { weekday: 'FR' }] },
      zoned(2026, 3, 2, 9, 0, 'America/Los_Angeles'),
      { rangeStartUtc: U(2026, 2, 5), rangeEndUtc: U(2026, 2, 20) },
    )
    expect(occ.length).toBeGreaterThan(0)
    expect(occ.every((o) => (o.start as { time: { hour: number } }).time.hour === 9)).toBe(true) // 09:00 local throughout
    const fri = occ.find((o) => new Date(o.startUtc * 1000).getUTCDay() === 5)
    const mon = occ.find((o) => new Date(o.startUtc * 1000).getUTCDay() === 1)
    expect(new Date(fri!.startUtc * 1000).getUTCHours()).toBe(17) // before spring-forward
    expect(new Date(mon!.startUtc * 1000).getUTCHours()).toBe(16) // after
  })

  it('MONTHLY first Monday (1MO)', () => {
    const occ = expandRule({ freq: 'MONTHLY', byday: [{ weekday: 'MO', ord: 1 }] }, date(2026, 1, 5), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 5, 1),
    })
    expect(occ.map(o10)).toEqual(['2026-01-05', '2026-02-02', '2026-03-02', '2026-04-06', '2026-05-04'])
  })

  it('MONTHLY last Friday (-1FR)', () => {
    const occ = expandRule({ freq: 'MONTHLY', byday: [{ weekday: 'FR', ord: -1 }] }, date(2026, 1, 30), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 2, 1),
    })
    expect(occ.map(o10)).toEqual(['2026-01-30', '2026-02-27'])
  })

  it('MONTHLY on day 1 and 15', () => {
    const occ = expandRule({ freq: 'MONTHLY', bymonthday: [1, 15] }, date(2026, 1, 1), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 3, 1),
    })
    expect(occ.map(o10)).toEqual([
      '2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15',
    ])
  })

  it('YEARLY on June 1', () => {
    const occ = expandRule({ freq: 'YEARLY', bymonth: [6], bymonthday: [1] }, date(2026, 6, 1), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 11, 1),
    })
    expect(occ.map(o10)).toEqual(['2026-06-01'])
  })

  it('respects INTERVAL (every other week)', () => {
    const occ = expandRule({ freq: 'WEEKLY', interval: 2, byday: [{ weekday: 'TU' }] }, date(2026, 1, 6), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 1, 15),
    })
    expect(occ.map(o10)).toEqual(['2026-01-06', '2026-01-20', '2026-02-03'])
  })

  it('DAILY until a DATE (inclusive whole day)', () => {
    const occ = expandRule(
      { freq: 'DAILY', until: { kind: 'date', date: { year: 2026, month: 1, day: 5 } } },
      utc(2026, 1, 1, 9),
      {},
    )
    expect(occ.map(o10)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'])
  })

  it('handles BYSETPOS (-1 = last weekday of month)', () => {
    const occ = expandRule({ freq: 'MONTHLY', byday: [{ weekday: 'FR' }], bysetpos: [-1] }, date(2026, 1, 30), {
      rangeStartUtc: U(2026, 0, 1),
      rangeEndUtc: U(2026, 2, 1),
    })
    expect(occ.map(o10)).toEqual(['2026-01-30', '2026-02-27'])
  })
})

describe('RRULE parse/serialize round-trip', () => {
  it('round-trips a WEEKLY rule', () => {
    const r = parseRule('FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2;WKST=SU')
    expect(r).not.toBeNull()
    expect(r!.freq).toBe('WEEKLY')
    expect(r!.byday?.map((b) => b.weekday)).toEqual(['MO', 'WE', 'FR'])
    expect(r!.interval).toBe(2)
    const back = parseRule(serializeRule(r!))
    expect(back!.freq).toBe('WEEKLY')
    expect(serializeRule(back!)).toContain('BYDAY=MO,WE,FR')
  })

  it('parses MONTHLY with ordinate BYDAY', () => {
    const r = parseRule('FREQ=MONTHLY;BYDAY=1MO,-1FR')
    expect(r).not.toBeNull()
    expect(r!.byday).toEqual([
      { weekday: 'MO', ord: 1 },
      { weekday: 'FR', ord: -1 },
    ])
  })

  it('returns null for a rule missing FREQ', () => {
    expect(parseRule('BYDAY=MO')).toBeNull()
  })
})

describe('iCal serialize / parse round-trip', () => {
  it('serializes a recurring zoned event with attendee and re-parses it', () => {
    const ev = {
      kind: 'event',
      uid: 'evt_standup',
      summary: 'Standup, daily',
      description: 'Café · 15 min',
      location: 'Office',
      dtstart: zoned(2026, 3, 2, 9, 0, 'America/Los_Angeles'),
      duration: 'PT30M',
      organizer: { uri: 'mailto:ax@xeroneon.dev', cn: 'Axel' },
      attendees: [
        { uri: 'mailto:a@xeroneon.dev', cn: 'A', role: 'REQ-PARTICIPANT', partstat: 'ACCEPTED', rsvp: true },
        { uri: 'mailto:b@xeroneon.dev', role: 'OPT-PARTICIPANT', partstat: 'TENTATIVE' },
      ],
      recurrence: { freq: 'WEEKLY', byday: [{ weekday: 'MO' }, { weekday: 'WE' }, { weekday: 'FR' }] },
      categories: ['meeting', 'sync'],
      status: 'CONFIRMED',
      sequence: 3,
      created: '2026-01-01T00:00:00Z',
    }
    const ics = serializeCalendar([ev as never], { calendarName: 'Work', method: 'PUBLISH' })
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20260302T090000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(ics).toContain('PARTSTAT=ACCEPTED')
    expect(ics).toContain('RSVP=TRUE')
    expect(ics).toContain('BEGIN:VTIMEZONE')

    const items = parseCalendar(ics)
    expect(feedSummary(items)).toContain('1 event')
    const parsed = items[0]!
    expect(parsed.kind).toBe('event')
    expect(parsed.uid).toBe('evt_standup')
    expect((parsed as { dtstart: CalTime }).dtstart).toMatchObject({
      kind: 'zoned',
      tzid: 'America/Los_Angeles',
      date: { year: 2026, month: 3, day: 2 },
    })
    const atts = (parsed as { attendees: { uri: string; partstat?: string }[] }).attendees!
    expect(atts[0]!.uri).toBe('mailto:a@xeroneon.dev')
    expect(atts[0]!.partstat).toBe('ACCEPTED')
    expect(parsed.recurrence?.byday?.length).toBe(3)
  })

  it('escapes and unescapes TEXT values (commas, semicolons, newlines)', () => {
    const ev = {
      kind: 'event',
      uid: 'evt_esc',
      summary: 'Semi;colon, and comma',
      description: 'line1\nline2',
      dtstart: utc(2026, 1, 1, 9),
    }
    const ics = serializeCalendar([ev as never], {})
    const items = parseCalendar(ics)
    expect(items[0]!.summary).toBe('Semi;colon, and comma')
    expect(items[0]!.description).toBe('line1\nline2')
  })

  it('folds long lines at 75 octets and round-trips', () => {
    const longSummary = 'x'.repeat(140)
    const ics = serializeCalendar([{ kind: 'event', uid: 'u', summary: longSummary, dtstart: utc(2026, 1, 1, 9) } as never], {})
    expect(ics.split('\r\n').every((l) => l.length <= 76)).toBe(true)
    expect(parseCalendar(ics)[0]!.summary).toBe(longSummary)
  })
})

describe('tasks model (VTODO folded into calendar)', () => {
  it('completes a task and serializes COMPLETED + PERCENT-COMPLETE', () => {
    const t = {
      kind: 'task',
      uid: 'tdo_1',
      summary: 'Ship calendar',
      due: utc(2026, 9, 30, 17),
      status: 'NEEDS-ACTION',
    }
    const r = completeTask(t as never, { at: '2026-09-29T12:00:00Z' })
    expect(r.previous).toBe('NEEDS-ACTION')
    const done = t as unknown as { status: string; percentComplete: number }
    expect(done.status).toBe('COMPLETED')
    expect(done.percentComplete).toBe(100)

    const ics = serializeCalendar([t as never], {})
    const back = parseCalendar(ics)[0]!
    expect(back.kind).toBe('task')
    expect((back as { status?: string }).status).toBe('COMPLETED')
    expect((back as { percentComplete?: number }).percentComplete).toBe(100)
  })

  it('a VTODO and VEVENT coexist in one feed', () => {
    const ics = serializeCalendar(
      [
        { kind: 'event', uid: 'e1', summary: 'E', dtstart: utc(2026, 1, 1, 9) } as never,
        { kind: 'task', uid: 't1', summary: 'T', due: utc(2026, 1, 2, 9), status: 'NEEDS-ACTION' } as never,
      ],
      {},
    )
    const items = parseCalendar(ics)
    expect(items.map((i) => i.kind).sort()).toEqual(['event', 'task'])
  })
})

describe('attendee model helpers', () => {
  it('models mailto URIs, adds/removes and records responses', async () => {
    const { attendee, addAttendee, removeAttendee, reply, uriEmail } = await import('./attendees.js')
    const ev = { kind: 'event', uid: 'e', sequence: 0, attendees: [] as unknown[] } as never
    addAttendee(ev, attendee('a@xeroneon.dev', 'A'))
    expect((ev as { attendees: { uri: string }[] }).attendees[0]!.uri).toBe('mailto:a@xeroneon.dev')
    expect(addAttendee(ev, attendee('A@XERONEON.DEV'))).toBe(false)
    const { changed } = reply.decline(ev, 'mailto:a@xeroneon.dev')
    expect(changed).toBe(true)
    const a = (ev as { attendees: { partstat: string }[] }).attendees[0]!
    expect(a.partstat).toBe('DECLINED')
    expect(uriEmail('mailto:x@y.dev')).toBe('x@y.dev')
    expect(removeAttendee(ev, 'mailto:a@xeroneon.dev')).toBe(true)
  })
})

describe('time helpers', () => {
  it('parses + formats RFC date-times and durations', async () => {
    const { parseCalTime, secondsToDuration } = await import('./datetime.js')
    expect(parseCalTime('20260101')).toEqual({ kind: 'date', date: { year: 2026, month: 1, day: 1 } })
    expect(parseCalTime('20260101T090000Z')).toMatchObject({ kind: 'utc', time: { hour: 9 } })
    expect(parseCalTime('20260101T090000')).toMatchObject({ kind: 'floating' })
    expect(secondsToDuration(5400)).toBe('PT1H30M')
    expect(secondsToDuration(90061)).toBe('P1DT1H1M1S')
  })
})