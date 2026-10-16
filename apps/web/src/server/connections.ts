/**
 * Connection server functions — the web app's proxy to the CalendarX server's
 * `/api/connections` (XER-310 first-run "add your CalDAV server" flow). The
 * browser never holds the upstream CalDAV password: these server-fns hand the
 * candidate connection (URL + auth mode + credentials) to the thin proxy, which
 * probes and stores it server-side, returning only non-secret metadata.
 */
import { createServerFn } from '@tanstack/react-start'
import type { CalDavConnection, SaveConnectionInput } from '@calendarx/sdk'
import { clientFor } from './api'

export type AuthMode = 'basic' | 'app-password' | 'oauth'

/** List saved CalDAV connections (no secrets). */
export const listConnections = createServerFn({ method: 'GET' })
  .validator((d: Record<string, never>) => d)
  .handler(async (_ctx: { context?: unknown }): Promise<CalDavConnection[]> => {
    const { connections } = await clientFor().connections.listConnections()
    return connections
  })

/** Live-probe a candidate CalDAV principal URL (+ auth) — never stored. */
export const testConnection = createServerFn({ method: 'POST' })
  .validator((d: { url: string; auth: AuthMode; username?: string; password?: string }) => d)
  .handler(async (_ctx: {
    context?: unknown
    data: { url: string; auth: AuthMode; username?: string; password?: string }
  }): Promise<{ ok: boolean; principal?: string; calendars?: string[] }> =>
    clientFor().connections.testConnection({
      url: _ctx.data.url,
      auth: _ctx.data.auth,
      username: _ctx.data.username,
      password: _ctx.data.password,
    }))

/** Save the active CalDAV connection (the server persists it, never the browser). */
export const saveConnection = createServerFn({ method: 'POST' })
  .validator((d: SaveConnectionInput) => d)
  .handler(async (_ctx: { context?: unknown; data: SaveConnectionInput }): Promise<CalDavConnection> => {
    const { connection } = await clientFor().connections.saveConnection(_ctx.data)
    return connection
  })