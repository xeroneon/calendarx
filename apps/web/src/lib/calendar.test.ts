import { describe, expect, it } from 'vitest'
import { parseYmdKey, todayYmd, monthGrid, calTimeFromInputs } from './calendar'

describe('@calendarx/web calendar helpers', () => {
  it('parses a YYYY-MM-DD key', () => {
    expect(parseYmdKey('2026-03-02')).toEqual({ year: 2026, month: 3, day: 2 })
    expect(parseYmdKey('not-a-date')).toBeNull()
  })

  it('returns a full Monday-first month grid', () => {
    const grid = monthGrid({ year: 2026, month: 3, day: 1 })
    // March 2026 starts on a Sunday → offset 6, 31 days → 6 rows.
    expect(grid).toHaveLength(6)
    expect(grid[0]).toHaveLength(7)
  })

  it('builds an all-day RFC DATE CalTime', () => {
    const t = calTimeFromInputs(true, { year: 2026, month: 3, day: 2 }, null)
    expect(t).toEqual({ kind: 'date', date: { year: 2026, month: 3, day: 2 } })
  })

  it('reports a parseable today', () => {
    const y = todayYmd()
    expect(y.year).toBeGreaterThan(2000)
  })
})