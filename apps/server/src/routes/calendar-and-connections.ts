/**
 * CalendarX server — thin CalDAV proxy + per-account connection store.
 *
 * CalendarX is a *CalDAV-generic client*: the browser/PWA must never hold the
 * upstream CalDAV password. This server stores each *account's* CalDAV
 * connection (base URL, auth mode, credentials) keyed by userId and proxies the
 * CalDAV protocol through `@calendarx/caldav`. Accounts are created via the
 * account gate (`/api/auth`); every route here is behind `requireAuth`, so an
 * unauthenticated visitor and every other account only ever see their own
 * connection and calendar (XER-316).
 */
import { Router, type Request, type Response } from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  CalDavClient,
  type CalDavAuth,
  type CalDavConnectionConfig,
} from '@calendarx/caldav'
import { newUid, type CalendarItem } from '@calendarx/calendar'
import { currentAuthUser } from '../auth.js'
import { reminderScheduler } from '../push/scheduler.js'
import { pushSubscriptionStore } from '../push/registry.js'

/** One account's saved CalDAV connection (persisted per-user, never shared). */
interface StoredConnection {
  id: string
  name: string
  principalUrl: string
  auth: CalDavAuth
  username?: string
  password?: string
  verified: boolean
  createdAt: string
}

/**
 * Per-account connection store: userId → that user's connection.
 *
 * XER-321: previously an in-memory `Map`, so EVERY server restart (app redeploy,
 * reboot, `systemctl --user restart calendarx-prod-api`) wiped every saved
 * CalDAV connection and the user had to re-enter all details. Persist to
 * `connections.json` in the same `CALENDARX_DATA_DIR` that already survives
 * restarts for accounts/sessions (auth.json), mode 0600 to match it. The raw
 * upstream password IS stored (the server needs it to proxy CalDAV) but never
 * returned to the browser (the GET route strips it).
 */
function dataDir(): string {
  return process.env.CALENDARX_DATA_DIR ?? path.join(process.cwd(), '.data')
}

class ConnectionStore {
  private byUser = new Map<string, StoredConnection>()
  private get file(): string {
    return path.join(dataDir(), 'connections.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const data = JSON.parse(raw) as { connections: Array<{ userId: string; connection: StoredConnection }> }
      this.byUser.clear()
      for (const entry of data.connections ?? []) {
        if (entry?.userId && entry?.connection) this.byUser.set(entry.userId, entry.connection)
      }
    } catch (err) {
      // Nonexistent or corrupt store → start empty (first run / migrate).
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      console.warn(`[connections] could not load ${this.file}: ${(err as Error).message}`)
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const out: { connections: Array<{ userId: string; connection: StoredConnection }> } = {
        connections: [...this.byUser.entries()].map(([userId, connection]) => ({ userId, connection })),
      }
      // Atomic write: temp file + rename so a concurrent/restarting reader
      // never sees a partially-written (torn) connections.json.
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(out, null, 2), { mode: 0o600 })
      await fs.rename(tmp, this.file)
    } catch (err) {
      console.warn(`[connections] could not persist ${this.file}: ${(err as Error).message}`)
    }
  }

  get(userId: string): StoredConnection | undefined {
    return this.byUser.get(userId)
  }

  async set(userId: string, connection: StoredConnection): Promise<void> {
    this.byUser.set(userId, connection)
    await this.persist()
  }

  /** Test hook: clear in-memory connections and reload from the data dir. */
  async resetAndLoad(): Promise<void> {
    this.byUser.clear()
    await this.load()
  }
}

export const connectionStore = new ConnectionStore()

/**
 * The active connection for the authenticated caller. With the account gate an
 * account sees exactly its own saved connection (or none → the connect screen).
 */
function activeConnection(req: Request): StoredConnection | null {
  const user = currentAuthUser(req)
  if (!user) return null
  return connectionStore.get(user.id) ?? null
}

/** Build a CalDavClient for the active connection (no password is exposed). */
function clientFor(c: StoredConnection): CalDavClient {
  const cfg: CalDavConnectionConfig = {
    baseUrl: c.principalUrl,
    auth: c.auth,
    username: c.username,
    password: c.password,
  }
  return new CalDavClient(cfg)
}

/* ---------------- reminder sweep (XER-334) ---------------- */

/**
 * Re-derive a user's pending reminders straight from their CalDAV server. Used
 * on subscription (re)registration and at boot so a freshly-restarted server
 * re-arms reminders without waiting for the UI to materialize a collection.
 */
