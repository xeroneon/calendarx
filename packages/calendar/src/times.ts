/**
 * CalTime ↔ UTC-epoch conversions that the recurrence engine, serialization
 * and expansion layer share. Kept separate from `timezone/` because it also
 * handles all-day (DATE) and floating values, not just zoned instants.
 */
import type { CalTime, HMS, YMD } from './types.js'
import { utcYmdToEpoch } from './datetime.js'
import { resolveLocalToUtc, resolveUtcToLocal } from './timezone/index.js'

/**
 * The UTC epoch an instants value resolves to. All-day (DATE) values resolve
 * to the start of the day in UTC. Floating values are treated as UTC wall
 * clock. Unknown TZIDs degrade to floating (wall clock as UTC) rather than
 * erroring, so a partially-known feed still expands. Returns null on malformed
 * time-of-day input.
 */
export function calTimeToUtcEpoch(t: CalTime): number | null {
  switch (t.kind) {
    case 'date':
      return utcYmdToEpoch(t.date, { hour: 0, minute: 0, second: 0 })
    case 'utc':
      return utcYmdToEpoch(t.date, t.time)
    case 'floating':
      return utcYmdToEpoch(t.date, t.time)
    case 'zoned': {
      const r = resolveLocalToUtc(t.tzid, t.date, t.time)
      if (r === null) return utcYmdToEpoch(t.date, t.time)
      return r.epochUtc
    }
  }
}

/** Whether a CalTime carries a resolvable instant (true for all well-formed). */
export function instantsResolvable(t: CalTime): boolean {
  if (t.kind === 'zoned') return zoneKnownOrFixed(t.tzid)
  return true
}

import { offsetAtUtc } from './timezone/index.js'

function zoneKnownOrFixed(tzid: string): boolean {
  return tzid === '' || tzid === 'UTC' || tzid === 'Z' || offsetAtUtc(tzid, 0) !== null
}

/**
 * Produce a CalTime of the same kind as `template`, representing the local
 * wall-clock of `epochUtc` in that zone. Used to build RECURRENCE-ID values and
 * occurrence start times that keep the authored local time (e.g. always 09:00)
 * across DST boundaries.
 */
export function utcEpochToCalTime(template: CalTime, epochUtc: number): CalTime {
  switch (template.kind) {
    case 'date':
      return { kind: 'date', date: utcToY(epochUtc) }
    case 'utc':
      return { kind: 'utc', date: utcToY(epochUtc), time: utcToH(epochUtc) }
    case 'floating':
      return { kind: 'floating', date: utcToY(epochUtc), time: utcToH(epochUtc) }
    case 'zoned': {
      const local = resolveUtcToLocal(template.tzid, epochUtc)
      return {
        kind: 'zoned',
        tzid: template.tzid,
        date: local ? local.ymd : utcToY(epochUtc),
        time: local ? local.hms : utcToH(epochUtc),
      }
    }
  }
}

import { epochToUtcYmd } from './datetime.js'

function utcToY(epochUtc: number): YMD {
  const { _time, ...ymd } = epochToUtcYmd(epochUtc)
  void _time
  return ymd
}

function utcToH(epochUtc: number): HMS {
  const { _time } = epochToUtcYmd(epochUtc)
  return _time
}

/** Extract the wall-clock YMD/HMS of a CalTime (for expansion candidate math). */
export function calTimeComponents(t: CalTime): { ymd: YMD; hms: HMS | null } {
  if (t.kind === 'date') return { ymd: t.date, hms: null }
  return { ymd: t.date, hms: t.time }
}