/**
 * Typed API client factory for the CalendarX server (the CalDAV proxy).
 *
 * The web browser never holds the upstream CalDAV password — this thin server
 * does. Each server-fn builds a `CalendaxClient` targeting `CALENDARX_API_URL`
 * (the local proxying server) so the UI talks CalDAV through one seam. With the
 * account gate (XER-316) every request relays the browser's `cx_session` cookie
 * as a `Cookie` header so the thin server scopes it to the signed-in account.
 */
import { CalendaxClient, type CalendaxClientOptions } from '@calendarx/sdk'
import { getCookie } from '@tanstack/start-server-core'

const base = process.env.CALENDARX_API_URL ?? 'http://localhost:3101'
const SESSION = 'cx_session'

export function clientFor(_ctx?: unknown): CalendaxClient {
  const options: CalendaxClientOptions = { baseUrl: base }
  // Relay the browser's session cookie to the thin server so per-account
  // connections/calendar are scoped correctly. Evaluated per call.
  options.authHeaders = () => {
    const headers: Record<string, string> = {}
    const token = getCookie(SESSION)
    if (token) headers['Cookie'] = `${SESSION}=${encodeURIComponent(token)}`
    return headers
  }
  return new CalendaxClient(options)
}