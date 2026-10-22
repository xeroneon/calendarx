import type { ApiResponse } from '@calendarx/types'
import type {
  CalendarCollection,
  CalendarEvent,
  CalendarItem,
  CalendarTask,
  Occurrence,
} from '@calendarx/calendar'

/**
 * Re-export the canonical calendar/tasks domain types so consumers only need
 * the SDK as their typed surface (Phase 2.2 — XER-79, extracted to CalendarX).
 */
export type { CalTime, CalendarCollection, CalendarEvent, CalendarItem, CalendarTask, Occurrence } from '@calendarx/calendar'

/**
 * Typed API client for the CalendarX server.
 *
 * CalendarX is a *CalDAV-generic client*: the browser/PWA talks to this thin
 * server (which holds the upstream CalDAV connection config + proxies the
 * CalDAV protocol), and this SDK is the single typed surface for that server.
 * The wire surface mostly mirrors the calendar module the app is seeded from,
 * so the UI extraction (XER-79) continues to work against it.
 */

export interface CalendaxClientOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /**
   * Optional supplier of extra headers merged into every request (e.g. auth).
   * Evaluated per call so it can reflect a request-scoped bearer token.
   */
  authHeaders?: () => Record<string, string>
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  /** Raw body sent verbatim (e.g. upload bytes). */
  body?: string | Uint8Array | ArrayBuffer
  /** Return the raw response body instead of unwrapping { ok, data }. */
  raw?: boolean
  /** Per-request timeout override. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`request timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Health/naming metadata reported by the CalendarX server root. */
export interface ServerInfo {
  service: string
  name: string
  version: string
  status: 'ok'
}

export class CalendaxClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly authHeaders?: CalendaxClientOptions['authHeaders']

  constructor(options: CalendaxClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.authHeaders = options.authHeaders
  }

  /** Merge request-supplied headers with the client-level auth supplier. */
  private mergedHeaders(opts: RequestOptions): Record<string, string> | HeadersInit | undefined {
    const supplierHeaders = this.authHeaders?.() ?? {}
    if (Object.keys(supplierHeaders).length === 0) return opts.headers
    return { ...supplierHeaders, ...(opts.headers ?? {}) }
  }

  /**
   * Low-level request: unwraps the { ok, data } envelope (or returns raw
   * bytes for `raw: true`). Shared by every typed method.
   */
  async call<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, raw = false } = opts
    const headers = this.mergedHeaders(opts)
    const res = await withTimeout(
      this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body as BodyInit | undefined,
      }),
      opts.timeoutMs ?? this.timeoutMs,
    )
    if (!res.ok) {
      let message = `request failed: HTTP ${res.status}`
      try {
        const e = (await res.json()) as { error?: { message?: string } }
        if (e?.error?.message) message = e.error.message
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`${method} ${path} failed: ${message}`)
    }
    if (res.status === 204) return undefined as T
    if (raw) return (await res.arrayBuffer()) as unknown as T
    const json = (await res.json()) as ApiResponse<T>
    if (!json.ok) throw new Error(json.error?.message ?? `${method} ${path} failed`)
    return json.data
  }

  /** GET /api/health — service liveness. */
  async health(): Promise<ServerInfo> {
    return this.call<ServerInfo>('/api/health')
  }

  /** The typed Calendar + Tasks module client. */
  get calendar(): CalendarClient {
    return new CalendarClient(this)
  }

  /** The CalDAV connection-config client (first-run "add your server"). */
  get connections(): ConnectionClient {
    return new ConnectionClient(this)
  }

  /** The UnifiedPush subscription client (device reminder delivery, XER-334). */
  get push(): PushClient {
    return new PushClient(this)
  }
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...extra })

/** Describes an upstream CalDAV server the app has been told to use. */
export interface CalDavConnection {
  id: string
  /** Human label, e.g. "Home Nextcloud". */
  name: string
  /** CalDAV principal URL, e.g. https://nextcloud.dev/remote.php/dav. */
  principalUrl: string
  /** Which protocol/auth the server uses (detail the client hardening card fills in). */
  auth: 'basic' | 'app-password' | 'oauth'
  /** True when a live PROPFIND has succeeded against the principal. */
  verified: boolean
  createdAt: string
}

/**
 * Typed surface for `/api/connections` — the server stores the upstream CalDAV
 * connection (URL + credential reference) so the browser never holds the
 * CalDAV password. Seeded with the enumerate/probe calls; the full CRUD +
 * multi-server hardening is the "Connection/settings" follow-on card.
 */
export class ConnectionClient {
  constructor(private readonly client: CalendaxClient) {}

