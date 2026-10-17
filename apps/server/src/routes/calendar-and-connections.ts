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
import {
  CalDavClient,
  type CalDavAuth,
  type CalDavConnectionConfig,
} from '@calendarx/caldav'
import { newUid, type CalendarItem } from '@calendarx/calendar'
import { currentAuthUser } from '../auth.js'

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

/** Per-account connection store: userId → that user's connection. */
const connectionsByUser = new Map<string, StoredConnection>()

/**
 * The active connection for the authenticated caller. With the account gate an
 * account sees exactly its own saved connection (or none → the connect screen).
 */
function activeConnection(req: Request): StoredConnection | null {
  const user = currentAuthUser(req)
  if (!user) return null
  return connectionsByUser.get(user.id) ?? null
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
connectionRouter.post('/', (req: Request, res: Response) => {
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
  connectionsByUser.set(user.id, conn)
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
    res.json({ ok: true, data: { deleted: uid } })
  } catch (err) {
    res.status(502).json({ ok: false, error: { code: 'caldav_error', message: (err as Error).message } })
  }
})