export async function rescheduleUserFromCalDav(userId: string): Promise<void> {
  const conn = connectionStore.get(userId)
  if (!conn) return
  const client = clientFor(conn)
  let calendars: Awaited<ReturnType<CalDavClient['listCalendars']>>
  try {
    calendars = await client.listCalendars()
  } catch (err) {
    console.warn(`[push] sweep listCalendars failed for ${userId}: ${(err as Error).message}`)
    return
  }
  for (const cal of calendars) {
    try {
      const items = await client.queryItems(cal.href)
      reminderScheduler.rescheduleCollection(userId, encodeURIComponent(cal.href), items)
    } catch (err) {
      console.warn(`[push] sweep queryItems failed for ${userId}/${cal.href}: ${(err as Error).message}`)
    }
  }
}

/** Boot sweep: re-arm reminders for every registered device. Fire-and-forget. */
export async function sweepAllSubscribedUsers(): Promise<void> {
  const users = pushSubscriptionStore.subscribedUserIds()
  await Promise.all(users.map((u) => rescheduleUserFromCalDav(u).catch(() => undefined)))
}

export const connectionRouter = Router()
export const calendarRouter = Router()

/* ---------------- connections ---------------- */

/** GET /api/connections — the signed-in account's connection (no secrets). */
connectionRouter.get('/', (_req: Request, res: Response) => {
  const c = activeConnection(res.req)
  if (!c) {
    res.json({ ok: true, data: { connections: [] } })
    return
  }
  res.json({
    ok: true,
    data: {
      connections: [
        { id: c.id, name: c.name, principalUrl: c.principalUrl, auth: c.auth, verified: c.verified, createdAt: c.createdAt },
      ],
    },
  })
})

/** POST /api/connections/test — probe a CalDAV URL (never stored). */
connectionRouter.post('/test', async (req: Request, res: Response) => {
  const body = req.body as { url?: string; auth?: CalDavAuth; username?: string; password?: string }
  const { url } = body
  if (!url) {
    res.status(400).json({ ok: false, error: { code: 'missing_url', message: 'url is required' } })
    return
  }
  // Probe with the candidate credentials so a server that requires auth can be
  // validated on this screen; the probe result itself is never persisted.
  const probe = new CalDavClient({
    baseUrl: url,
    auth: body.auth ?? 'basic',
    username: body.username,
    password: body.password,
  })
  const result = await probe.probe()
  res.json({ ok: true, data: result })
})

/** POST /api/connections — save the signed-in account's CalDAV connection. */
connectionRouter.post('/', async (req: Request, res: Response) => {
  const user = currentAuthUser(req)
  if (!user) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'authentication required' } })
    return
  }
  const body = req.body as { name?: string; principalUrl?: string; auth?: CalDavAuth; username?: string; password?: string }
  if (!body.principalUrl) {
    res.status(400).json({ ok: false, error: { code: 'missing_url', message: 'principalUrl is required' } })
    return
  }
  const conn: StoredConnection = {
    id: newUid('conn'),
    name: body.name ?? 'My Calendar',
    principalUrl: body.principalUrl,
    auth: body.auth ?? 'app-password',
    username: body.username,
    password: body.password,
    verified: true,
    createdAt: new Date().toISOString(),
  }
  await connectionStore.set(user.id, conn)
  res.status(201).json({
    ok: true,
    data: {
      connection: { id: conn.id, name: conn.name, principalUrl: conn.principalUrl, auth: conn.auth, verified: true, createdAt: conn.createdAt },
    },
  })
})

/* ---------------- calendar ---------------- */

/** Map an upstream CalDavCalendar into the shared CalendarCollection shape. */
function toCollection(href: string, displayName: string, color?: string) {
  return {
    key: encodeURIComponent(href),
    displayName,
    color,
    description: undefined,
  }
}