  /** List saved CalDAV connections (no secrets). */
  listConnections(): Promise<{ connections: CalDavConnection[] }> {
    return this.client.call('/api/connections')
  }

  /** Probe a CalDAV principal URL (PROPFIND) — does it speak CalDAV? */
  testConnection(input: TestConnectionInput): Promise<{ ok: boolean; principal?: string; calendars?: string[] }> {
    return this.client.call('/api/connections/test', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(input),
    })
  }

  /** Save the active CalDAV connection (the server stores it, never the browser). */
  saveConnection(input: SaveConnectionInput): Promise<{ connection: CalDavConnection }> {
    return this.client.call('/api/connections', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(input),
    })
  }
}

/** Inputs for a live probe of a candidate CalDAV principal URL. */
export interface TestConnectionInput {
  url: string
  auth: 'basic' | 'app-password' | 'oauth'
  username?: string
  password?: string
}

/** Inputs to persist a CalDAV connection on the server. */
export interface SaveConnectionInput {
  /** Human label, e.g. "Home Nextcloud". */
  name?: string
  /** CalDAV principal URL, e.g. https://nextcloud.dev/remote.php/dav. */
  principalUrl: string
  auth: 'basic' | 'app-password' | 'oauth'
  username?: string
  password?: string
}

/**
 * Typed surface for the calendar module (`/api/calendar`). Events and tasks
 * share the `CalendarItem` model (a task is an event plus COMPLETED state),
 * so one client serves both the calendar views and the task list.
 */
export class CalendarClient {
  constructor(private readonly client: CalendaxClient) {}

  /** List named calendar collections (from the upstream CalDAV server). */
  listCalendars(): Promise<{ calendars: CalendarCollection[] }> {
    return this.client.call('/api/calendar')
  }

  /** List items in a calendar, optionally filtered to events or tasks. */
  listItems(key: string, kind: 'event' | 'task' | 'all' = 'all'): Promise<{ calendar: CalendarCollection; items: CalendarItem[] }> {
    const q = kind === 'all' ? '' : `?kind=${kind}`
    return this.client.call(`/api/calendar/${encodeURIComponent(key)}${q}`)
  }

  /** Create an event or task in the calendar. */
  createItem(key: string, item: CalendarEvent | CalendarTask): Promise<{ item: CalendarItem }> {
    return this.client.call(`/api/calendar/${encodeURIComponent(key)}/items`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(item),
    })
  }

  /** Update an existing item (edit an event's times, summary, recurrence…). */
  updateItem(key: string, uid: string, patch: Partial<CalendarEvent | CalendarTask>): Promise<{ item: CalendarItem }> {
    return this.client.call(`/api/calendar/${encodeURIComponent(key)}/items/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify(patch),
    })
  }

  /** Delete an item. */
  deleteItem(key: string, uid: string): Promise<{ deleted: string }> {
    return this.client.call(`/api/calendar/${encodeURIComponent(key)}/items/${encodeURIComponent(uid)}`, { method: 'DELETE' })
  }

  /** Expand recurring items into concrete occurrences over a UTC window. */
  expand(key: string, start: string, end: string): Promise<{ calendar: string; occurrences: Occurrence[] }> {
    return this.client.call(`/api/calendar/${encodeURIComponent(key)}/occurrences?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
  }
}
/** The only transport the platform uses today — see docs/push-notifications.md. */
export type PushTransportKind = 'unifiedpush'

/** A device's registered UnifiedPush endpoint on the CalendarX server. */
export interface PushSubscription {
  transport: PushTransportKind
  /** The UnifiedPush endpoint the server pushes reminder payloads to. */
  endpoint: string
  updatedAt: string
}

/**
 * Typed surface for `/api/push` — the per-account UnifiedPush subscription the
 * app registers (from a UP distributor on the phone) so the server can deliver
 * reminders at fire time (XER-334). Behind the same auth as connections/calendar.
 */
export class PushClient {
  constructor(private readonly client: CalendaxClient) {}

  /** Read the caller's registered device subscription (or null). */
  status(): Promise<{ subscription: PushSubscription | null }> {
    return this.client.call('/api/push/subscription')
  }

  /** Register (or update) the caller's UnifiedPush device endpoint. */
  register(transport: PushTransportKind, endpoint: string): Promise<{ subscription: PushSubscription }> {
    return this.client.call('/api/push/subscription', {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ transport, endpoint }),
    })
  }

  /** Unregister the caller's device (stops server-side reminder delivery). */
  remove(): Promise<{ removed: boolean }> {
    return this.client.call('/api/push/subscription', { method: 'DELETE' })
  }
}
