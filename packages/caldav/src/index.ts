/**
 * @calendarx/caldav — the CalDAV-generic CLIENT for CalendarX.
 *
 * Talks the CalDAV wire protocol (RFC 4791 / RFC 4918 WebDAV) against ANY
 * standards-compliant server: Nextcloud Calendar, Radicale, Baikal, iCloud.
 * Uses the RFC 5545 engine from `@calendarx/calendar` to parse/serialize the
 * iCalendar payloads carried over the wire, so CALDAV and ICS stay in lock-step.
 *
 * HARDENED (XER-305): multi-server readiness —
 *  - namespace-agnostic XML parsing (Nextcloud, Radicale, Baikal, iCloud each
 *    emit subtly different prefixes/default-ns for the same DAV/CalDAV props);
 *  - mkcalendar (MKCALENDAR), free-busy REPORT (calendar-free-busy-query);
 *  - typed etag-conflict handling: PUT/DELETE against a stale etag throws
 *    `EtagConflictError` (HTTP 412) instead of a generic error;
 *  - calendar-home-set discovery hardening (absolute/relative hrefs,
 *    principal-URL fallback, trailing-slash).
 *
 * Parser decision (XER-305 "decide" item): kept the dependency-free hand-rolled
 * XML layer. It is deliberately small and tested against per-backend fixtures
 * (Nextcloud, Radicale, Baikal, iCloud shapes). A full parser (@xmldom/xmldom,
 * etc.) was NOT adopted: the wire subset we touch (PROPFIND/REPORT multistatus,
 * calendar-query) is regular and bounded, and regex here is hardened to match on
 * LOCAL NAME with an optional namespace prefix rather than a fixed `d:`/`c:`
 * literal — that is the single change that un-skews it across all four servers.
 * Revisit only if the client grows to need namespace-aware attribute queries,
 * XPath, or authoritative XML canonicalization.
 */

import {
  parseCalendar,
  serializeCalendar,
  type CalendarCollection,
  type CalendarItem,
} from '@calendarx/calendar'

/**
 * How this CalDAV connection authenticates. `basic` covers Nextcloud / Baikal;
 * `app-password` is the Radicale app-specific credential (identical wire shape
 * to basic); `oauth` is the iCloud DAV session-token flow.
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

/** A single busy period returned by a free-busy REPORT. */
export interface FreeBusyPeriod {
  /** UTC epoch seconds when the busy period starts. */
  start: number
  /** UTC epoch seconds when the busy period ends. */
  end: number
}

/**
 * Raised when a conditional write (PUT/DELETE with If-Match) is rejected by the
 * server as HTTP 412 Precondition Failed — the object changed since we read it.
 * Callers should re-fetch and reconcile rather than blindly retrying.
 */
export class EtagConflictError extends Error {
  readonly href: string
  readonly serverEtag?: string
  readonly body: string
  constructor(href: string, serverEtag: string | undefined, body: string) {
    super(`Etag conflict on ${href} (HTTP 412 Precondition Failed)`)
    this.name = 'EtagConflictError'
    this.href = href
    this.serverEtag = serverEtag
    this.body = body
  }
}

const DEFAULT_TIMEOUT_MS = 12_000

/** RFC 3339-ish UTC timestamp now (for DAV:getlastmodified fallback). */
function isoNow(): string {
  return new Date().toISOString()
}

/** Escape a string for inclusion inside an XML text/tag body. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"'

/**
 * Build a regex fragment matching a START tag `name` with ANY namespace prefix
 * (e.g. `<d:href>`, `<D:HREF>`, `<href>`) — the hardened, prefix-agnostic form.
 * `[^>]*?>` matches the tag's attributes and its terminating `>` (lazy, so a
 * `<d:displayname>` opening tag stops at the first `>`).
 */
function openTag(name: string): string {
  return `<(?:(?:[A-Za-z_][\\w.-]*):)?${name}[^>]*?>`
}
/** Same, but an exact (non-self-closing) closing tag by local name. */
function closeTag(name: string): string {
  return `</(?:(?:[A-Za-z_][\\w.-]*):)?${name}>`
}

