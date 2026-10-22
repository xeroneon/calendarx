import { afterEach, describe, expect, it } from 'vitest'
import type { CalendarEvent } from '@calendarx/calendar'
import {
  ReminderScheduler,
  alarmLabel,
  alarmMinutesFromTrigger,
  collectReminders,
  reminderKey,
} from './scheduler.js'
import type { PushSubscriptionStore } from './registry.js'
import { RecordingPushTransport } from './transport.js'

const ENDPOINT = 'https://notify.local/calx'

/** UTC CalTime from an epoch-ms instant (seconds are whole; sub-second dropped). */
function utcCalTime(ms: number): CalendarEvent['dtstart'] {
  const d = new Date(ms)
  return {
    kind: 'utc',
    date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
    time: { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() },
  }
}

const fakeReg = (endpoint = ENDPOINT) =>
  ({
    get: (id: string) => (id === 'u1' ? { transport: 'unifiedpush', endpoint, updatedAt: new Date().toISOString() } : undefined),
  }) as unknown as PushSubscriptionStore

const events: ReminderScheduler[] = []
function make(endpoint = ENDPOINT): { sch: ReminderScheduler; rec: RecordingPushTransport } {
  const rec = new RecordingPushTransport()
  const sch = new ReminderScheduler(fakeReg(endpoint), rec)
  events.push(sch)
  return { sch, rec }
}
afterEach(() => {
  for (const ev of events) ev.dispose()
  events.length = 0
})

describe('alarmMinutesFromTrigger', () => {
  it('parses RFC 5545 relative triggers into minutes-before', () => {
    expect(alarmMinutesFromTrigger('-PT15M')).toBe(15)
    expect(alarmMinutesFromTrigger('-PT1H30M')).toBe(90)
    expect(alarmMinutesFromTrigger('-P1D')).toBe(1440)
    expect(alarmMinutesFromTrigger('-P1DT1H')).toBe(1500)
  })
  it('yields negatives for after-start (positive) triggers and null for malformed', () => {
    expect(alarmMinutesFromTrigger('PT5M')).toBe(-5)
    expect(alarmMinutesFromTrigger('P1D')).toBe(-1440)
    expect(alarmMinutesFromTrigger('garbage')).toBeNull()
    expect(alarmMinutesFromTrigger('')).toBeNull()
  })
})

describe('collectReminders', () => {
  it('drops already-fired alarms and keeps ones still ahead', () => {
    const now = Date.now()
    const start = now + 10 * 60_000 // event in 10 minutes
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'e1',
      summary: 'Standup',
      dtstart: utcCalTime(start),
      alarms: [
        { action: 'DISPLAY', trigger: '-PT5M' }, // fires in 5 min → kept
        { action: 'DISPLAY', trigger: '-PT20M' }, // fired 10 min ago → dropped
      ],
    }
    const rems = collectReminders('u1', 'cal/main', [item], { nowMs: now })
    expect(rems).toHaveLength(1)
    const r = rems[0]!
    expect(r.eventKey).toBe('e1')
    expect(r.title).toBe('Standup')
    expect(r.at).toBeGreaterThan(now)
  })

  it('expands recurring items so each occurrence schedules its own reminder', () => {
    const now = Date.now()
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'rr1',
      summary: 'Daily',
      dtstart: utcCalTime(now + 60_000),
      recurrence: { freq: 'DAILY', count: 3 },
      alarms: [{ action: 'DISPLAY', trigger: '-PT30M' }],
    }
    const rems = collectReminders('u1', 'cal/main', [item], { nowMs: now, horizonMs: 5 * 24 * 60 * 60 * 1000 })
    expect(rems.length).toBeGreaterThanOrEqual(1)
    expect(new Set(rems.map((r) => r.key)).size).toBe(rems.length) // no duplicate keys
  })

  it('respects the horizon window (drops fires beyond it)', () => {
    const now = Date.now()
    // a: fires in ~5 min (inside the 3-day horizon); b: fires ~4 days out (beyond it).
    const a: CalendarEvent = { kind: 'event', uid: 'a', dtstart: utcCalTime(now + 10 * 60_000), alarms: [{ action: 'DISPLAY', trigger: '-PT5M' }] }
    const b: CalendarEvent = { kind: 'event', uid: 'b', dtstart: utcCalTime(now + 4 * 24 * 60 * 60 * 1000), alarms: [{ action: 'DISPLAY', trigger: '-PT5M' }] }
    const rems = collectReminders('u1', 'c', [a, b], { nowMs: now, horizonMs: 3 * 24 * 60 * 60 * 1000 })
    expect(rems).toHaveLength(1)
    expect(rems[0]!.eventKey).toBe('a')
  })
})

