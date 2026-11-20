'use client'

/**
 * Quick-range control (XER-549, sink "This week / next week / …").
 *
 * A `SegmentedControl` from the UI SDK picks the range; the resolved range is
 * shown underneath in the page's language, exactly as the sink does
 * ("Mon 23 Nov – Sun 29 Nov" + "7 days · November"). All arithmetic is in
 * `lib/calendar.ts` so the labels are locale-correct and unit-testable.
 */
import * as React from 'react'
import { SegmentedControl, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import {
  QUICK_RANGES,
  quickRangeLabel,
  quickRangeMeta,
  resolveQuickRange,
  todayYmd,
  ymdKey,
  type QuickRangeKind,
  type YMD,
} from '~/lib/calendar'

export interface QuickRangesProps {
  locale: string
  weekStartsOn: number
  /** Jump the browser to a resolved range. */
  onPick: (range: { kind: QuickRangeKind; start: string; end: string }) => void
}

export function QuickRanges({ locale, weekStartsOn, onPick }: QuickRangesProps): React.ReactElement {
  const todayIso = ymdKey(todayYmd())
  const [kind, setKind] = React.useState<QuickRangeKind>('this-week')
  const range = React.useMemo(
    () => resolveQuickRange(kind, todayIso, weekStartsOn),
    [kind, todayIso, weekStartsOn],
  )

  return (
    <div className="cl-quickrange" data-cl-quickrange>
      <SegmentedControl
        aria-label="Quick range"
        value={kind}
        onValueChange={(value) => {
          const next = value as QuickRangeKind
          setKind(next)
          onPick({ kind: next, ...resolveQuickRange(next, todayIso, weekStartsOn) })
        }}
      >
        {QUICK_RANGES.map((r) => (
          <SegmentedControlItem key={r.kind} value={r.kind} className="cl-qr-item">
            {r.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <span className="cl-qr-summary">
        <span className="cl-qr-range">{quickRangeLabel(range, locale)}</span>
        <span className="cl-qr-meta">{quickRangeMeta(range, locale)}</span>
      </span>
    </div>
  )
}

/** Anchor YMD for a quick range (exported for the browser's jump handler). */
export function quickRangeDay(start: string): YMD {
  return {
    year: Number(start.slice(0, 4)),
    month: Number(start.slice(5, 7)),
    day: Number(start.slice(8, 10)),
  }
}
