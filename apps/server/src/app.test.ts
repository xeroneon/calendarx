import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import type { Express } from 'express'
import { buildApp } from './app.js'
import { authStore } from './auth.js'
import { connectionStore } from './routes/calendar-and-connections.js'
import { pushSubscriptionStore } from './push/registry.js'
import { reminderScheduler } from './push/scheduler.js'

const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'cx-auth-'))

beforeAll(async () => {
  process.env.CALENDARX_DATA_DIR = DATA_DIR
  await authStore.resetAndLoad()
  await connectionStore.resetAndLoad()
  await pushSubscriptionStore.resetAndLoad()
  reminderScheduler.dispose()
})

function app(): Express {
  return buildApp(true)
}

/** Create an account and return a cookie-authenticated supertest agent. */
async function signedIn(email: string, password = 'correct-horse'): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app())
  const res = await agent.post('/api/auth/signup').send({ email, password })
  expect(res.status).toBe(201)
  return agent
}

describe('@calendarx/server — account gate (XER-316)', () => {
  it('serves /api/health publicly', async () => {
    const res = await request(app()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.name).toBe('calendarx')
  })

  it('gates /api/connections and /api/calendar behind auth (401 anonymous)', async () => {
    const anon = request(app())
    expect((await anon.get('/api/connections')).status).toBe(401)
    expect((await anon.get('/api/calendar')).status).toBe(401)
    expect((await anon.post('/api/connections').send({ principalUrl: 'x' })).status).toBe(401)
  })

  it('signs up, returns a user (no leak of secret material), and /me resolves', async () => {
    const agent = request.agent(app())
    const signup = await agent.post('/api/auth/signup').send({ email: 'a@example.com', password: 'hunter22!' })
    expect(signup.status).toBe(201)
    expect(signup.body.data.user.email).toBe('a@example.com')
    expect(signup.body.data.user.passHash).toBeUndefined()

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.data.user.email).toBe('a@example.com')
  })

  it('rejects a duplicate email and a short password', async () => {
    const dup = await request(app()).post('/api/auth/signup').send({ email: 'a@example.com', password: 'xXxxxxxx1' })
    expect(dup.status).toBe(409)
    const short = await request(app()).post('/api/auth/signup').send({ email: 'new@example.com', password: 'short' })
    expect(short.status).toBe(400)
  })

  it('rejects signup with 403 when public signup is disabled (CALENDARX_ALLOW_SIGNUP=false)', async () => {
    process.env.CALENDARX_ALLOW_SIGNUP = 'false'
    try {
      const res = await request(app()).post('/api/auth/signup').send({ email: 'locked@example.com', password: 'hunter22!' })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('signup_disabled')
      // login still works for an existing account when signup is closed
      const login = await request(app()).post('/api/auth/login').send({ email: 'a@example.com', password: 'hunter22!' })
      expect(login.status).toBe(200)
    } finally {
      delete process.env.CALENDARX_ALLOW_SIGNUP
    }
  })

  it('logs in with the right password and rejects a wrong one', async () => {
    const bad = await request(app()).post('/api/auth/login').send({ email: 'a@example.com', password: 'nope-nope' })
    expect(bad.status).toBe(401)
    const agent = request.agent(app())
    const ok = await agent.post('/api/auth/login').send({ email: 'a@example.com', password: 'hunter22!' })
    expect(ok.status).toBe(200)
    expect((await agent.get('/api/calendar')).status).toBe(503) // authed, but no connection yet
  })

  it('stores and lists a connection per account, isolated between accounts', async () => {
    const alice = await signedIn('alice@example.com')
    const bob = await signedIn('bob@example.com')

    // Alice saves a connection; Bob sees none.
    expect((await alice.get('/api/connections')).body.data.connections).toEqual([])
    const save = await alice.post('/api/connections').send({
      name: 'Alice Home',
      principalUrl: 'https://alice.example/caldav',
      auth: 'basic',
      username: 'alice',
      password: 'secret',
    })
    expect(save.status).toBe(201)
    expect(save.body.data.connection.password).toBeUndefined()

    const aliceList = (await alice.get('/api/connections')).body.data.connections
    expect(aliceList).toHaveLength(1)
    expect(aliceList[0].principalUrl).toBe('https://alice.example/caldav')

    expect((await bob.get('/api/connections')).body.data.connections).toEqual([])
    expect((await bob.get('/api/calendar')).status).toBe(503)
  })

  it('logs out and requires a fresh session afterwards', async () => {
    const alice = await signedIn('alice2@example.com')
    expect((await alice.get('/api/connections')).status).toBe(200)
    expect((await alice.post('/api/auth/logout')).status).toBe(200)
    expect((await alice.get('/api/connections')).status).toBe(401)
  })

  it('probes a connection URL without storing (auth-gated)', async () => {
    const agent = await signedIn('probe@example.com')
    const res = await agent
      .post('/api/connections/test')
      .send({ url: 'http://127.0.0.1:1/caldav', auth: 'basic', username: 'u', password: 'p' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.ok).toBe(false)
    expect((await agent.get('/api/connections')).body.data.connections).toEqual([])
  })

  it('requires a url for /connections/test', async () => {
    const agent = await signedIn('probe2@example.com')
    const res = await agent.post('/api/connections/test').send({ auth: 'basic' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('missing_url')
  })

  it('XER-321: a saved connection survives a server restart (persisted to disk)', async () => {
    const alice = await signedIn('persist@example.com')
    const save = await alice.post('/api/connections').send({
      name: 'Persisted Home',
      principalUrl: 'https://radicale.xeroneon.dev/',
      auth: 'basic',
      username: 'xeroneon',
      password: 'topsecret',
    })
    expect(save.status).toBe(201)

    // Simulate an app redeploy: drop all in-memory state and reload from disk,
    // exactly what startServer() does on boot.
    await connectionStore.resetAndLoad()

    // The connection is still present for the account, with credentials intact
    // server-side (never echoed back to the browser).
    const list = (await alice.get('/api/connections')).body.data.connections
    expect(list).toHaveLength(1)
    expect(list[0].principalUrl).toBe('https://radicale.xeroneon.dev/')
    expect(list[0].password).toBeUndefined()
  })
})

describe('@calendarx/server — push subscription registry (XER-334)', () => {
  it('gates /api/push behind auth (401 anonymous)', async () => {
    const anon = request(app())
    expect((await anon.get('/api/push/subscription')).status).toBe(401)
    expect((await anon.put('/api/push/subscription').send({ transport: 'unifiedpush', endpoint: 'https://x.local/t' })).status).toBe(401)
    expect((await anon.delete('/api/push/subscription')).status).toBe(401)
  })

  it('registers, reads and removes a UnifiedPush endpoint per account (isolated)', async () => {
    const alice = await signedIn('push-alice@example.com')
    const bob = await signedIn('push-bob@example.com')

    expect((await alice.get('/api/push/subscription')).body.data.subscription).toBeNull()
    expect((await alice.get('/api/push/subscription')).status).toBe(200)

    const reg = await alice
      .put('/api/push/subscription')
      .send({ transport: 'unifiedpush', endpoint: 'https://notify.local/alice' })
    expect(reg.status).toBe(201)
    expect(reg.body.data.subscription.endpoint).toBe('https://notify.local/alice')
    expect(reg.body.data.subscription.transport).toBe('unifiedpush')

    // Bob (different account) never sees Alice's endpoint.
    expect((await bob.get('/api/push/subscription')).body.data.subscription).toBeNull()

    // Re-register updates (new endpoint replaces the old).
    await alice.put('/api/push/subscription').send({ transport: 'unifiedpush', endpoint: 'https://notify.local/alice2' })
    expect((await alice.get('/api/push/subscription')).body.data.subscription.endpoint).toBe('https://notify.local/alice2')

    const del = await alice.delete('/api/push/subscription')
    expect(del.status).toBe(200)
    expect(del.body.data.removed).toBe(true)
    expect((await alice.get('/api/push/subscription')).body.data.subscription).toBeNull()
  })

  it('rejects an unsupported transport and a non-URL endpoint', async () => {
    const agent = await signedIn('push-validate@example.com')
    const badTransport = await agent.put('/api/push/subscription').send({ transport: 'fcm', endpoint: 'https://x/t' })
    expect(badTransport.status).toBe(400)
    expect(badTransport.body.error.code).toBe('unsupported_transport')
    const badUrl = await agent.put('/api/push/subscription').send({ transport: 'unifiedpush', endpoint: 'not-a-url' })
    expect(badUrl.status).toBe(400)
    expect(badUrl.body.error.code).toBe('invalid_endpoint')
  })
})