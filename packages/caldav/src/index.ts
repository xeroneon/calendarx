/**
 * @calendarx/caldav — the CalDAV-generic CLIENT for CalendarX.
 *
 * Talks the CalDAV wire protocol (RFC 4791 / RFC 4918 WebDAV) against ANY
 * standards-compliant server: Nextcloud Calendar, Radicale, Baikal, iCloud.
 * Uses the RFC 5545 engine from `@calendarx/calendar` to parse/serialize the
 * iCalendar payloads carried over the wire, so CALDAV and ICS stay in lock-step.
 *
 * SEED SCOPE (XER-303): this is the baseline client — principal discovery,
 * calendar-collection listing, calendar-query REPORT, and per-object
 * GET/PUT/DELETE with etags. The multi-server hardening (Digest/OAuth for
 * iCloud, timezone edge cases, pagination, mkcalendar, free-busy) is the
 * dedicated follow-on card.
 */

import {
  parseCalendar,
  serializeCalendar,
  type CalendarCollection,
  type CalendarItem,
} from '@calendarx/calendar'

/**
 * How this CalDAV connection authenticates. `basic` covers Nextcloud /
 * Radicale / Baikal (user + app-password); `oauth` is the iCloud DAV session
 * token flow (later card). The credential VALUE never passes through the
 * browser — it is stored server-side and used by the proxy.
 */
export type CalDavAuth = 'basic' | 'app-password' | 'oauth'

export interface CalDavConnectionConfig {
  /** Base URL of the CalDAV endpoint, e.g. https://nextcloud/remote.php/dav. */
  baseUrl: string
  /** Principal path suffix, e.g. `calendars/<user>/`. */
  principalPath?: string
  auth: CalDavAuth
  /** Basic-auth username (or app-password username). */
  username?: string
  /** Basic-auth password / app password. */
  password?: string
  /** iCloud session token (oauth only). */
  sessionToken?: string
}

export interface CalDavServerOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** A discovered calendar collection on the upstream server. */
export interface CalDavCalendar {
  /** Absolute href of the calendar collection. */
  href: string
  displayName: string
  color?: string
  /** RFC 5545 resource types (VEVENT / VTODO support). */
  supportsEvents: boolean
  supportsTasks: boolean
  /** Server etag for the collection's calendar-home-set (if returned). */
  etag?: string
}

const DEFAULT_TIMEOUT_MS = 12_000

/** RFC 3339-ish UTC timestamp now (for DAV:getlastmodified fallback). */
function isoNow(): string {
  return new Date().toISOString()
}

/**
 * Minimal XML helpers — CalDAV is XML-over-HTTP and the seed keeps this
 * dependency-free (regex-free parsing is a hardening card if it grows hairy;
 * a full XML parser like @xmldom/xmldom is the natural add there).
 */

/** Escape a string for inclusion inside an XML text/tag body. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlTag(tag: string, attrs: Record<string, string>, body?: string): string {
  if (body === undefined) return `<${tag}${attrStr(attrs)}/>`
  return `<${tag}${attrStr(attrs)}>${body}</${tag}>`
}

function attrStr(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${xmlEscape(v)}"`)
    .join('')
}

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"'

/** All props we request for a calendar collection (matching the model). */
const PROPFIND_PROPS = [
  'd:displayname',
  'd:resourcetype',
  'd:getetag',
  'cs:calendar-color',
  'c:supported-calendar-component-set',
].join('')

/** MIME types we treat as iCalendar payload. */
const ICS_CONTENT_TYPES = ['text/calendar', 'text/plain']
/** XML content types for REPORT/PROPFIND responses. */
const XML_CONTENT_TYPES = ['application/xml', 'text/xml']

/**
 * CalDavClient — thin protocol client over any CalDAV server.
 *
 * All list/read/write methods return plain types from `@calendarx/calendar`
 * (CalendarCollection / CalendarItem), so the UI consumes the same domain
 * model whether the backend is Nextcloud, Radicale, Baikal or iCloud.
 */
