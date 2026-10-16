/**
 * Typed API client factory for the CalendarX server (the CalDAV proxy).
 *
 * The web browser never holds the upstream CalDAV password — this thin server
 * does. Each server-fn builds a `CalendaxClient` targeting `CALENDARX_API_URL`
 * (the local proxying server) so the UI talks CalDAV through one seam.
 */
import { CalendaxClient, type CalendaxClientOptions } from '@calendarx/sdk'

const base = process.env.CALENDARX_API_URL ?? 'http://localhost:3101'

export function clientFor(_ctx?: unknown): CalendaxClient {
  const options: CalendaxClientOptions = { baseUrl: base }
  return new CalendaxClient(options)
}