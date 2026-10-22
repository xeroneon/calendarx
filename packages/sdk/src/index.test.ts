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

  it('saves a CalDAV connection via connections.saveConnection', async () => {
    const connection = {
      id: 'conn_1',
      name: 'Home',
      principalUrl: 'https://nextcloud.dev/remote.php/dav',
      auth: 'app-password' as const,
      verified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(201, { ok: true, data: { connection } }),
    })
    await expect(
      c.connections.saveConnection({ principalUrl: connection.principalUrl, auth: 'app-password', username: 'u', password: 'p' }),
    ).resolves.toEqual({ connection })
  })
})
describe('@calendarx/sdk — push (XER-334)', () => {
  it('registers a UnifiedPush endpoint via push.register', async () => {
    const endpoint = 'https://notify.local/alice'
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(201, { ok: true, data: { subscription: { transport: 'unifiedpush', endpoint, updatedAt: '2026-10-22T00:00:00.000Z' } } }),
    })
    await expect(c.push.register('unifiedpush', endpoint)).resolves.toMatchObject({
      subscription: { transport: 'unifiedpush', endpoint },
    })
  })

  it('reads and removes a subscription via push.status / push.remove', async () => {
    const c = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(200, { ok: true, data: { subscription: null } }),
    })
    await expect(c.push.status()).resolves.toEqual({ subscription: null })
    const r = new CalendaxClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch(200, { ok: true, data: { removed: true } }),
    })
    await expect(r.push.remove()).resolves.toEqual({ removed: true })
  })
})
