import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildApp } from './app.js'

describe('@calendarx/server', () => {
  it('serves /api/health', async () => {
    const res = await request(buildApp(true)).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.name).toBe('calendarx')
  })

  it('returns an empty connection list when no CalDAV backend is configured', async () => {
    delete process.env.CALDAV_BASE_URL
    const res = await request(buildApp(true)).get('/api/connections')
    expect(res.status).toBe(200)
    expect(res.body.data.connections).toEqual([])
  })

  it('rejects a connection-save without a principalUrl', async () => {
    const res = await request(buildApp(true)).post('/api/connections').send({ name: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })

  it('probes a connection URL (unreachable -> ok:false, never stored)', async () => {
    // An unroutable URL makes the CalDAV probe fail gracefully inside the
    // client, which the /test route returns as ok:false without storing.
    const res = await request(buildApp(true))
      .post('/api/connections/test')
      .send({ url: 'http://127.0.0.1:1/caldav', auth: 'basic', username: 'u', password: 'p' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.ok).toBe(false)
  })

  it('requires a url for /connections/test', async () => {
    const res = await request(buildApp(true)).post('/api/connections/test').send({ auth: 'basic' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('missing_url')
  })
})