describe('ReminderScheduler — scheduled send fires at fire time', () => {
  it('arms a pending reminder and delivers via the transport at (near) fire time', async () => {
    const { sch, rec } = make()
    const mins = 5
    // Pick the next whole second as the fire time — deterministic, always future.
    const fireMs = (Math.floor(Date.now() / 1000) + 1) * 1000
    const occStart = fireMs + mins * 60_000
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'e-fire',
      summary: 'Fire me',
      location: 'Room 4',
      dtstart: utcCalTime(occStart),
      alarms: [{ action: 'DISPLAY', trigger: '-PT5M' }],
    }
    sch.rescheduleCollection('u1', 'cal/main', [item])
    expect(sch.pendingCount('u1')).toBe(1)
    await new Promise((r) => setTimeout(r, 1100)) // fire is ≤1000ms ahead
    expect(rec.deliveries).toHaveLength(1)
    const d = rec.deliveries[0]!
    expect(d.endpoint).toBe(ENDPOINT)
    expect(d.message.title).toBe('Fire me')
    expect(d.message.eventKey).toBe('e-fire')
    expect(sch.pendingCount('u1')).toBe(0) // fired → no longer pending
  })

  it('cancels a stale reminder when the item is edited (alarm removed)', async () => {
    const { sch, rec } = make()
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'e1',
      summary: 'Edit me',
      dtstart: utcCalTime(Date.now() + 20 * 60_000),
      alarms: [{ action: 'DISPLAY', trigger: '-PT15M' }], // fires in 5 min
    }
    sch.rescheduleCollection('u1', 'cal/main', [item])
    expect(sch.pendingCount('u1')).toBe(1)
    // Edit removes the alarm and pushes the start far out.
    const edited: CalendarEvent = {
      kind: 'event',
      uid: 'e1',
      summary: 'Edit me',
      dtstart: utcCalTime(Date.now() + 20 * 24 * 60 * 60 * 1000),
      alarms: [],
    }
    sch.scheduleItem('u1', 'cal/main', edited)
    expect(sch.pendingCount('u1')).toBe(0)
    await new Promise((r) => setTimeout(r, 30))
    expect(rec.deliveries).toHaveLength(0) // stale reminder never fired
  })

  it('skips delivery when the user unregisters their device before fire time', async () => {
    const rec = new RecordingPushTransport()
    const sch = new ReminderScheduler({ get: () => undefined } as unknown as PushSubscriptionStore, rec)
    events.push(sch)
    const fireMs = (Math.floor(Date.now() / 1000) + 1) * 1000
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'e-unreg',
      dtstart: utcCalTime(fireMs + 5 * 60_000),
      alarms: [{ action: 'DISPLAY', trigger: '-PT5M' }],
    }
    sch.rescheduleCollection('u1', 'c', [item])
    expect(sch.pendingCount('u1')).toBe(1)
    await new Promise((r) => setTimeout(r, 1100))
    expect(rec.deliveries).toHaveLength(0)
  })
})

describe('labels', () => {
  it('renders sensible reminder copy', () => {
    expect(alarmLabel(1)).toBe('1 minute before')
    expect(alarmLabel(15)).toBe('15 minutes before')
    expect(alarmLabel(60)).toBe('1 hour before')
    expect(alarmLabel(1440)).toBe('1 day before')
    expect(alarmLabel(0)).toBe('At event time')
  })
  it('keys are stable and distinct', () => {
    expect(reminderKey('u', 'c', 'id', 1, 5)).toBe(reminderKey('u', 'c', 'id', 1, 5))
    expect(reminderKey('u', 'c', 'id', 1, 5)).not.toBe(reminderKey('u', 'c', 'id', 1, 6))
    expect(reminderKey('u', 'c', 'id', 2, 5)).not.toBe(reminderKey('u', 'c', 'id', 1, 5))
  })
})