/**
 * CalendarX reminder scheduler (XER-334, Card B — CORE).
 *
 * Computes alarm fire times (`occurrence.start − trigger`) for a next-horizon
 * window and schedules a UnifiedPush delivery per alarm. The server is a thin
 * CalDAV proxy (no persistent event store), so it re-derives reminders
 * wherever calendar data with alarms is **materialized**:
 *
 *   - `listItems` / `expand`  → reschedule that collection
 *   - `createItem`            → schedule that item
 *   - `updateItem`            → cancel that item's old reminders, schedule anew
 *   - `deleteItem`            → cancel that item's reminders
 *   - boot sweep              → for every subscribed user with a connection,
 *                               list calendars + pull items and reschedule each
 *                               (so reminders survive a server restart)
 *
 * Dedupe/identity key = (userId, calKey, event uid, occurrence start, alarm
 * minutes). Editing/deleting/completing an item cancels the stale entries and
 * never fires a ghost reminder.
 *
 * Delivery is in-process with `setTimeout`: at fire time we read the user's
 * current UnifiedPush endpoint from the registry and hand the message to the
 * transport (the "no Google" seam). If the user unregistered their device, the
 * pending timer is skipped. Fire times already past are dropped (we never
 * deliver late).
 */

import { expandItem, type CalendarItem } from '@calendarx/calendar'
import type { PushSubscriptionStore } from './registry.js'
import { pushSubscriptionStore } from './registry.js'
import { UnifiedPushTransport, type PushMessage, type PushTransport } from './transport.js'

/** Some reminder text to show, shared by every pending card. */
export interface PendingReminder {
  key: string
  /** Fire time as epoch **milliseconds**. */
  at: number
  title: string
  body: string
  eventKey?: string
}

interface Armed extends PendingReminder {
  timer: NodeJS.Timeout
}