/** GET /api/calendar — list calendars from the caller's upstream server. */
calendarRouter.get('/', async (_req: Request, res: Response) => {
  const c = activeConnection(res.req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  try {
    const cals = await clientFor(c).listCalendars()
    res.json({ ok: true, data: { calendars: cals.map((x) => toCollection(x.href, x.displayName, x.color)) } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})

/** GET /api/calendar/:key — list items in a collection (optionally kind-filtered). */
calendarRouter.get('/:key', async (req: Request, res: Response) => {
  const c = activeConnection(req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  const href = decodeURIComponent(String(req.params.key))
  const kind = req.query.kind
  try {
    const items = await clientFor(c).queryItems(href)
    const filtered = kind === 'task' ? items.filter((i) => i.kind === 'task') : kind === 'event' ? items.filter((i) => i.kind === 'event') : items
    // Materialization hook: reschedule this collection's reminders (alarms).
    const user = currentAuthUser(req)
    if (user) reminderScheduler.rescheduleCollection(user.id, String(req.params.key), items)
    res.json({ ok: true, data: { calendar: toCollection(href, href), items: filtered } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})

/** GET /api/calendar/:key/occurrences — expanded recurrence window. */
calendarRouter.get('/:key/occurrences', async (req: Request, res: Response) => {
  const c = activeConnection(req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  const href = decodeURIComponent(String(req.params.key))
  const start = req.query.start ? Math.floor(Date.parse(String(req.query.start)) / 1_000) : undefined
  const end = req.query.end ? Math.floor(Date.parse(String(req.query.end)) / 1_000) : undefined
  try {
    const items = await clientFor(c).queryItems(href, start, end)
    // Expand recurring items over the window using the engine's CalendarStore.
    const { CalendarStore } = await import('@calendarx/calendar')
    const store = new CalendarStore()
    for (const it of items) store.createItem(href, it)
    const occurrences = store.expand({ rangeStartUtc: start, rangeEndUtc: end, includeOverlapping: true })
    // Materialization hook: schedule reminders from the pulled items.
    const user = currentAuthUser(req)
    if (user) reminderScheduler.rescheduleCollection(user.id, String(req.params.key), items)
    res.json({ ok: true, data: { calendar: href, occurrences } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})

/** POST /api/calendar/:key/items — create an item in a collection. */
calendarRouter.post('/:key/items', async (req: Request, res: Response) => {
  const c = activeConnection(req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  const href = decodeURIComponent(String(req.params.key))
  const item = req.body as CalendarItem
  const uid = item.uid ?? newUid(item.kind === 'task' ? 'tdo' : 'evt')
  const withUid: CalendarItem = { ...item, uid }
  const objectHref = `${href.replace(/\/$/, '')}/${uid}.ics`
  try {
    const { etag } = await clientFor(c).putItem(objectHref, withUid)
    const user = currentAuthUser(req)
    if (user) reminderScheduler.scheduleItem(user.id, String(req.params.key), withUid)
    res.status(201).json({ ok: true, data: { item: withUid, etag } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})

/** PATCH /api/calendar/:key/items/:uid — replace an item (PUT with etag). */
calendarRouter.patch('/:key/items/:uid', async (req: Request, res: Response) => {
  const c = activeConnection(req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  const href = decodeURIComponent(String(req.params.key))
  const uid = String(req.params.uid)
  const existing = (await clientFor(c).getItem(`${href.replace(/\/$/, '')}/${uid}.ics`))?.[0]
  const reqBody = (req.body ?? {}) as Record<string, unknown>
  const base: CalendarItem = (existing ??
    (reqBody.kind === 'task'
      ? ({ kind: 'task', uid } as CalendarItem)
      : ({ kind: 'event', uid, dtstart: undefined } as unknown as CalendarItem)))
  const merged: CalendarItem = { ...base, ...reqBody, uid } as CalendarItem
  const objectHref = `${href.replace(/\/$/, '')}/${uid}.ics`
  try {
    const { etag } = await clientFor(c).putItem(objectHref, merged)
    const user = currentAuthUser(req)
    // Cancels the pre-edit reminders (old trigger/start) and re-arms from the new item.
    if (user) reminderScheduler.scheduleItem(user.id, String(req.params.key), merged)
    res.json({ ok: true, data: { item: merged, etag } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})

/** DELETE /api/calendar/:key/items/:uid. */
calendarRouter.delete('/:key/items/:uid', async (req: Request, res: Response) => {
  const c = activeConnection(req)
  if (!c) {
    res.status(503).json({ ok: false, error: { code: 'no_connection', message: 'no CalDAV connection configured' } })
    return
  }
  const href = decodeURIComponent(String(req.params.key))
  const uid = String(req.params.uid)
  try {
    await clientFor(c).deleteItem(`${href.replace(/\/$/, '')}/${uid}.ics`)
    const user = currentAuthUser(req)
    if (user) reminderScheduler.cancelItem(user.id, String(req.params.key), uid)
    res.json({ ok: true, data: { deleted: uid } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})