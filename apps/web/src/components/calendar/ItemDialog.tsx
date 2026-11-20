'use client'

/**
 * Create/edit dialog (XER-549 keeps the XER-306 field set, swaps the date and
 * time fields onto the UI SDK).
 *
 * The date field is a `DatePicker`: type `31.12.2026` in the visitor's own
 * order, a calendar opens on demand, and invalid input sets `aria-invalid`
 * while the previous value stays. Times are SDK `TimeInput` spinbuttons (hour /
 * minute / AM-PM, keyboard driven) instead of the native inputs.
 */
import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Checkbox, Dialog, Select } from '@calendarx/ui'
import type { CalendarCollection, CalendarItem } from '@calendarx/sdk'
import type { Alarm, HMS, YMD } from '@calendarx/calendar'
import {
  DatePicker,
  DatePickerContent,
  DatePickerHint,
  DatePickerInput,
  DatePickerTrigger,
} from '@ui-sdk/react/date-picker'
import { TimeInput } from '@ui-sdk/react/time-input'
import { createItem, updateItem } from '~/server/calendar'
import { authCall } from '~/lib/auth-call'
import {
  ALARM_PRESETS,
  RECUR_FREQS,
  WEEKDAY_CODES,
  alarmLabelFor,
  alarmMinutesFrom,
  attendeesToText,
  parseAttendeeEmails,
  buildRule,
  calTimeFromInputs,
  formatHms,
  hmsFromInput,
  recurLabel,
  ruleToState,
  triggerForMinutes,
  ymdKey,
  type ByDayEntry,
  type RecurFreq,
  type Weekday,
} from '~/lib/calendar'
import { durationFromMinutes, durationMinutes, spanTimeLabel } from '~/lib/span-model'

export interface EditTarget {
  kind: 'event' | 'task'
  item?: CalendarItem
  /** Optional pre-filled creation date (set when creating from a grid cell). */
  date?: YMD
  /** Optional pre-filled time range (set when a drag drew a block). */
  range?: { start: number; end: number }
}

/** Parse an item's DTSTART/DUE into (allDay, date, time) for the form. */
function calTimeToForm(t?: { kind: string; date: YMD; time?: HMS } | null): { allDay: boolean; ymd: YMD; hms: HMS | null } | null {
  if (!t) return null
  return { allDay: t.kind === 'date', ymd: t.date, hms: t.kind === 'date' ? null : (t.time ?? null) }
}