/** How far out the scheduler looks for alarms. Configurable, default 7 days. */
export function reminderHorizonMs(): number {
  const raw = Number(process.env.CALENDARX_REMINDER_HORIZON_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 7 * 24 * 60 * 60 * 1000
}

/**
 * Parse an RFC 5545 VALARM relative trigger (e.g. `-PT15M`, `-PT1H30M`) into
 * the number of minutes BEFORE the event it fires. A negative-trigger
 * (`-PT15M` = 15 minutes before) yields +15; a positive trigger (after the
 * start) yields a negative number; malformed/unsupported → null.
 */
export function alarmMinutesFromTrigger(trigger: string): number | null {
  const m = /^(-?)P(?:(?:(\d+)W))?(?:(?:(\d+)D))?(?:T(?:(?:(\d+)H))?(?:(?:(\d+)M))?(?:(?:(\d+)S))?)?$/.exec(
    trigger.trim(),
  )
  if (!m) return null
  const weeks = m[2] ? Number(m[2]) : 0
  const days = m[3] ? Number(m[3]) : 0
  const hours = m[4] ? Number(m[4]) : 0
  const mins = m[5] ? Number(m[5]) : 0
  const secs = m[6] ? Number(m[6]) : 0
  const total = weeks * 7 * 1440 + days * 1440 + hours * 60 + mins + Math.ceil(secs / 60)
  return m[1] ? total : -total
}

/** Human label for a minutes-before value (e.g. 15 → "15 minutes before"). */
export function alarmLabel(mins: number): string {
  if (mins <= 0) return 'At event time'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} before`
  if (mins % 1440 === 0) return `${mins / 1440} day${mins / 1440 === 1 ? '' : 's'} before`
  if (mins % 60 === 0) return `${mins / 60} hour${mins / 60 === 1 ? '' : 's'} before`
  return `${mins} minutes before`
}

const TIMER_CAP_MS = 2_147_483_647 // setTimeout's max safe delay (≈24.8 days)

/**
 * Collect the reminders a set of items produces within the horizon window.
 * Pure and unit-testable: no timers, no I/O.
 */
export function collectReminders(
  userId: string,
  calKey: string,
  items: CalendarItem[],
  opts: { nowMs?: number; horizonMs?: number } = {},
): PendingReminder[] {
  const nowMs = opts.nowMs ?? Date.now()
  const horizonMs = opts.horizonMs ?? reminderHorizonMs()
  const horizonEnd = nowMs + horizonMs
  const windowStartUtc = Math.floor(nowMs / 1000)
  const windowEndUtc = Math.ceil(horizonEnd / 1000)
  const out: PendingReminder[] = []

  for (const item of items) {
    const alarms = item.alarms ?? []
    if (!alarms.length) continue
    const title = item.summary?.trim() ? item.summary.trim() : 'Calendar reminder'
    const where = item.location?.trim() ? ` · ${item.location.trim()}` : ''
    // Expand recurrence/instances over the horizon so recurring alarms fire
    // per concrete occurrence (never once for the whole series).
    let occurrences
    try {
      occurrences = expandItem(item, {
        rangeStartUtc: windowStartUtc,
        rangeEndUtc: windowEndUtc,
        includeOverlapping: true,
      })
    } catch {
      continue // skip a broken item rather than drop the whole collection
    }
    for (const oc of occurrences) {
      const occStartMs = Date.parse(oc.startUtc)
      if (Number.isNaN(occStartMs)) continue
      for (const alarm of alarms) {
        const mins = alarmMinutesFromTrigger(alarm.trigger)
        if (mins === null || mins <= 0) continue // only "before" reminders for now
        const at = occStartMs - mins * 60_000
        if (at <= nowMs || at > horizonEnd) continue // already passed or beyond horizon
        out.push({
          key: reminderKey(userId, calKey, item.uid, occStartMs, mins),
          at,
          title,
          body: `${alarmLabel(mins)}${where}`,
          eventKey: item.uid,
        })
      }
    }
  }
  out.sort((a, b) => a.at - b.at)
  return out
}

/** Canonical identity key — dedupe + cancel target. */
export function reminderKey(userId: string, calKey: string, uid: string, occStartMs: number, mins: number): string {
  return [userId, calKey, uid, occStartMs, mins].map(encodeURIComponent).join('|')
}

/** Split a reminder key back for cancellation matching. Internal use by prefix. */
function keyPrefix(userId: string, calKey: string, uid?: string): string {
  let p = `${encodeURIComponent(userId)}|${encodeURIComponent(calKey)}|`
  if (uid !== undefined) p += `${encodeURIComponent(uid)}|`
  return p
}

export class ReminderScheduler {
  private pending = new Map<string, Armed>()

  constructor(
    private readonly registry: PushSubscriptionStore,
    private readonly transport: PushTransport,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reschedule an entire collection from its freshly-materialized items. */
  rescheduleCollection(userId: string, calKey: string, items: CalendarItem[]): PendingReminder[] {
    this.cancelPrefix(keyPrefix(userId, calKey))
    const rems = collectReminders(userId, calKey, items, { nowMs: this.now() })
    for (const r of rems) this.arm(r)
    return rems
  }

  /** Schedule (or refresh) a single item — cancels that item's old reminders first. */
  scheduleItem(userId: string, calKey: string, item: CalendarItem): PendingReminder[] {
    this.cancelPrefix(keyPrefix(userId, calKey, item.uid))
    const rems = collectReminders(userId, calKey, [item], { nowMs: this.now() })
    for (const r of rems) this.arm(r)
    return rems
  }

  /** Cancel every pending reminder for one item (edit/delete/complete). */
  cancelItem(userId: string, calKey: string, uid: string): number {
    return this.cancelPrefix(keyPrefix(userId, calKey, uid))
  }

  /** Cancel every pending reminder for a user (device unregistered / account gone). */
  cancelAllForUser(userId: string): number {
    return this.cancelPrefix(`${encodeURIComponent(userId)}|`)
  }

  /** Number of armed reminders (optionally for one user) — for tests/diagnostics. */
  pendingCount(userId?: string): number {
    if (!userId) return this.pending.size
    const pfx = `${encodeURIComponent(userId)}|`
    let n = 0
    for (const key of this.pending.keys()) if (key.startsWith(pfx)) n++
    return n
  }

  /** The still-future reminder whose fire time a test drifts toward zero. */
  listPending(userId: string): PendingReminder[] {
    const pfx = `${encodeURIComponent(userId)}|`
    return [...this.pending.values()].filter((r) => r.key.startsWith(pfx))
  }

  /** Release every timer (shutdown / tests). */
  dispose(): void {
    for (const armed of this.pending.values()) clearTimeout(armed.timer)
    this.pending.clear()
  }

  private cancelPrefix(prefix: string): number {
    let cancelled = 0
    for (const key of [...this.pending.keys()]) {
      if (key.startsWith(prefix)) {
        const armed = this.pending.get(key)
        if (armed) clearTimeout(armed.timer)
        this.pending.delete(key)
        cancelled++
      }
    }
    return cancelled
  }

  private arm(rem: PendingReminder): void {
    const existing = this.pending.get(rem.key)
    if (existing) clearTimeout(existing.timer)
    const delay = Math.min(Math.max(0, rem.at - this.now()), TIMER_CAP_MS)
    const timer = setTimeout(() => {
      this.pending.delete(rem.key)
      void this.fire(rem)
    }, delay)
    // Don't let a pending timer keep the process alive forever.
    if (typeof timer.unref === 'function') timer.unref()
    this.pending.set(rem.key, { ...rem, timer })
  }

  /** At fire time: deliver to the user's current endpoint (if still registered). */
  private async fire(rem: PendingReminder): Promise<void> {
    try {
      const sub = this.registry.get(userIdOf(rem.key))
      if (!sub) return // device unregistered → nothing to deliver
      const msg: PushMessage = { title: rem.title, body: rem.body, eventKey: rem.eventKey }
      await this.transport.deliver(sub.endpoint, msg)
    } catch (err) {
      console.warn(`[push] reminder delivery failed for ${rem.eventKey ?? rem.key}: ${(err as Error).message}`)
    }
  }
}

/** First key segment is always the (encoded) userId. */
function userIdOf(key: string): string {
  const idx = key.indexOf('|')
  return idx < 0 ? key : decodeURIComponent(key.slice(0, idx))
}

/**
 * The process-wide scheduler. Wired to the persistent subscription registry and
 * the real ntfy UnifiedPush transport. Constructed here so every caller (routes,
 * calendar materialization hooks, boot sweep) shares ONE timer set.
 */
export const reminderScheduler = new ReminderScheduler(pushSubscriptionStore, new UnifiedPushTransport())