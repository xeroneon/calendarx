'use client'

/**
 * Month view on the UI SDK `Calendar` (XER-549).
 *
 * The SDK owns the grid, the keys (arrows, Home/End, PageUp/Down, Shift+PageUp)
 * and every `aria-*`: the month is a `grid`, each day a focusable `gridcell`
 * named by its full date, and months are announced on change. We only supply
 * the day content (event chips, the hover "+") and the styling — the app's
 * `--cx-*` tokens, no look from the package (there is none).
 */
import * as React from 'react'
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  createCalendarController,
} from '@ui-sdk/react/calendar'
import type { CalendarItem, Occurrence } from '@calendarx/sdk'
import { durationMinutes } from '~/lib/span-model'
import { occDay, occTime, todayYmd, ymdKey, type YMD } from '~/lib/calendar'

export interface MonthViewProps {
  /** First month shown, ISO `YYYY-MM`. */
  month: string
  onMonthChange: (month: string) => void
  /** The focused/selected day. */
  anchor: YMD
  onAnchorChange: (day: YMD) => void
  occurrences: Occurrence[]
  byUid: Map<string, CalendarItem>
  calColor: string
  locale: string
  weekStartsOn: number
  selected: { uid: string; startLocal: string } | null
  onSelect: (o: Occurrence) => void
  onEdit: (item: CalendarItem) => void
  onCreateOn: (day: YMD) => void
  /** Chevrons live in the toolbar; the controller lets it drive the grid. */
  controller: ReturnType<typeof createCalendarController>
}

function endLabel(o: Occurrence, item: CalendarItem | undefined): string {
  const start = occTime(o)
  if (!start) return 'All day'
  const mins = durationMinutes(item?.duration) ?? 60
  const end = start.hour * 60 + start.minute + mins
  const h = Math.floor((end % 1440) / 60)
  const m = end % 60
  return `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}–${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function MonthView({
  month,
  onMonthChange,
  anchor,
  onAnchorChange,
  occurrences,
  byUid,
  calColor,
  locale,
  weekStartsOn,
  selected,
  onSelect,
  onEdit,
  onCreateOn,
  controller,
}: MonthViewProps): React.ReactElement {
  const today = ymdKey(todayYmd())

  const byDay = React.useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      const key = ymdKey(occDay(o))
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => (a.startUtc > b.startUtc ? 1 : -1))
    return map
  }, [occurrences])

  return (
    <div className="cl-month">
      <Calendar
        mode="single"
        controller={controller}
        month={month}
        onMonthChange={(next) => onMonthChange(next)}
        value={ymdKey(anchor)}
        onValueChange={(value) => {
          if (typeof value === 'string') {
            const [year, mon, day] = value.split('-').map(Number)
            onAnchorChange({ year: year!, month: mon!, day: day! })
          }
        }}
        locale={locale}
        weekStartsOn={weekStartsOn}
        weekdayFormat="short"
        monthFormat="long"
        showOutsideDays
        today={today}
        aria-label="Month view"
      >
      <div className="cl-month-bar">
        <CalendarPrevious className="cl-month-nav" aria-label="Previous month">
          ‹
        </CalendarPrevious>
        <CalendarHeading className="cl-month-title" />
        <CalendarNext className="cl-month-nav" aria-label="Next month">
          ›
        </CalendarNext>
      </div>

        <CalendarGrid className="cl-sdk-grid">
          <CalendarWeekdays className="cl-sdk-weekdays">
            {(index) => <CalendarWeekday index={index} className="cl-sdk-weekday" />}
          </CalendarWeekdays>
          <CalendarWeeks>
            {(cell) => {
              const key = cell.date
              const occs = byDay.get(key) ?? []
              const day: YMD = {
                year: Number(key.slice(0, 4)),
                month: Number(key.slice(5, 7)),
                day: Number(key.slice(8, 10)),
              }
              return (
                <CalendarDay key={key} value={key} className="cl-sdk-day">
                  <div className="cl-day-head">
                    <span className="cl-daynum">{cell.date.slice(8, 10).replace(/^0/, '')}</span>
                    <button
                      type="button"
                      className="cl-day-add"
                      aria-label={`Add event on ${key}`}
                      title="Add event"
                      onClick={(e) => {
                        e.stopPropagation()
                        onCreateOn(day)
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div className="cl-day-events">
                    {occs.slice(0, 3).map((o) => {
                      const item = byUid.get(o.uid)
                      const isSel = !!selected && selected.uid === o.uid && selected.startLocal === o.startLocal
                      return (
                        <button
                          key={`${o.uid}${o.startLocal}`}
                          type="button"
                          className={`cl-chip${item?.kind === 'task' ? ' task' : ''}${isSel ? ' sel' : ''}`}
                          style={item?.kind === 'task' ? undefined : { borderColor: calColor, color: calColor }}
                          title={`${item?.summary ?? o.uid} · ${endLabel(o, item)}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(o)
                            if (item) onEdit(item)
                          }}
                        >
                          {!o.allDay && <span className="cl-chip-time">{occTime(o) ? `${String(occTime(o)!.hour).padStart(2, '0')}:${String(occTime(o)!.minute).padStart(2, '0')}` : ''}</span>}
                          <span className="cl-chip-summary">{item?.summary ?? o.uid}</span>
                        </button>
                      )
                    })}
                    {occs.length > 3 ? <span className="cl-more">+{occs.length - 3} more</span> : null}
                  </div>
                </CalendarDay>
              )
            }}
          </CalendarWeeks>
        </CalendarGrid>
      </Calendar>
    </div>
  )
}
