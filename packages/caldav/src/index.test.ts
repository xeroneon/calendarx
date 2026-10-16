import { describe, expect, it } from 'vitest'
import { CalDavClient, EtagConflictError } from './index.js'

/** XML responder for tests — routes on (method, path), consumed in call order. */
function fakeDav(routes: Array<{ method: string; url: string; status: number; body: string; headers?: Record<string, string> }>): typeof fetch {
  const used = routes.map(() => false)
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    // First unconsumed route matching this (method, url-suffix) wins.
    let idx = routes.findIndex((r, i) => !used[i] && r.method === method && url.endsWith(r.url))
    if (idx === -1) idx = routes.findIndex((r) => r.method === method && url.endsWith(r.url))
    const hit = idx >= 0 ? routes[idx] : undefined
    if (idx >= 0) used[idx] = true
    const status = hit?.status ?? 401
    const body = hit?.body ?? ''
    const headers: Record<string, string> = { 'content-type': 'application/xml', ...(hit?.headers ?? {}) }
    return new Response(body, { status, headers })
  }) as typeof fetch
}

/* ---- Fixtures ---------------------------------------------------------- */

const NODENAME = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"'

/** Nextcloud-style: `d:`/`c:`/`cs:` prefixes on every tag, CDATA displayname. */
const NEXTCLOUD_MAIN = `<?xml version="1.0"?>
<d:multistatus ${NODENAME}>
  <d:response>
    <d:href>/remote.php/dav/calendars/axel/main/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname><![CDATA[Main]]></d:displayname>
        <d:getetag>"abc123"</d:getetag>
        <cs:calendar-color>#6366f1</cs:calendar-color>
        <d:resourcetype><c:calendar /></d:resourcetype>
        <c:supported-calendar-component-set>
          <c:comp name="VEVENT" /><c:comp name="VTODO" />
        </c:supported-calendar-component-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

/**
 * Radicale-style: NO namespace prefix — elements sit in the default namespace
 * (`<response>`, `<href>`, `<calendar/>`), plus a `<propstat>` per response.
 */
const RADICALE_MAIN = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <response>
    <href>/radicale/axel/Work/</href>
    <propstat>
      <prop>
        <displayname>Work</displayname>
        <getetag>"r1"</getetag>
        <resourcetype><collection /><c:calendar /></resourcetype>
        <c:supported-calendar-component-set>
          <c:comp name="VEVENT" />
        </c:supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`

/**
 * iCloud-style: `D:`/`C:`/`CS:` UPPERCASE prefixes (varied casing, no CDATA).
 */
const ICLOUD_MAIN = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
  <D:response>
    <D:href>/webdav/axel/Calendar/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Calendar</D:displayname>
        <D:getetag>"i1"</D:getetag>
        <D:resourcetype><C:calendar/></D:resourcetype>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT" /><C:comp name="VTODO" />
        </C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

/** Baikal-style: `d:` webdav + `cal:` caldav prefixes, non-CDATA color. */
const BAIKAL_MAIN = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/dav.php/calendars/axel/Home/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Home/work</d:displayname>
        <cs:calendar-color>#10b981</cs:calendar-color>
        <d:resourcetype><cal:calendar /></d:resourcetype>
        <cal:supported-calendar-component-set>
          <cal:comp name="VEVENT" />
        </cal:supported-calendar-component-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

const HOME_SET_NEXTCLOUD = `<?xml version="1.0"?>
<d:multistatus ${NODENAME}>
  <d:response>
    <d:href>/remote.php/dav/calendars/axel/</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/remote.php/dav/principals/axel/</d:href></d:current-user-principal>
        <c:calendar-home-set><d:href>/remote.php/dav/calendars/axel/</d:href></c:calendar-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

/** Radicale: default namespace on home-set discovery, relative href. */
const HOME_SET_RADICALE = `<?xml version="1.0"?>
<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/radicale/axel/</href>
    <propstat>
      <prop>
        <current-user-principal><href>/radicale/axel/</href></current-user-principal>
        <c:calendar-home-set><href>/radicale/axel/</href></c:calendar-home-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`

/** iCloud: same home-set shape, hosted under /webdav/. */
const HOME_SET_ICLOUD = `<?xml version="1.0"?>
<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/webdav/axel/</href>
    <propstat>
      <prop>
        <current-user-principal><href>/webdav/axel/</href></current-user-principal>
        <c:calendar-home-set><href>/webdav/axel/</href></c:calendar-home-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`

/** Baikal: home-set under /cal.php/. */
const HOME_SET_BAIKAL = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/cal.php/calendars/axel/</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/cal.php/principals/axel/</d:href></d:current-user-principal>
        <c:calendar-home-set><d:href>/cal.php/calendars/axel/</d:href></c:calendar-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

/** Servers that omit calendar-home-set but return a principal-URL (fallback). */
const HOME_SET_NO_HOME = `<?xml version="1.0"?>
<d:multistatus ${NODENAME}>
  <d:response>
    <d:href>/dav/calendars/axel/</d:href>
    <d:propstat>
      <d:prop>
        <d:principal-URL><d:href>/dav/principals/axel/</d:href></d:principal-URL>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

