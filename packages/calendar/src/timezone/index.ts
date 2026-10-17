/**
 * IANA timezone registry + conversions.
 *
 * Ships a compact, committed transition table (`tz/tzdb.json`) generated from
 * Python's `zoneinfo` (real IANA tz database) — see the generator in repo docs
 * (packages/calendar/README). Each entry is { [zone]: [[epoch, utcOffsetSec,
 * isDst], ...] } where an offset applies from `epoch` until the next entry.
 *
 * This gives the calendar service correct, real IANA wall-clock↔UTC math with
 * zero runtime dependencies (Node's native Temporal is still a stub here).
 */
import type { HMS, Tzid, YMD } from '../types.js'
import { epochToUtcYmd, utcYmdToEpoch } from '../datetime.js'
import tzdbData from '../tz/tzdb.json' with { type: 'json' }

export type ZoneSegments = [epoch: number, offsetSec: number, isDst: 0 | 1][]

interface TZDB {
  [zone: string]: ZoneSegments
}

/**
 * The committed IANA transition table. Imported as a JSON module so it is
 * bundled inline by Vite into BOTH the browser client and the SSR server
 * bundle (a `readFileSync` here crashed the browser with "readFileSync is not
 * a function"). `resolveJsonModule` is on in tsconfig; the build copies
 * `src/tz/tzdb.json` → `dist/tz/tzdb.json` so the relative import also works
 * for the standalone Node server.
 */
const DB: TZDB = tzdbData as unknown as TZDB

/** Whether a TZID resolves to a known IANA zone in our registry. */
export function zoneKnown(tzid: string): boolean {
  return DB[tzid] !== undefined || tzid === 'UTC' || tzid === 'Z' || tzid === '' || tzid === 'Etc/UTC'
}

/** Raw transition segments for a zone ([[epoch, offsetSec, isDst], ...]). */
export function zoneTransitions(tzid: string): ZoneSegments | undefined {
  return DB[tzid]
}

/** Offset (seconds east of UTC) in effect for a UTC instant `epochUtc`, or null if unknown. */
export function offsetAtUtc(tzid: Tzid, epochUtc: number): number | null {
  const segs = DB[tzid]
  if (!segs) return fixedOffsetSeconds(tzid)
  // binary search: last segment with epoch <= epochUtc
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid]![0] <= epochUtc) lo = mid
    else hi = mid - 1
  }
  return segs[lo]![1]
}

/** Whether the given UTC instant is DST in the zone. */
export function isDstAtUtc(tzid: Tzid, epochUtc: number): boolean {
  const segs = DB[tzid]
  if (!segs) return false
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid]![0] <= epochUtc) lo = mid
    else hi = mid - 1
  }
  return segs[lo]![2] === 1
}

/**
 * Resolve a wall-clock (local) time + TZID to a UTC epoch, using two-pass
 * offset resolution (handles DST spring-forward/fall-back for the common case).
 * Returns null when the zone is unknown/unresolvable (treat as floating).
 * `ambiguous` is true when the wall clock falls inside a fall-back fold.
 */
export function resolveLocalToUtc(
  tzid: Tzid,
  ymd: YMD,
  hms: HMS,
): { epochUtc: number; isDst: boolean; ambiguous: boolean } | null {
  if (tzid === '' || tzid === 'Z' || tzid === 'UTC') {
    return { epochUtc: utcYmdToEpoch(ymd, hms), isDst: false, ambiguous: false }
  }
  const naive = utcYmdToEpoch(ymd, hms)
  const off1 = offsetAtUtc(tzid, naive)
  if (off1 === null) return null
  const utc1 = naive - off1
  const off2 = offsetAtUtc(tzid, utc1)
  if (off2 === null) return null
  const utc2 = naive - off2
  const isDst = isDstAtUtc(tzid, utc2)
  // If the two passes differ, the wall clock sits in a DST transition:
  // an ambiguity (fold) or a gap. We resolve to the second (standard) pass.
  return { epochUtc: utc2, isDst, ambiguous: off1 !== off2 }
}

/** Convert a UTC epoch to local wall-clock in the zone. */
export function resolveUtcToLocal(
  tzid: Tzid,
  epochUtc: number,
): { ymd: YMD; hms: HMS; isDst: boolean } | null {
  const off = offsetAtUtc(tzid, epochUtc)
  if (off === null) return null
  const local = epochUtc + off
  const { _time, ...ymd } = epochToUtcYmd(local)
  return { ymd, hms: _time, isDst: isDstAtUtc(tzid, epochUtc) }
}

/** All registered IANA zone keys. */
export function listZones(): string[] {
  return Object.keys(DB).sort()
}

/* ---------------------------------------------------------------- */
/* Fixed-offset TZIDs: Etc/GMT±N and RFC "+HHMM"/"-HHMM" forms.      */
/* ---------------------------------------------------------------- */

const ETC_RE = /^Etc\/GMT([+-])(\d{1,2})$/i
const OFFSET_RE = /^([+-])(\d{2})(\d{2})(\d{2})?$/

function fixedOffsetSeconds(tzid: string): number | null {
  const z = tzid === 'Z' || tzid === '' ? 'UTC' : tzid
  if (z === 'UTC' || z === 'Etc/UTC') return 0
  const e = ETC_RE.exec(z)
  if (e) {
    // Etc/GMT-N is UTC+N (sign inverted!)
    const n = Number(e[2])
    const sign = e[1] === '-' ? 1 : -1
    return sign * n * 3600
  }
  const m = OFFSET_RE.exec(z)
  if (m) {
    const sign = m[1] === '-' ? -1 : 1
    const h = Number(m[2])
    const min = Number(m[3])
    const s = m[4] ? Number(m[4]) : 0
    return sign * (h * 3600 + min * 60 + s)
  }
  return null
}