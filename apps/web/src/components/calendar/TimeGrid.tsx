'use client'

/**
 * Week + day time grid (XER-549, sink "Block out the week" / "Stack the day").
 *
 * One column per day, hour gutter on the left, events positioned by minute and
 * laid out by the UI SDK: drag on empty grid draws, drag an edge resizes, drag
 * the body moves, and overlapping events share the column width. Every change
 * is reported to the browser, which persists it through the existing server
 * action.
 */
import * as React from 'react'
import type { CalendarItem, Occurrence } from '@calendarx/sdk'
import { formatIsoDate, occDay, todayYmd, ymdKey, type YMD } from '~/lib/calendar'
import {
  DAY_MINUTES,
  occurrencesToSpans,
  spanIdFor,
  spanTimeLabel,
  type EventSpan,
} from '~/lib/span-model'
import { WeekGrid, WeekGridCanvas, WeekGridSpan, WeekGridTrack, type SpanChangeAction } from './week-grid-primitive'

const HOUR_PX = 44
const GUTTER_PX = 52

export interface TimeGridProps {
  days: YMD[]
  occurrences: Occurrence[]
  byUid: Map<string, CalendarItem>
  calColor: string
  locale: string
  selected: { uid: string; startLocal: string } | null
  onSelect: (o: Occurrence) => void
  /** A drag (or click) drew a new block: create it and open the editor. */
  onCreate: (span: EventSpan) => void
  onMove: (span: EventSpan, original: EventSpan) => void
  onResize: (span: EventSpan, original: EventSpan) => void
  onDelete: (span: EventSpan) => void
  /** Double-click on a day header jumps to that day. */
  onDayClick: (day: YMD) => void
}

export function TimeGrid({
  days,
  occurrences,
  byUid,
  calColor,
  locale,
  selected,
  onSelect,
  onCreate,
  onMove,
  onResize,
  onDelete,
  onDayClick,
}: TimeGridProps): React.ReactElement {
  const today = todayYmd()
  const dayKeys = React.useMemo(() => days.map((d) => ymdKey(d)), [days])

  const spans = React.useMemo(
    () => occurrencesToSpans(occurrences, byUid, calColor),
    [occurrences, byUid, calColor],
  )

  // The occurrence each span belongs to, so a commit knows what to patch.
  const occById = React.useMemo(() => {
    const map = new Map<string, Occurrence>()
    for (const o of occurrences) map.set(spanIdFor(o), o)
    return map
  }, [occurrences])

  // The previous committed span, to diff a move/resize against the server state.
  const prevSpans = React.useRef<EventSpan[]>(spans)
  React.useEffect(() => {
    prevSpans.current = spans
  }, [spans])

  // All-day occurrences render in their own strip, one chip per day.
  const allDayByDay = React.useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      if (!o.allDay) continue
      const key = ymdKey(occDay(o))
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return map
  }, [occurrences])

  const handleChange = (next: EventSpan[], details: { id: string; action: SpanChangeAction }): void => {
    const changed = next.find((s) => s.id === details.id)
    if (!changed) return
    const original = prevSpans.current.find((s) => s.id === details.id)
    if (details.action === 'draw') {
      onCreate(changed)
      return
    }
    if (!original) return
    if (details.action === 'delete') {
      onDelete(original)
      return
    }
    if (details.action === 'move') onMove(changed, original)
    if (details.action === 'resize') onResize(changed, original)
  }

  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, h) => h), [])
  const hourHeight = HOUR_PX
  const bodyHeight = (DAY_MINUTES / 60) * hourHeight

  // Scroll to the first event of the day (or 7am) once, on mount.
  const scroller = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const first = spans.reduce((min, s) => (s.start < min ? s.start : min), 7 * 60)
    el.scrollTop = Math.max(0, (first / 60) * hourHeight - 24)
    // Only on mount: re-scrolling on every data change would fight the user.
  }, [])

  return (
    <div className="cl-tg" data-cl-tg data-days={days.length}>
      <div className="cl-tg-scroll" ref={scroller}>
      <div className="cl-tg-head" style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span className="cl-tg-gutter-head" aria-hidden />
        {days.map((d) => {
          const key = ymdKey(d)
          const isToday = key === ymdKey(today)
          return (
            <button
              key={key}
              type="button"
              className={`cl-tg-col-head${isToday ? ' today' : ''}`}
              onClick={() => onDayClick(d)}
              aria-label={formatIsoDate(key, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              <span className="cl-tg-dow">{formatIsoDate(key, locale, { weekday: 'short' })}</span>
              <span className="cl-tg-daynum">{formatIsoDate(key, locale, { day: 'numeric' })}</span>
            </button>
          )
        })}
      </div>

      <div className="cl-tg-allday" style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span className="cl-tg-gutter-label">All day</span>
        {days.map((d) => {
          const key = ymdKey(d)
          const list = allDayByDay.get(key) ?? []
          return (
            <div key={key} className="cl-tg-allday-cell">
              {list.map((o) => {
                const item = byUid.get(o.uid)
                return (
                  <button
                    key={`${o.uid}${o.startLocal}`}
                    type="button"
                    className={`cl-chip${selected && selected.uid === o.uid && selected.startLocal === o.startLocal ? ' sel' : ''}`}
                    style={{ borderColor: calColor, color: calColor }}
                    onClick={() => onSelect(o)}
                  >
                    <span className="cl-chip-summary">{item?.summary ?? o.uid}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

        <div className="cl-tg-body" style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))`, height: bodyHeight }}>
          <div className="cl-tg-gutter" aria-hidden>
            {hours.map((h) => (
              <span key={h} className="cl-tg-hour" style={{ top: h * hourHeight }}>
                {h === 0 ? '' : spanTimeLabel(h * 60)}
              </span>
            ))}
          </div>

          <WeekGrid
            spans={spans}
            days={dayKeys}
            step={15}
            onSpansChange={(next, details) => handleChange(next, details)}
          >
            <WeekGridCanvas className="cl-tg-canvas" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((d, i) => {
                const key = ymdKey(d)
                return (
                  <WeekGridTrack key={key} value={key} className="cl-tg-track" data-col={i}>
                    {spans
                      .filter((s) => s.track === key)
                      .map((s) => (
                        <WeekGridSpan key={s.id} value={s.id} className="cl-tg-span">
                          <span className="cl-tg-span-edge" data-span-edge="start" aria-hidden />
                          <span className="cl-tg-span-time">
                            {spanTimeLabel(s.start)}–{spanTimeLabel(s.end)}
                          </span>
                          <span className="cl-tg-span-title">{s.summary}</span>
                          <span className="cl-tg-span-edge" data-span-edge="end" aria-hidden />
                        </WeekGridSpan>
                      ))}
                  </WeekGridTrack>
                )
              })}
            </WeekGridCanvas>
          </WeekGrid>
          <div className="cl-tg-lines" aria-hidden>
            {hours.map((h) => (
              <span key={h} className="cl-tg-line" style={{ top: h * hourHeight }} />
            ))}
          </div>
        </div>
      </div>

      <p className="cl-tg-hint">
        Drag on a day to add · drag an edge to stretch · drag a block to move
        {occById.size ? '' : ' · nothing on the grid yet'}
      </p>
    </div>
  )
}