const CALENDAR_QUERY = `<?xml version="1.0"?>
<d:multistatus ${NODENAME}>
  <d:response>
    <d:href>/remote.php/dav/calendars/axel/main/evt1.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"e1"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR&#13;&#10;VERSION:2.0&#13;&#10;PRODID:-//calendarx//ical//EN&#13;&#10;BEGIN:VEVENT&#13;&#10;UID:evt1&#13;&#10;SUMMARY:Standup&#13;&#10;DTSTART:20260302T090000Z&#13;&#10;END:VEVENT&#13;&#10;END:VCALENDAR&#13;&#10;</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

/** A VFREEBUSY response (iCloud/Nextcloud style, camel free-busy-query). */
const FREE_BUSY = `<?xml version="1.0"?>
<d:multistatus ${NODENAME}>
  <d:response>
    <d:href>/remote.php/dav/calendars/axel/main/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR&#13;&#10;VERSION:2.0&#13;&#10;PRODID:-//calendarx//ical//EN&#13;&#10;BEGIN:VFREEBUSY&#13;&#10;DTSTART:20260302T000000Z&#13;&#10;DTEND:20260303T000000Z&#13;&#10;FREEBUSY:20260302T090000Z/20260302T100000Z&#13;&#10;FREEBUSY:20260302T140000Z/PT1H&#13;&#10;END:VFREEBUSY&#13;&#10;END:VCALENDAR&#13;&#10;</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

