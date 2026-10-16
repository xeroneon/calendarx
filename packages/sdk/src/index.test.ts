import { describe, expect, it } from 'vitest'
import type { HealthStatus } from '@calendarx/types'
import type { CalendarEvent } from '@calendarx/calendar'
import { CalendaxClient } from './index.js'

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch
}

describe('@calendarx/sdk', () => {
  it('normalizes a trailing slash on baseUrl', () => {
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000/',
      fetchImpl: fakeFetch(200, { ok: true, data: {} }),
    })
    expect(c.baseUrl).toBe('http://localhost:3000')
  })

  it('GETs /api/health and returns the typed payload', async () => {
    const health: HealthStatus = {
      status: 'ok',
      version: '0.1.0',
      service: 'server',
      uptimeSeconds: 1,
    }
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(200, { ok: true, data: health }),
    })
    await expect(c.health()).resolves.toEqual(health)
  })

  it('throws on a non-ok response', async () => {
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(503, { error: 'down' }),
    })
    await expect(c.health()).rejects.toThrow('HTTP 503')
  })

  it('wraps a createItem call in the { ok, data } envelope', async () => {
    const item: CalendarEvent = {
      kind: 'event',
      uid: 'e1',
      summary: 'Standup',
      dtstart: { kind: 'utc', date: { year: 2026, month: 3, day: 2 }, time: { hour: 9, minute: 0, second: 0 } },
    }
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(201, { ok: true, data: { item } }),
    })
    await expect(c.calendar.createItem('main', item)).resolves.toEqual({ item })
  })
})