/** All props we request for a calendar collection (matching the model). */
const PROPFIND_PROPS = [
  '<d:displayname/>',
  '<d:resourcetype/>',
  '<d:getetag/>',
  '<cs:calendar-color/>',
  '<c:supported-calendar-component-set/>',
].join('')

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
    // Default principal discovery to the base URL root (RFC 4791) rather than a
    // Nextcloud-style `calendars/` suffix: Radicale serves current-user-principal
    // at `/`, and appending `calendars/` makes it 403 ("not a CalDAV endpoint").
    // Callers targeting a sub-path (e.g. remote.php/dav) pass principalPath explicitly.
    this.config = { principalPath: '', ...config }
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '')
  }

  /** Absolute URL for a DAV path/href (handles relative + absolute + root-relative hrefs). */
  private urlFor(href: string): string {
    if (/^https?:\/\//i.test(href)) return href
    if (href.startsWith('/')) return this.resolveHref(href)
    return `${this.baseUrl}/${href.replace(/^\//, '')}`
  }

  /** Resolve a DAV href to an absolute URL against the base URL's origin. */
  private resolveHref(href: string): string {
    if (!href) return ''
    if (/^https?:\/\//i.test(href)) return href
    if (href.startsWith('/')) {
      // Root-relative to the host+base: strip any path from baseUrl.
      try {
        const u = new URL(this.baseUrl)
        u.pathname = ''
        return `${u.origin}${href}`
      } catch {
        return href
      }
    }
    // Relative path under baseUrl.
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
      return { authorization: `Basic ${sessionToken}` }
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
      '  </d:prop>',
      '</d:propfind>',
    ].join('\n')
    const res = await this.request('PROPFIND', this.urlFor(path), this.headers({ 'Content-Type': 'application/xml', Depth: '0' }), body)
    if (res.status >= 400) this.throwDav('principal discovery failed', res.status, res.body)

    // Locate the principal resource (current-user-principal preferred).
    const principal = readTagStrict(res.body, 'current-user-principal', 'href')
      ?? readTagStrict(res.body, 'principal-URL', 'href')
      ?? path
    if (!principal) return this.urlFor(path)

    // Two-step RFC 4791 discovery: PROPFIND the principal resource itself to
    // get its calendar-home-set. Some servers (Nextcloud) return the home-set
    // here rather than on the calendars collection PROPFIND.
    const homeBody = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<d:propfind ${NS}>`,
      '  <d:prop>',
      '    <c:calendar-home-set />',
      '  </d:prop>',
      '</d:propfind>',
    ].join('\n')
    const homeRes = await this.request('PROPFIND', this.resolveHref(principal), this.headers({ 'Content-Type': 'application/xml', Depth: '0' }), homeBody)
    if (homeRes.status < 400) {
      const home = readTagStrict(homeRes.body, 'calendar-home-set', 'href')
      if (home) return this.resolveHref(home)
    }
    // Fall back: an (absolute or relative) home-set href returned on the
    // original request, then the principal itself.
    const home2 = readTagStrict(res.body, 'calendar-home-set', 'href')
    return home2 ? this.resolveHref(home2) : this.resolveHref(principal)
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
    const responses = responseBlocks(res.body)
    for (const block of responses) {
      const hrefText = extractText(block, 'href')
      const typeBlock = extractTag(block, 'resourcetype') ?? ''
      if (!hrefText) continue
      const isCalendar = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?calendar\\s*/?>|<(?:[A-Za-z_][\\w.-]*:)?calendar\\b[^>]*>`).test(typeBlock)
      // Only real calendar collections (skip principal + home-set containers).
      if (!isCalendar) continue
      const display = extractText(block, 'displayname') || lastPathSegment(hrefText)
      const color = extractText(block, 'calendar-color')
      const etag = extractText(block, 'getetag')
      const compSet = matchAll(block, /<(?:(?:[A-Za-z_][\w.-]*):)?comp\s+name="([^"]+)"\s*\/?>/g)
      calendars.push({
        href: hrefText,
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
    // Always emit a <c:filter> wrapper — Nextcloud rejects a REPORT without one
    // (400 "filter element is required").
    let compBody = ''
    if (rangeStartUtc !== undefined) {
      compBody = xmlTag('c:comp-filter', { name: 'VEVENT' },
        xmlTag('c:time-range', { start: isoIcsTime(rangeStartUtc), end: isoIcsTime(rangeEndUtc ?? rangeStartUtc + 1) }))
    }
    const filter = xmlTag('c:comp-filter', { name: 'VCALENDAR' }, compBody)
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<c:calendar-query ${NS}>`,
      '  <d:prop>',
      '    <d:getetag />',
      '    <d:getcontenttype />',
      '    <c:calendar-data />',
      '  </d:prop>',
      `  <c:filter>${filter}</c:filter>`,
      '</c:calendar-query>',
    ].join('\n')
    const res = await this.request('REPORT', this.urlFor(href), this.headers({ 'Content-Type': 'application/xml', Depth: '1' }), body)
    if (res.status >= 400) this.throwDav('calendar-query failed', res.status, res.body)

    const items: CalendarItem[] = []
    const responses = responseBlocks(res.body)
    for (const block of responses) {
      const data = extractTag(block, 'calendar-data')
      if (!data) continue
      // Unescape entities the XML layer folded into the calendar-data value.
      const ics = decodeXmlEntities(data).trim()
      if (!ics) continue
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

  /**
   * PUT a serialized item into a calendar collection. Pass `etag` (from a prior
   * GET/REPORT) to make it conditional: a stale etag throws `EtagConflictError`.
   */
  async putItem(href: string, item: CalendarItem, etag?: string): Promise<{ etag: string }> {
    const body = serializeCalendar([item], { calendarName: lastPathSegment(href) })
    const headers = this.headers({
      'Content-Type': 'text/calendar; charset=utf-8',
      ...(etag ? { 'If-Match': etag } : {}),
    })
    const res = await this.request('PUT', this.urlFor(href), headers, body)
    if (res.status === 412) throw new EtagConflictError(href, res.headers.get('etag') ?? undefined, res.body)
    if (res.status >= 400) this.throwDav('PUT item failed', res.status, res.body)
    return { etag: res.headers.get('etag') ?? '' }
  }

  /** DELETE an object by href (conditional on etag when provided). */
  async deleteItem(href: string, etag?: string): Promise<void> {
    const headers: Record<string, string> = {}
    if (etag) headers['If-Match'] = etag
    const res = await this.request('DELETE', this.urlFor(href), this.headers(headers))
    if (res.status === 412) throw new EtagConflictError(href, undefined, res.body)
    if (res.status >= 400) this.throwDav('DELETE item failed', res.status, res.body)
  }

  /**
   * Create a new calendar collection via MKCALENDAR. `href` is the collection
   * path (e.g. `/remote.php/dav/calendars/<user>/work/`).
   */
  async mkcalendar(
    href: string,
    opts: { displayName?: string; color?: string; supportsEvents?: boolean; supportsTasks?: boolean } = {},
  ): Promise<void> {
    const props: string[] = []
    if (opts.displayName !== undefined) props.push(`<d:displayname>${xmlEscape(opts.displayName)}</d:displayname>`)
    if (opts.color !== undefined) props.push(`<cs:calendar-color>${xmlEscape(opts.color)}</cs:calendar-color>`)
    const comps: string[] = []
    if (opts.supportsEvents !== false) comps.push('<c:comp name="VEVENT"/>')
    if (opts.supportsTasks !== false) comps.push('<c:comp name="VTODO"/>')
    if (comps.length) props.push(`<c:supported-calendar-component-set>${comps.join('')}</c:supported-calendar-component-set>`)
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<c:mkcalendar ${NS}>`,
      '  <d:set>',
      '    <d:prop>',
      `      ${props.join('\n      ')}`,
      '    </d:prop>',
      '  </d:set>',
      '</c:mkcalendar>',
    ].join('\n')
    const res = await this.request('MKCALENDAR', this.urlFor(href), this.headers({ 'Content-Type': 'application/xml' }), body)
    if (res.status >= 400) this.throwDav('MKCALENDAR failed', res.status, res.body)
  }

  /**
   * Free-busy REPORT over a window. Returns busy periods from the server's
   * VFREEBUSY response (used to detect conflicts in the UI's create/edit flow).
   */
  async freeBusy(href: string, rangeStartUtc: number, rangeEndUtc: number): Promise<FreeBusyPeriod[]> {
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<c:free-busy-query ${NS}>`,
      `  <c:time-range start="${isoIcsTime(rangeStartUtc)}" end="${isoIcsTime(rangeEndUtc)}" />`,
      '</c:free-busy-query>',
    ].join('\n')
    const res = await this.request('REPORT', this.urlFor(href), this.headers({ 'Content-Type': 'application/xml', Depth: '1' }), body)
    if (res.status >= 400) this.throwDav('free-busy REPORT failed', res.status, res.body)

    // The response wraps VFREEBUSY inside <c:calendar-data> (entity-encoded).
    // Decode the whole body so we also handle servers that return bare VFREEBUSY.
    const decoded = decodeXmlEntities(res.body)
    const source = extractTag(decoded, 'calendar-data') ?? decoded
    const periods: FreeBusyPeriod[] = []
    for (const m of matchAll(source, /^FREEBUSY[:;](.*)$/gm)) {
      pushFreeBusyPeriod(periods, m)
    }
    return periods
  }

  /** A live PROPFIND + calendar-query to confirm the server really speaks CalDAV. */
  async probe(): Promise<{ ok: boolean; principal?: string; calendars?: string[] }> {
    try {
      const principal = await this.findPrincipalHome()
      const cals = await this.listCalendars()
      return { ok: true, principal, calendars: cals.map((c) => c.displayName) }
    } catch {
      return { ok: false, principal: undefined, calendars: undefined }
    }
  }

  private throwDav(what: string, status: number, body: string): never {
    const msg = extractText(body, 'responsedescription')
    throw new Error(`${what} (HTTP ${status}${msg ? ` — ${msg}` : ''})`)
  }
}

/* ── tiny helpers ──────────────────────────────────────────────────────── */

function xmlTag(tag: string, attrs: Record<string, string>, body?: string): string {
  if (body === undefined || body === '') return `<${tag}${attrStr(attrs)}/>`
  return `<${tag}${attrStr(attrs)}>${body}</${tag}>`
}

function attrStr(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${xmlEscape(v)}"`)
    .join('')
}