describe('@calendarx/caldav', () => {
  it('discovers calendars (Nextcloud prefixes) with VEVENT/VTODO support', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/remote.php/dav/calendars/', status: 207, body: HOME_SET_NEXTCLOUD },
      { method: 'PROPFIND', url: '/remote.php/dav/calendars/axel/', status: 207, body: NEXTCLOUD_MAIN },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', principalPath: 'calendars/', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const cals = await client.listCalendars()
    expect(cals).toHaveLength(1)
    expect(cals[0]?.displayName).toBe('Main')
    expect(cals[0]?.supportsEvents).toBe(true)
    expect(cals[0]?.supportsTasks).toBe(true)
    expect(cals[0]?.color).toBe('#6366f1')
    expect(cals[0]?.etag).toBe('"abc123"')
  })

  it('parses Radicale default-namespace responses (no d:/c: prefixes)', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/auth-and-home/', status: 207, body: HOME_SET_RADICALE },
      { method: 'PROPFIND', url: '/radicale/axel/', status: 207, body: RADICALE_MAIN },
    ])
    const client = new CalDavClient(
      { baseUrl: 'http://localhost:5232', principalPath: 'auth-and-home/', auth: 'app-password', username: 'axel', password: 'secret' },
      { fetchImpl },
    )
    const cals = await client.listCalendars()
    expect(cals).toHaveLength(1)
    expect(cals[0]?.displayName).toBe('Work')
    expect(cals[0]?.href).toContain('/radicale/axel/Work/')
    expect(cals[0]?.supportsEvents).toBe(true)
    expect(cals[0]?.supportsTasks).toBe(false)
  })

  it('parses iCloud uppercase-prefix responses', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/webdav/axel/', status: 207, body: HOME_SET_ICLOUD },
      { method: 'PROPFIND', url: '/webdav/axel/', status: 207, body: ICLOUD_MAIN },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://caldav.icloud.com', principalPath: 'webdav/axel/', auth: 'oauth', sessionToken: 'TOK' },
      { fetchImpl },
    )
    const cals = await client.listCalendars()
    expect(cals).toHaveLength(1)
    expect(cals[0]?.displayName).toBe('Calendar')
    expect(cals[0]?.supportsEvents).toBe(true)
    expect(cals[0]?.supportsTasks).toBe(true)
  })

  it('parses Baikal cal: prefix responses', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/dav/calendars/axel/', status: 207, body: HOME_SET_BAIKAL },
      { method: 'PROPFIND', url: '/cal.php/calendars/axel/', status: 207, body: BAIKAL_MAIN },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://baikal/cal.php', principalPath: 'dav/calendars/axel/', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const cals = await client.listCalendars()
    expect(cals).toHaveLength(1)
    expect(cals[0]?.displayName).toBe('Home/work')
    expect(cals[0]?.color).toBe('#10b981')
    expect(cals[0]?.supportsTasks).toBe(false)
  })

  it('falls back to principal-URL when calendar-home-set is absent', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/dav/calendars/axel/', status: 207, body: HOME_SET_NO_HOME },
      { method: 'PROPFIND', url: '/dav/principals/axel/', status: 207, body: NEXTCLOUD_MAIN },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://srv/remote.php/dav', principalPath: 'calendars/axel/', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const home = await client.findPrincipalHome()
    expect(home).toContain('/dav/principals/axel/')
  })

  it('runs a calendar-query REPORT and parses serialized items', async () => {
    const fetchImpl = fakeDav([
      { method: 'REPORT', url: '/remote.php/dav/calendars/axel/main/', status: 207, body: CALENDAR_QUERY },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const items = await client.queryItems('/remote.php/dav/calendars/axel/main/')
    expect(items).toHaveLength(1)
    expect(items[0]?.kind).toBe('event')
    expect(items[0]?.summary).toBe('Standup')
  })

  it('creates a calendar via MKCALENDAR', async () => {
    const sent: Array<{ method: string; url: string; body: string }> = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(input), body: String(init?.body ?? '') })
      return new Response('', { status: 201 })
    }) as typeof fetch
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    await client.mkcalendar('/remote.php/dav/calendars/axel/work/', { displayName: 'Work', color: '#10b981' })
    const put = sent[0]!
    expect(put.method).toBe('MKCALENDAR')
    expect(put.url).toContain('/work/')
    expect(put.body).toContain('<d:displayname>Work</d:displayname>')
    expect(put.body).toContain('<c:comp name="VEVENT"/>')
    expect(put.body).toContain('<c:comp name="VTODO"/>')
  })

  it('returns free-busy periods from a calendar-free-busy-query REPORT', async () => {
    const fetchImpl = fakeDav([
      { method: 'REPORT', url: '/remote.php/dav/calendars/axel/main/', status: 207, body: FREE_BUSY },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const start = Math.floor(Date.UTC(2026, 2, 2) / 1000)
    const end = Math.floor(Date.UTC(2026, 2, 3) / 1000)
    const busy = await client.freeBusy('/remote.php/dav/calendars/axel/main/', start, end)
    expect(busy).toHaveLength(2)
    expect(busy[0]).toEqual({ start: Math.floor(Date.UTC(2026, 2, 2, 9) / 1000), end: Math.floor(Date.UTC(2026, 2, 2, 10) / 1000) })
    // PT1H duration relative to its start.
    expect(busy[1]).toEqual({ start: Math.floor(Date.UTC(2026, 2, 2, 14) / 1000), end: Math.floor(Date.UTC(2026, 2, 2, 15) / 1000) })
  })

  it('throws EtagConflictError on a 412 PUT (stale etag)', async () => {
    const fetchImpl = fakeDav([
      { method: 'PUT', url: '/remote.php/dav/calendars/axel/main/evt1.ics', status: 412, body: '', headers: { 'content-type': 'text/plain' } },
    ])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', auth: 'basic', username: 'axel', password: 'pw' },
      { fetchImpl },
    )
    const item = {
      kind: 'event', uid: 'evt1', summary: 'Standup', dtstart: { type: 'utc' as const, utc: '20260302T090000Z' },
    }
    await expect(client.putItem('/remote.php/dav/calendars/axel/main/evt1.ics', item as never, '"stale"')).rejects.toBeInstanceOf(EtagConflictError)
  })

  it('reports ok:false when the server rejects the probe', async () => {
    const fetchImpl = fakeDav([{ method: 'PROPFIND', url: '/remote.php/dav/', status: 401, body: '' }])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', principalPath: '', auth: 'basic', username: 'axel', password: 'wrong' },
      { fetchImpl },
    )
    await expect(client.probe()).resolves.toMatchObject({ ok: false })
  })
})
