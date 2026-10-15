/**
 * Invite / attendee model helpers (RFC 5545 ATTENDEE / ORGANIZER semantics).
 *
 * The calendar is the source of truth for a shared schedule, so we model the
 * full attendee vocabulary — role, participation status, RSVP, delegation —
 * and provide scheduling helpers (invite/confirm/decline) that mutate
 * attendees + SEQUENCE the way CalDAV clients expect.
 */
import type { Attendee, CalendarItem, EventStatus, Organizer, ParticipationRole, ParticipationStatus } from './types.js'

export const DEFAULT_ROLE: ParticipationRole = 'REQ-PARTICIPANT'
export const DEFAULT_PARTSTAT: ParticipationStatus = 'NEEDS-ACTION'

/** Safely construct a `mailto:` attendee URI from a raw address. */
export function mailtoUri(email: string): string {
  const e = email.trim()
  return e.toLowerCase().startsWith('mailto:') ? e : `mailto:${e}`
}

/** Extract the raw email (strip `mailto:`) for display / lookups. */
export function uriEmail(uri: string): string {
  return uri.replace(/^mailto:/i, '')
}

/** Create an attendee from an email + display name. */
export function attendee(email: string, cn?: string, overrides: Partial<Attendee> = {}): Attendee {
  return {
    uri: mailtoUri(email),
    cn,
    role: DEFAULT_ROLE,
    partstat: DEFAULT_PARTSTAT,
    rsvp: true,
    ...overrides,
  }
}

export function organizer(email: string, cn?: string): Organizer {
  return { uri: mailtoUri(email), cn }
}

/** Insert an attendee if not already present (by URI, case-insensitive). */
export function addAttendee(item: CalendarItem, a: Attendee): boolean {
  const existing = item.attendees ?? []
  if (existing.some((x) => x.uri.toLowerCase() === a.uri.toLowerCase())) return false
  item.attendees = [...existing, a]
  return true
}

export function removeAttendee(item: CalendarItem, uri: string): boolean {
  if (!item.attendees) return false
  const next = item.attendees.filter((a) => a.uri.toLowerCase() !== uri.toLowerCase())
  const changed = next.length !== item.attendees.length
  item.attendees = next.length ? next : undefined
  return changed
}

/**
 * Record a participant's response (invite reply). Bumps SEQUENCE and sets the
 * item's status for the organizer's views when the host accepts/declines.
 */
export function setPartstat(
  item: CalendarItem,
  uri: string,
  partstat: ParticipationStatus,
): { changed: boolean; attendee?: Attendee } {
  const att = item.attendees?.find((a) => a.uri.toLowerCase() === uri.toLowerCase())
  if (!att) return { changed: false }
  const changed = att.partstat !== partstat
  att.partstat = partstat
  if (changed) item.sequence = (item.sequence ?? 0) + 1
  return { changed, attendee: att }
}

/** Convenience wrappers for the common reply states. */
export const reply = {
  accept: (item: CalendarItem, uri: string) => setPartstat(item, uri, 'ACCEPTED'),
  decline: (item: CalendarItem, uri: string) => setPartstat(item, uri, 'DECLINED'),
  tentative: (item: CalendarItem, uri: string) => setPartstat(item, uri, 'TENTATIVE'),
}

/** Whether every REQ-PARTICIPANT has responded (no outstanding NEEDS-ACTION). */
export function allInvitedResponded(item: CalendarItem): boolean {
  const invited = (item.attendees ?? []).filter((a) => a.role !== 'NON-PARTICIPANT')
  if (!invited.length) return true
  return invited.every((a) => a.partstat !== undefined && a.partstat !== 'NEEDS-ACTION')
}

/** Count of acceptances among required participants. */
export function acceptedCount(item: CalendarItem): number {
  return (item.attendees ?? []).filter((a) => a.partstat === 'ACCEPTED').length
}

/** The iCal METHOD implied by a status transition (for scheduling messages). */
export function methodForEventStatus(status: EventStatus): 'PUBLISH' | 'CANCEL' {
  return status === 'CANCELLED' ? 'CANCEL' : 'PUBLISH'
}