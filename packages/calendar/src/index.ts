/**
 * @calendarx/calendar — Xeroneon Cloud calendar + tasks core (XER-78 / Phase 2.1).
 *
 * A dependency-light RFC 5545 iCal engine + CalDAV-ready model: events (VEVENT)
 * and tasks (VTODO, "event with COMPLETED") that share one recurrence, timezone
 * and attendee vocabulary, plus a CalDAV-compatible serialization layer and a
 * testable in-memory store. Consumed by `apps/server` (the HTTP/CalDAV surface)
 * and later by `apps/web`.
 */

export * from './types.js'
export * from './datetime.js'
export * from './times.js'
export * from './attendees.js'
export * from './tasks.js'
export * from './store.js'
export {
  serializeCalendar,
  serializeEvent,
  contentLine,
  escapeText,
  unescapeText,
  foldLine,
  XC_PRODID,
} from './ical/serialize.js'
export { parseCalendar, parseLine, unfoldLines, feedSummary } from './ical/parse.js'
export { expandRule, isoToEpoch, MAX_ITERATIONS } from './recurrence/expand.js'
export { serializeRule, parseRule, byDayToString } from './recurrence/rrule.js'
export {
  zoneKnown,
  offsetAtUtc,
  isDstAtUtc,
  resolveLocalToUtc,
  resolveUtcToLocal,
  listZones,
  zoneTransitions,
} from './timezone/index.js'