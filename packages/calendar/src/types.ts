/**
 * Core calendar/tasks domain model (RFC 5545-faithful).
 *
 * The calendar package is the single source of truth for how the platform
 * represents calendar events (VEVENT) and tasks (VTODO — an event with a
 * completion model), recurrence (RRULE), timezones (TZID) and attendees
 * (invite/attendee model), exactly as scoped in XER-78 / `xer71-cloud-plan`.
 *
 * A calendar "item" is either an event or a task. Tasks are expressed in the
 * same recurrence/timezone/attendee vocabulary as events and only differ by
 * carrying a completion state (COMPLETED / PERCENT-COMPLETE), so both fold
 * cleanly into one service and one CalDAV feed.
 */

/** Calendar UID — stable, globally unique per item (RFC 5545 `UID`). */
export type ItemUID = string

/** TZID, e.g. "America/Los_Angeles", "UTC", or an RFC numeric form "+0100". */
export type Tzid = string

/** Calendar component name: events (VEVENT) and tasks (VTODO). */
export type ComponentKind = 'event' | 'task'

/** FREQ values per RFC 5545. */
export type Freq =
  | 'SECONDLY'
  | 'MINUTELY'
  | 'HOURLY'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'YEARLY'

/** Weekday codes per RFC 5545. */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/* ------------------------------------------------------------------ */
/* Calendar time values (DTSTART / DTEND / DUE / COMPLETED / UNTIL)    */
/* ------------------------------------------------------------------ */

export interface YMD {
  year: number
  month: number
  day: number
}

export interface HMS {
  hour: number
  minute: number
  second: number
}

/**
 * A calendar time value. Mirrors RFC 5545's three DATE-TIME forms plus the
 * all-day DATE form:
 *   - `date`    : all-day, "20260101"                (kind='date')
 *   - `utc`     : UTC instant "20260101T090000Z"     (kind='utc')
 *   - `floating`: no zone, "20260101T090000"          (kind='floating')
 *   - `zoned`   : TZID="America/Los_Angeles:20260101T090000" (kind='zoned')
 */
export type CalTime =
  | { kind: 'date'; date: YMD }
  | { kind: 'utc'; time: HMS; date: YMD }
  | { kind: 'floating'; time: HMS; date: YMD }
  | { kind: 'zoned'; tzid: Tzid; time: HMS; date: YMD }

export type CalTimeKind = CalTime['kind']

/* ------------------------------------------------------------------ */
/* Recurrence (RRULE / EXDATE / RDATE)                                */
/* ------------------------------------------------------------------ */

export interface ByDayEntry {
  weekday: Weekday
  /** ordinate like `1MO`, `-1FR`; absent means "every occurrence of weekday". */
  ord?: number
}

export interface RecurrenceRule {
  freq: Freq
  /** `UNTIL` — must be DATE or UTC DATE-TIME per RFC 5545. */
  until?: CalTime
  /** `COUNT` — absolute number of occurrences (mutually exclusive with until). */
  count?: number
  /** `INTERVAL` — positive integer, default 1. */
  interval?: number
  /** `BYSECOND`. */
  bysecond?: number[]
  /** `BYMINUTE`. */
  byminute?: number[]
  /** `BYHOUR`, 0-23. */
  byhour?: number[]
  /** `BYDAY`, e.g. [1MO],[3FR],[-1SU]. */
  byday?: ByDayEntry[]
  /** `BYMONTHDAY`, 1-31 or -31-1. */
  bymonthday?: number[]
  /** `BYYEARDAY`, 1-366 or -366-1. */
  byyearday?: number[]
  /** `BYWEEKNO`, 1-53 or -53-1. */
  byweekno?: number[]
  /** `BYMONTH`, 1-12. */
  bymonth?: number[]
  /** `BYSETPOS`, 1-366 or -366-1. */
  bysetpos?: number[]
  /** `WKST` — week start, default MO. */
  wkst?: Weekday
}

/* ------------------------------------------------------------------ */
/* Attendees / invites (ATTENDEE + ORGANIZER)                         */
/* ------------------------------------------------------------------ */

export type ParticipationStatus =
  | 'NEEDS-ACTION'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'TENTATIVE'
  | 'DELEGATED'
  | 'COMPLETED'

export type ParticipationRole = 'CHAIR' | 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT'