/** Split a multistatus body into its `<response>` blocks (any prefix). */
function responseBlocks(xml: string): string[] {
  // Response blocks are never nested in server PROPFIND/REPORT payloads.
  const re = new RegExp(openTag('response') + '([\\s\\S]*?)' + closeTag('response'), 'g')
  const blocks: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) blocks.push(m[1] ?? '')
  return blocks
}

/**
 * Extract the first pairing of open/close tag `name` into [innerText, raw].
 * Returns undefined when the tag is absent or self-closing.
 */
function extractTag(xml: string, name: string): string | undefined {
  const re = new RegExp(openTag(name) + '([\\s\\S]*?)' + closeTag(name))
  const m = re.exec(xml)
  return m ? m[1] : undefined
}

/** Extract the trimmed, entity-decoded text content of the FIRST `name` element. */
function extractText(xml: string, name: string): string | undefined {
  const inner = extractTag(xml, name)
  if (inner === undefined) return undefined
  return decodeXmlEntities(inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, s: string) => s).trim())
}

/**
 * Extract the href under a given parent property, e.g. the `<d:href>` inside
 * `<c:calendar-home-set>`. Returns undefined when absent.
 */
function readTagStrict(xml: string, parent: string, child: string): string | undefined {
  const parentRe = new RegExp(openTag(parent) + '([\\s\\S]*?)' + closeTag(parent))
  const pm = parentRe.exec(xml)
  if (!pm) return undefined
  return extractText(pm[1]!, child)
}