export function ItemDialog({
  target,
  defaultDate,
  calKey,
  calendars,
  locale,
  onClose,
  onSaved,
}: {
  target: EditTarget
  defaultDate: YMD
  calKey: string
  calendars: CalendarCollection[]
  locale: string
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const existing = target.item
  const editKind = existing?.kind ?? target.kind
  const existingTask = existing?.kind === 'task' ? existing : null
  const existingEvent = existing?.kind === 'event' ? existing : null
  const dt = existing ? calTimeToForm(editKind === 'task' ? (existingTask?.due ?? existingTask?.dtstart) : existingEvent?.dtstart) : null
  const ruleState = ruleToState(existing?.recurrence)

  // Resolve the calendar the item actually lives on (an edited item is fixed to
  // its source collection; a new item can be sent to any loaded calendar).
  const effectiveCalKey = existing ? calKey : calendars.length ? calendars[0]!.key : calKey

  const [summary, setSummary] = React.useState(existing?.summary ?? '')
  const [kind, setKind] = React.useState<'event' | 'task'>(editKind)
  const [allDay, setAllDay] = React.useState(dt?.allDay ?? false)
  const [startDate, setStartDate] = React.useState(dt ? ymdKey(dt.ymd) : ymdKey(defaultDate))
  const [startTime, setStartTime] = React.useState(
    target.range ? spanTimeLabel(target.range.start) : dt?.hms ? formatHms(dt.hms) : '09:00',
  )
  const [durMin, setDurMin] = React.useState(
    target.range
      ? target.range.end - target.range.start
      : dt
        ? (durationMinutes(existing && existing.kind === 'event' ? existing.duration : undefined) ?? 60)
        : 60,
  )
  const [dueDate, setDueDate] = React.useState(dt ? ymdKey(dt.ymd) : ymdKey(defaultDate))
  const [dueTime, setDueTime] = React.useState(dt?.hms ? formatHms(dt.hms) : '17:00')
  const [location, setLocation] = React.useState(existing?.location ?? '')
  const [attendeesText, setAttendeesText] = React.useState(attendeesToText(existing?.attendees))
  const [desc, setDesc] = React.useState(existing?.description ?? '')
  const [done, setDone] = React.useState(existing?.kind === 'task' && existing.status === 'COMPLETED')

  // Recurrence rule-builder state (XER-306).
  const [freq, setFreq] = React.useState<RecurFreq>(ruleState.freq)
  const [interval, setInterval] = React.useState(ruleState.interval)
  const [byday, setByday] = React.useState<ByDayEntry[]>(ruleState.byday)
  // Alarms list — display minutes-before per alarm (XER-306 full dialog).
  const [alarms, setAlarms] = React.useState<number[]>((existing?.alarms ?? []).map((a) => alarmMinutesFrom(a)))

  const [destCal, setDestCal] = React.useState<string>(effectiveCalKey)

  const save = useMutation({
    mutationFn: (payload: { kind: 'event' | 'task'; calKey: string; uid?: string; body: Record<string, unknown> }) => {
      if (payload.uid) {
        const uid = payload.uid // widened-safe capture (closure doesn't preserve narrowing)
        return authCall(() => updateItem({ data: { key: payload.calKey, uid, patch: payload.body } }))
      }
      return authCall(() => createItem({ data: { key: payload.calKey, item: payload.body as unknown as CalendarItem } }))
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const submit = (): void => {
    const startYmd = startDate ? { year: Number(startDate.slice(0, 4)), month: Number(startDate.slice(5, 7)), day: Number(startDate.slice(8, 10)) } : null
    if (!startYmd) return
    const body: Record<string, unknown> = {
      summary: summary.trim(),
      description: desc,
    }
    const locationTrim = location.trim()
    if (locationTrim) body.location = locationTrim
    const attendees = parseAttendeeEmails(attendeesText)
    if (attendees.length) body.attendees = attendees
    if (alarms.length && alarms.some((m) => m > 0)) {
      body.alarms = alarms.filter((m) => m > 0).map((m) => ({ action: 'DISPLAY' as Alarm['action'], trigger: triggerForMinutes(m) }))
    }
    const rule = buildRule(freq, { interval, byday })
    body.recurrence = rule
    if (kind === 'event') {
      body.kind = 'event'
      body.dtstart = calTimeFromInputs(allDay, startYmd, hmsFromInput(startTime))
      body.duration = durationFromMinutes(durMin, allDay)
      void save.mutate({ kind: 'event', calKey: destCal, uid: existing?.uid, body })
    } else {
      body.kind = 'task'
      const dueYmd = dueDate
        ? { year: Number(dueDate.slice(0, 4)), month: Number(dueDate.slice(5, 7)), day: Number(dueDate.slice(8, 10)) }
        : startYmd
      body.due = calTimeFromInputs(allDay, dueYmd, hmsFromInput(dueTime))
      body.status = done ? 'COMPLETED' : 'NEEDS-ACTION'
      body.percentComplete = done ? 100 : 0
      void save.mutate({ kind: 'task', calKey: destCal, uid: existing?.uid, body })
    }
  }

  const toggleDay = (w: Weekday): void => {
    setByday((prev) => {
      const has = prev.some((d) => d.weekday === w)
      return has ? prev.filter((d) => d.weekday !== w) : [...prev, { weekday: w }]
    })
  }

  const addAlarm = (minutes: number): void => {
    setAlarms((prev) => (prev.includes(minutes) ? prev : [...prev, minutes].sort((a, b) => a - b)))
  }
  const removeAlarm = (minutes: number): void => {
    setAlarms((prev) => prev.filter((m) => m !== minutes))
  }

  return (
    <Dialog width={480} open onOpenChange={(o) => {
      if (!o) onClose()
    }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (summary.trim()) submit()
        }}
      >
        <div className="cl-form-row" style={{ marginBottom: 12 }}>
          <label>Event / task</label>
          <Select size="sm" value={kind} onChange={(e) => setKind(e.target.value as 'event' | 'task')} disabled={!!existing}>
            <option value="event">Event</option>
            <option value="task">Task</option>
          </Select>
        </div>

        {calendars.length > 0 && (
          <div className="cl-form-row split">
            <label>Calendar</label>
            <Select size="sm" value={destCal} onChange={(e) => setDestCal(e.target.value)} disabled={!!existing}>
              {calendars.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.displayName}
                </option>
              ))}
            </Select>
          </div>
        )}

        <label className="cl-field-label">Summary</label>
        <input autoFocus className="cl-input cl-input-lg" placeholder="Add title" value={summary} onChange={(e) => setSummary(e.target.value)} />

        <div className="cl-form-row">
          <label className="cl-check-label">
            <Checkbox checked={allDay} onCheckedChange={setAllDay} /> All day
          </label>
        </div>

        {kind === 'event' ? (
          <>
            <div className="cl-form-row split">
              <label htmlFor="cl-start-date">Date</label>
              <DatePicker
                value={startDate}
                onValueChange={(value) => {
                  if (typeof value === 'string') setStartDate(value)
                }}
                locale={locale}
                aria-label="Event date"
              >
                <div className="cl-sdk-field">
                  <DatePickerInput id="cl-start-date" className="cl-input" aria-label="Event date" />
                  <DatePickerTrigger className="cl-sdk-field-btn" aria-label="Choose date">
                    ▦
                  </DatePickerTrigger>
                </div>
                <DatePickerHint className="cl-sdk-hint" />
                <DatePickerContent className="cl-sdk-popup" />
              </DatePicker>
            </div>
            {!allDay && (
              <>
                <div className="cl-form-row split">
                  <label>Start</label>
                  <TimeInput
                    value={startTime}
                    onValueChange={(value) => {
                      if (value) setStartTime(value)
                    }}
                    hourCycle={24}
                    locale={locale}
                    aria-label="Start time"
                    className="cl-sdk-time"
                  />
                </div>
                <div className="cl-form-row split">
                  <label>End</label>
                  <span className="cl-sdk-time-end" data-cl-time-end>
                    {spanTimeLabel(minutesOfTime(startTime) + durMin)}
                  </span>
                </div>
                <div className="cl-form-row split">
                  <label>Duration</label>
                  <Select size="sm" value={allDay ? '1440' : String(durMin)} onChange={(e) => setDurMin(Number(e.target.value))}>
                    {allDay ? <option value="1440">All day</option> : (
                      <>
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                        <option value="180">3 hours</option>
                      </>
                    )}
                  </Select>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="cl-form-row split">
              <label htmlFor="cl-due-date">Due date</label>
              <DatePicker
                value={dueDate}
                onValueChange={(value) => {
                  if (typeof value === 'string') setDueDate(value)
                }}
                locale={locale}
                aria-label="Due date"
              >
                <div className="cl-sdk-field">
                  <DatePickerInput id="cl-due-date" className="cl-input" aria-label="Due date" />
                  <DatePickerTrigger className="cl-sdk-field-btn" aria-label="Choose due date">
                    ▦
                  </DatePickerTrigger>
                </div>
                <DatePickerHint className="cl-sdk-hint" />
                <DatePickerContent className="cl-sdk-popup" />
              </DatePicker>
            </div>
            {!allDay && (
              <div className="cl-form-row split">
                <label>Due time</label>
                <TimeInput
                  value={dueTime}
                  onValueChange={(value) => {
                    if (value) setDueTime(value)
                  }}
                  hourCycle={24}
                  locale={locale}
                  aria-label="Due time"
                  className="cl-sdk-time"
                />
              </div>
            )}
            <div className="cl-form-row">
              <label className="cl-check-label">
                <Checkbox checked={done} onCheckedChange={setDone} /> Completed
              </label>
            </div>
          </>
        )}

        <div className="cl-form-row split">
          <label>Location</label>
          <input className="cl-input" placeholder="Room, link, or address" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        {kind === 'event' && (
          <div className="cl-form-row split">
            <label>Attendees</label>
            <input className="cl-input" placeholder="alice@example.com, bob@…" value={attendeesText} onChange={(e) => setAttendeesText(e.target.value)} />
          </div>
        )}

        {/* Recurrence rule builder (XER-306) */}
        <div className="cl-form-row split">
          <label>Repeats</label>
          <Select size="sm" value={freq} onChange={(e) => setFreq(e.target.value as RecurFreq)}>
            {RECUR_FREQS.map((f) => (
              <option key={f} value={f}>
                {recurLabel(f)}
              </option>
            ))}
          </Select>
        </div>

        {freq !== 'NONE' && (
          <div className="cl-form-row split">
            <label>Every</label>
            <div className="cl-inline-row">
              <input
                className="cl-input cl-num-input"
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))}
                aria-label="Repeat interval"
              />
              <span className="cl-muted">{unitFor(freq, interval)}</span>
            </div>
          </div>
        )}

        {freq === 'WEEKLY' && (
          <div className="cl-form-row" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {WEEKDAY_CODES.map((w) => {
              const on = byday.some((d) => d.weekday === w)
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(w)}
                  className={`cl-byday-btn${on ? ' on' : ''}`}
                >
                  {w.slice(0, 2)}
                </button>
              )
            })}
          </div>
        )}

        {/* Alarms (XER-306) */}
        {!allDay && kind === 'event' && (
          <div className="cl-alarm-row">
            <label className="cl-field-label">Reminders</label>
            {alarms.length > 0 && (
              <ul className="cl-alarm-list">
                {alarms.map((m) => (
                  <li key={m}>
                    <span className="cl-muted">{alarmLabelFor(m)}</span>
                    <button type="button" className="cl-alarm-remove" aria-label={`Remove ${alarmLabelFor(m)}`} onClick={() => removeAlarm(m)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cl-form-row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {ALARM_PRESETS.filter((p) => p.minutes > 0).map((p) => (
                <button key={p.minutes} type="button" className="cl-alarm-add" onClick={() => addAlarm(p.minutes)} disabled={alarms.includes(p.minutes)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="cl-field-label">Notes</label>
        <textarea className="cl-input cl-notes" rows={2} placeholder="Optional description" value={desc} onChange={(e) => setDesc(e.target.value)} />

        <div className="cl-dialog-actions">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="primary" disabled={!summary.trim() || save.isPending}>
            {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ── small pure helpers ─────────────────────────────────────────────────── */

function minutesOfTime(hhmm: string): number {
  const h = hmsFromInput(hhmm)
  return h ? h.hour * 60 + h.minute : 0
}

function unitFor(freq: RecurFreq, interval: number): string {
  const plural = interval !== 1
  switch (freq) {
    case 'DAILY':
      return plural ? 'days' : 'day'
    case 'WEEKLY':
      return plural ? 'weeks' : 'week'
    case 'MONTHLY':
      return plural ? 'months' : 'month'
    default:
      return plural ? 'years' : 'year'
  }
}
