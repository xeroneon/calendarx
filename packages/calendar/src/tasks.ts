/**
 * TASKS model folded into the calendar (XER-71: task = event with COMPLETED).
 *
 * A task (VTODO) shares the full event vocabulary — DTSTART, DUE, RECURRENCE,
 * TZID, attendees — and adds a completion model. The helpers below implement
 * the task state machine (NEEDS-ACTION → IN-PROCESS → COMPLETED) and keep
 * COMPLETED / PERCENT-COMPLETE / DUE consistent, the way CalDAV to-dos work.
 */
import type { CalendarTask, TaskStatus } from './types.js'
import { nowIsoUtc, calTimeToIcal } from './datetime.js'

export const TASK_STATUSES: readonly TaskStatus[] = ['NEEDS-ACTION', 'IN-PROCESS', 'COMPLETED', 'CANCELLED']

/** A task is complete when its status is COMPLETED (or percent == 100). */
export function isTaskComplete(t: CalendarTask): boolean {
  return t.status === 'COMPLETED' || (t.percentComplete ?? 0) >= 100
}

/** Percent-complete clamping to 0-100. */
export function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Mark a task complete. Sets COMPLETED (UTC now unless overridden), STATUS
 * COMPLETED, PERCENT-COMPLETE 100. Returns the previous status for callers.
 */
export function completeTask(
  t: CalendarTask,
  opts: { at?: string; keepCreated?: boolean } = {},
): { previous?: TaskStatus; completedAt?: string } {
  const previous = t.status
  t.status = 'COMPLETED'
  t.percentComplete = 100
  t.lastModified = opts.keepCreated ? t.lastModified : nowIsoUtc()
  const completedAt = opts.at ?? nowIsoUtc()
  t.completed = { kind: 'utc', ...utcIsoToCal(completedAt) }
  t.sequence = (t.sequence ?? 0) + 1
  return { previous, completedAt }
}

/** Move a task back to an open state (un-complete). */
export function reopenTask(t: CalendarTask, status: 'NEEDS-ACTION' | 'IN-PROCESS' = 'NEEDS-ACTION'): void {
  t.status = status
  t.completed = undefined
  if (t.percentComplete === 100) t.percentComplete = 0
  t.sequence = (t.sequence ?? 0) + 1
  t.lastModified = nowIsoUtc()
}

/** Set progress, inferring status (NEEDS-ACTION at 0, IN-PROCESS mid, COMPLETED at 100). */
export function setProgress(t: CalendarTask, percent: number): void {
  t.percentComplete = clampPercent(percent)
  if (t.percentComplete >= 100) {
    if (t.status !== 'COMPLETED') completeTask(t)
  } else if (t.percentComplete === 0) {
    t.status = 'NEEDS-ACTION'
  } else {
    t.status = 'IN-PROCESS'
  }
  t.lastModified = nowIsoUtc()
}

/** The disclosure status shown in a unified event/task list. */
export function taskDisposition(t: CalendarTask): 'open' | 'in-progress' | 'done' | 'cancelled' {
  if (t.status === 'CANCELLED') return 'cancelled'
  if (isTaskComplete(t)) return 'done'
  if (t.status === 'IN-PROCESS') return 'in-progress'
  return 'open'
}

function utcIsoToCal(iso: string): { date: { year: number; month: number; day: number }; time: { hour: number; minute: number; second: number } } {
  const d = new Date(iso)
  return {
    date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
    time: { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() },
  }
}

export { calTimeToIcal }