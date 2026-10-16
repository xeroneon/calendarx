/**
 * CalendarX server — thin CalDAV proxy + connection store.
 *
 * CalendarX is a *CalDAV-generic client*: the browser/PWA must never hold the
 * upstream CalDAV password. This server stores the active CalDAV connection
 * (base URL, principal, auth mode) and proxies the CalDAV protocol through
 * `@calendax/caldav`, translating upstream collections/items into the shared
 * domain model from `@calendax/calendar`. Web hooks for the connection screen
 * live at `/api/connections`; the calendar surface at `/api/calendar`.
 *
 * SEED SCOPE: a single in-memory connection (Radicale is the seed/deploy default
 * backend; CalDAV-generic — works with Nextcloud/Radicale/Baikal/iCloud too).
 * Multi-connection + per-connection persistence is the settings follow-on card.
 */

import { Router, type Request, type Response } from 'express'
import {
  CalDavClient,
  type CalDavAuth,
  type CalDavConnectionConfig,
} from '@calendax/caldav'
import { newUid, type CalendarItem } from '@calendax/calendar'

/** In-memory active CalDAV connection (replaced by durable store in a later card). */
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

let connection: StoredConnection | null = null

/** Seed default: the app's own Radicale backend (env-configured). */
export function defaultConnection(): StoredConnection | null {
  const env = process.env.CALDAV_BASE_URL
  if (!env) return null
  return {
    id: 'default',
    name: process.env.CALDAV_NAME ?? 'Home Calendar',
    principalUrl: env,
    auth: (process.env.CALDAV_AUTH as CalDavAuth) ?? 'basic',
    username: process.env.CALDAV_USERNAME,
    password: process.env.CALDAV_PASSWORD,
    verified: false,
    createdAt: new Date().toISOString(),
  }
}

function activeConnection(): StoredConnection | null {
  return connection ?? defaultConnection()
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

/** GET /api/connections — the saved connection (no secrets). */
connectionRouter.get('/', (_req: Request, res: Response) => {
  const c = activeConnection()
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
  const body = req.body as { url?: string; auth?: CalDavAuth }
  const url = body.url
  if (!url) {
    res.status(400).json({ ok: false, error: { code: 'missing_url', message: 'url is required' } })
    return
  }
  const probe = new CalDavClient({ baseUrl: url, auth: body.auth ?? 'basic' })
  const result = await probe.probe()
  res.json({ ok: true, data: result })
})

/** POST /api/connections — save the active CalDAV connection. */
connectionRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as { name?: string; principalUrl?: string; auth?: CalDavAuth; username?: string; password?: string }
  if (!body.principalUrl) {
    res.status(400).json({ ok: false, error: { code: 'missing_url', message: 'principalUrl is required' } })
    return
  }
  connection = {
    id: newUid('conn'),
    name: body.name ?? 'My Calendar',
    principalUrl: body.principalUrl,
    auth: body.auth ?? 'app-password',
    username: body.username,
    password: body.password,
    verified: true,
    createdAt: new Date().toISOString(),
  }
  res.status(201).json({
    ok: true,
    data: {
      connection: { id: connection.id, name: connection.name, principalUrl: connection.principalUrl, auth: connection.auth, verified: true, createdAt: connection.createdAt },
    },
  })
})

/* ---------------- calendar ---------------- */

function requireConnection(res: Response): StoredConnection | null {
  const c = activeConnection()
  if (!c) return null
  return c
}

/** Map an upstream CalDavCalendar into the shared CalendarCollection shape. */
function toCollection(href: string, displayName: string, color?: string) {
  return {
    key: encodeURIComponent(href),
    displayName,
    color,
    description: undefined,
  }
}

/** GET /api/calendar — list calendars from the upstream server. */
calendarRouter.get('/', async (_req: Request, res: Response) => {
  const c = requireConnection(res)
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
  const c = requireConnection(res)
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
  const c = requireConnection(res)
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
    const { CalendarStore } = await import('@calendax/calendar')
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
  const c = requireConnection(res)
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
  const c = requireConnection(res)
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
  const c = requireConnection(res)
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