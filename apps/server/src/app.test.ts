import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import type { Express } from 'express'
import { buildApp } from './app.js'
import { authStore } from './auth.js'

const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'cx-auth-'))

beforeAll(async () => {
  process.env.CALENDARX_DATA_DIR = DATA_DIR
  await authStore.resetAndLoad()
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
})