export interface Attendee {
  /** `mailto:` or `urn:uuid:` URI. */
  uri: string
  /** `CN=` common name. */
  cn?: string
  role?: ParticipationRole
  partstat?: ParticipationStatus
  /** `RSVP=TRUE|FALSE`. */
  rsvp?: boolean
  /** `MEMBER=` — group delegate. */
  member?: string
  /** `DELEGATED-TO=`. */
  delegatedTo?: string
  /** `DELEGATED-FROM=`. */
  delegatedFrom?: string
  /** `SENT-BY=`. */
  sentBy?: string
}

export interface Organizer {
  uri: string
  cn?: string
  sentBy?: string
}

/* ------------------------------------------------------------------ */
/* Alarm (VALARM) — minimal DISPLAY/DISMISS support.                  */
/* ------------------------------------------------------------------ */

export interface Alarm {
  action: 'DISPLAY' | 'AUDIO' | 'EMAIL'
  /** ISO 8601 duration relative trigger, e.g. "-PT15M". */
  trigger: string
  description?: string
}

/* ------------------------------------------------------------------ */
/* The items: event (VEVENT) and task (VTODO).                        */
/* ------------------------------------------------------------------ */

export interface CalendarItemBase {
  uid: ItemUID
  /** `SUMMARY`. */
  summary?: string
  /** `DESCRIPTION`. */
  description?: string
  /** `LOCATION`. */
  location?: string
  /** `CATEGORIES`. */
  categories?: string[]
  /** `URL`. */
  url?: string
  /** `CLASS`. */
  class?: 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL'
  organizer?: Organizer
  attendees?: Attendee[]
  /** `DTSTAMP`/`CREATED` and `LAST-MODIFIED` as UTC ISO instants. */
  created?: string
  lastModified?: string
  /** `SEQUENCE` — bumped on each scheduling revision. */
  sequence?: number
  recurrence?: RecurrenceRule
  /** `RECURRENCE-ID` — a specific instance's override. */
  recurrenceId?: CalTime
  /** `EXDATE`. */
  exdate?: CalTime[]
  /** `RDATE`. */
  rdate?: CalTime[]
}

export interface CalendarEvent extends CalendarItemBase {
  kind: 'event'
  dtstart: CalTime
  /** `DTEND` (preferred). Mutually implied with `duration`. */
  dtend?: CalTime
  /** ISO 8601 duration, used when no DTEND. */
  duration?: string
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
  /** `TRANSP`. */
  transparency?: 'OPAQUE' | 'TRANSPARENT'
  alarms?: Alarm[]
}

export type EventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
export type TaskStatus = 'NEEDS-ACTION' | 'IN-PROCESS' | 'COMPLETED' | 'CANCELLED'

export interface CalendarTask extends CalendarItemBase {
  kind: 'task'
  /** `DTSTART` (optional for a task). */
  dtstart?: CalTime
  /** `DUE`. */
  due?: CalTime
  /** ISO 8601 duration (used when no DUE). */
  duration?: string
  completed?: CalTime
  /** `PERCENT-COMPLETE` 0-100. */
  percentComplete?: number
  status?: TaskStatus
  /** `PRIORITY` 0-9. */
  priority?: number
  alarms?: Alarm[]
}

export type CalendarItem = CalendarEvent | CalendarTask

/** A calendar = named collection of items. */
export interface CalendarCollection {
  /** Stable path key used in CalDAV/`/api/calendar/:key`. */
  key: string
  displayName: string
  color?: string
  /** Optional RFC 4791 `CALDAV:supported-collation-set` / description. */
  description?: string
}

/* ------------------------------------------------------------------ */
/* A resolved occurrence (expansion output).                          */
/* ------------------------------------------------------------------ */

/** One expanded occurrence of a recurring item, in UTC + local form. */
export interface Occurrence {
  /** The owning item's UID. */
  uid: ItemUID
  /** Occurrence start as UTC ISO instant (fallback: local wall clock). */
  startUtc: string
  /** Occurrence end as UTC ISO instant (fallback: local wall clock). */
  endUtc: string
  /** Wall-clock start (as authored, e.g. every 09:00 even across DST). */
  startLocal: string
  /** All day? */
  allDay: boolean
  /** The `RECURRENCE-ID` value that identifies this instance. */
  recurrenceId: CalTime
  /** True when the instance was added via RDATE (not drawn from RRULE). */
  fromRdate?: boolean
}