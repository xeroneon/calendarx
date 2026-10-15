import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildApp } from './app.js'

describe('@calendax/server', () => {
  it('serves /api/health', async () => {
    const res = await request(buildApp(true)).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.name).toBe('calendax')
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
})