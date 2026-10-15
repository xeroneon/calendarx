import { describe, expect, it } from 'vitest'
import { CalDavClient } from './index.js'

/** Minimal XML responder for the seed tests — routes on (method, path). */
function fakeDav(routes: Array<{ method: string; url: string; status: number; body: string }>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const hit = routes.find((r) => r.method === method && url.endsWith(r.url))
    const status = hit?.status ?? 401
    const body = hit?.body ?? ''
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/xml' },
    })
  }) as typeof fetch
}

const CALENDAR_XML = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
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

const CALENDAR_QUERY = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/remote.php/dav/calendars/axel/main/evt1.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"e1"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR&#13;&#10;VERSION:2.0&#13;&#10;PRODID:-//calendax//ical//EN&#13;&#10;BEGIN:VEVENT&#13;&#10;UID:evt1&#13;&#10;SUMMARY:Standup&#13;&#10;DTSTART:20260302T090000Z&#13;&#10;END:VEVENT&#13;&#10;END:VCALENDAR&#13;&#10;</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

describe('@calendax/caldav', () => {
  it('discovers calendars from a principal and reports VEVENT/VTODO support', async () => {
    const fetchImpl = fakeDav([
      { method: 'PROPFIND', url: '/remote.php/dav/calendars/', status: 207, body: CALENDAR_XML },
      { method: 'PROPFIND', url: '/remote.php/dav/calendars/axel/main/', status: 207, body: CALENDAR_XML },
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

  it('reports ok:false when the server rejects the probe', async () => {
    const fetchImpl = fakeDav([{ method: 'PROPFIND', url: '/remote.php/dav/', status: 401, body: '' }])
    const client = new CalDavClient(
      { baseUrl: 'https://nextcloud/remote.php/dav', principalPath: '', auth: 'basic', username: 'axel', password: 'wrong' },
      { fetchImpl },
    )
    await expect(client.probe()).resolves.toMatchObject({ ok: false })
  })
})