/** Parse a FREEBUSY:FREEAID.../DTEND or FREEBUSY:.../PT1H value into a period. */
function pushFreeBusyPeriod(periods: FreeBusyPeriod[], value: string): void {
  const parts = value.split('/')
  if (parts.length < 2) {
    // FREEBUSY with a single instant (a moment) — skip; not a period.
    return
  }
  const start = parseIcsUtc(parts[0]!)
  const rawEnd = parts[1]!
  if (start == null) return
  let end: number | null
  if (/^P/.test(rawEnd)) {
    end = start + durationSeconds(rawEnd)
  } else {
    end = parseIcsUtc(rawEnd)
  }
  if (end == null || end <= start) return
  periods.push({ start, end })
}

/** Parse an RFC 5545 UTC DATE-TIME (YYYYMMDDTHHMMSSZ) to epoch seconds. */
function parseIcsUtc(s: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, hh, mi, ss] = m
  return Math.floor(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss)) / 1000)
}

/** ASCII duration (P, PT, H/M/S) to seconds. */
function durationSeconds(s: string): number {
  let total = 0
  let num = ''
  let val = 0
  let inTime = false
  for (const ch of s) {
    if (ch === 'P') continue
    if (ch === 'T') {
      inTime = true
      continue
    }
    if (/\d/.test(ch)) {
      num += ch
      continue
    }
    if (num) val = Number(num)
    num = ''
    if (ch === 'W') total += val * 604_800
    else if (ch === 'D') total += val * 86_400
    else if (inTime && ch === 'H') total += val * 3_600
    else if (inTime && ch === 'M') total += val * 60
    else if (inTime && ch === 'S') total += val
  }
  return total
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
export type { CalendarCollection }