export class CalDavClient {
  private readonly config: CalDavConnectionConfig
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(config: CalDavConnectionConfig, options: CalDavServerOptions = {}) {
    this.config = { principalPath: 'calendars/', ...config }
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '')
  }

  /** Absolute URL for a DAV path/href (handles relative + absolute hrefs). */
  private urlFor(href: string): string {
    if (/^https?:\/\//.test(href)) return href
    return `${this.baseUrl}/${href.replace(/^\//, '')}`
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      ...this.authHeaders(),
      ...(extra ?? {}),
    }
  }

  private authHeaders(): Record<string, string> {
    const { auth, username, password, sessionToken } = this.config
    if ((auth === 'basic' || auth === 'app-password') && username && password !== undefined) {
      const b64 = btoa(`${username}:${password}`)
      return { authorization: `Basic ${b64}` }
    }
    if (auth === 'oauth' && sessionToken) {
      return { authorization: `Bearer ${sessionToken}` }
    }
    return {}
  }

  private async request(method: string, url: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; headers: Headers }> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(url, { method, headers, body, signal: ctrl.signal })
      const text = await res.text()
      return { status: res.status, body: text, headers: new Headers(res.headers) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** PROPFIND depth:0 on a principal to locate the calendar-home-set. */
  async findPrincipalHome(basePath?: string): Promise<string> {
    const path = basePath ?? this.config.principalPath ?? ''
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<d:propfind ${NS}>`,
      '  <d:prop>',
      '    <d:current-user-principal />',
      '    <d:principal-URL />',
      '    <c:calendar-home-set />',
      '  </d:prop>',
      '</d:propfind>',
    ].join('\n')
    const res = await this.request('PROPFIND', this.urlFor(path), this.headers({ 'Content-Type': 'application/xml', Depth: '0' }), body)
    if (res.status >= 400) this.throwDav('principal discovery failed', res.status, res.body)
    const home = /<c:calendar-home-set[^>]*>[\s\S]*?<d:href>([^<]+)<\/d:href>/.exec(res.body)
    return home ? home[1]! : path
  }

  /** List calendar collections under the user's calendar-home-set. */
  async listCalendars(): Promise<CalDavCalendar[]> {
    const home = await this.findPrincipalHome()
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<d:propfind ${NS}>`,
      `  <d:prop>${PROPFIND_PROPS}</d:prop>`,
      '</d:propfind>',
    ].join('\n')
    const res = await this.request('PROPFIND', this.urlFor(home), this.headers({ 'Content-Type': 'application/xml', Depth: '1' }), body)
    if (res.status >= 400) this.throwDav('calendar listing failed', res.status, res.body)

    const calendars: CalDavCalendar[] = []
    // Match each <d:response> block and pull its href + props.
    const responses = matchAll(res.body, /<d:response>([\s\S]*?)<\/d:response>/g)
    for (const block of responses) {
      const hrefMatch = /<d:href>([^<]+)<\/d:href>/.exec(block)
      const typeMatch = /<d:resourcetype>([\s\S]*?)<\/d:resourcetype>/.exec(block)
      if (!hrefMatch) continue
      const isCalendar = typeMatch?.[0]?.includes('<c:calendar />') || typeMatch?.[0]?.includes('<c:calendar/>')
      // Only real calendar collections (skip principal + home-set containers).
      if (!isCalendar) continue
      const display = readTag(block, 'd:displayname') ?? lastPathSegment(hrefMatch[1]!)
      const color = readTag(block, 'cs:calendar-color')
      const etag = readTag(block, 'd:getetag')
      const compSet = matchAll(block, /<c:comp name="([^"]+)"\s*\/\s*>/g)
      calendars.push({
        href: hrefMatch[1]!,
        displayName: display,
        color,
        supportsEvents: compSet.includes('VEVENT'),
        supportsTasks: compSet.includes('VTODO'),
        etag,
      })
    }
    return calendars
  }

  /** Calendar-query REPORT: events+tasks over a UTC window (or all if no range). */
  async queryItems(href: string, rangeStartUtc?: number, rangeEndUtc?: number): Promise<CalendarItem[]> {
    const filter = rangeStartUtc !== undefined
      ? xmlTag('c:comp-filter', { name: 'VCALENDAR' },
          xmlTag('c:comp-filter', { name: 'VEVENT' },
            xmlTag('c:time-range', { start: isoIcsTime(rangeStartUtc), end: isoIcsTime(rangeEndUtc ?? rangeStartUtc + 1) })))
      : ''
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<c:calendar-query ${NS}>`,
      '  <d:prop>',
      '    <d:getetag />',
      '    <d:getcontenttype />',
      '    <c:calendar-data />',
      '  </d:prop>',
      filter,
      '</c:calendar-query>',
    ].join('\n')
    const res = await this.request('REPORT', this.urlFor(href), this.headers({ 'Content-Type': 'application/xml', Depth: '1' }), body)
    if (res.status >= 400) this.throwDav('calendar-query failed', res.status, res.body)

    const items: CalendarItem[] = []
    const responses = matchAll(res.body, /<d:response>([\s\S]*?)<\/d:response>/g)
    for (const block of responses) {
      const data = /<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/.exec(block)
      if (!data) continue
      // Unescape entities the XML layer folded into the calendar-data value.
      const ics = decodeXmlEntities(data[1]!).trim()
      for (const parsed of parseCalendar(ics)) items.push(parsed)
    }
    return items
  }

  /** GET a single object's raw text/calendar payload. */
  async getItem(href: string): Promise<CalendarItem[] | null> {
    const headers = this.headers({ Accept: 'text/calendar' })
    const res = await this.request('GET', this.urlFor(href), headers)
    if (res.status === 404) return null
    if (res.status >= 400) this.throwDav('GET item failed', res.status, res.body)
    return parseCalendar(res.body)
  }

  /** PUT a serialized item into a calendar collection (needs an etag for update). */
  async putItem(href: string, item: CalendarItem, etag?: string): Promise<{ etag: string }> {
    const body = serializeCalendar([item], { calendarName: lastPathSegment(href) })
    const headers = this.headers({
      'Content-Type': 'text/calendar; charset=utf-8',
      ...(etag ? { 'If-Match': etag } : {}),
    })
    const res = await this.request('PUT', this.urlFor(href), headers, body)
    if (res.status >= 400) this.throwDav('PUT item failed', res.status, res.body)
    return { etag: res.headers.get('etag') ?? '' }
  }

  /** DELETE an object by href (uses etag to avoid clobbering when provided). */
  async deleteItem(href: string, etag?: string): Promise<void> {
    const headers: Record<string, string> = {}
    if (etag) headers['If-Match'] = etag
    const res = await this.request('DELETE', this.urlFor(href), this.headers(headers))
    if (res.status >= 400) this.throwDav('DELETE item failed', res.status, res.body)
  }

  /** A live PROPFIND + calendar-query to confirm the server really speaks CalDAV. */
  async probe(): Promise<{ ok: boolean; principal?: string; calendars?: string[] }> {
    try {
      const principal = await this.findPrincipalHome()
      const cals = await this.listCalendars()
      return { ok: true, principal, calendars: cals.map((c) => c.displayName) }
    } catch (err) {
      return { ok: false, principal: undefined, calendars: undefined }
    }
  }

  private throwDav(what: string, status: number, body: string): never {
    const msg = /<d:responsedescription>([^<]*)<\/d:responsedescription>/.exec(body)?.[1]?.trim()
    throw new Error(`${what} (HTTP ${status}${msg ? ` — ${msg}` : ''})`)
  }
}

/* ── tiny helpers ──────────────────────────────────────────────────────── */

/** First <tag>...</tag> text content (handles CDATA + text nodes). */
function readTag(xml: string, tag: string): string | undefined {
  const esc = tag.replace(':', '\\:')
  const m = new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`).exec(xml)
  if (!m) return undefined
  let inner = m[1]!
  inner = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, s: string) => s)
  return decodeXmlEntities(inner.trim())
}

/** Decode named + numeric XML entities used to transport values over the wire. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function lastPathSegment(href: string): string {
  const clean = href.replace(/\/+$/, '')
  const idx = clean.lastIndexOf('/')
  return idx >= 0 ? decodeURIComponent(clean.slice(idx + 1)) : decodeURIComponent(clean)
}

/** RFC 5545 basic DATE-TIME UTC for a unix epoch (used in time-range). */
function isoIcsTime(epochSec: number): string {
  const d = new Date(epochSec * 1_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

function matchAll(s: string, re: RegExp): string[] {
  const out: string[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push(m[1] ?? '')
  return out
}

export { isoNow }