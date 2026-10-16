import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, CommandMenu, Dialog, Kbd, Select, useDialog } from '@calendarx/ui'
import type { CalTime, CalendarCollection, CalendarItem, CalendarTask, Occurrence } from '@calendarx/sdk'
import type { Alarm, RecurrenceRule } from '@calendarx/calendar'
import { createItem, deleteItem, expand, listCalendars, listItems, updateItem, DEFAULT_CAL_KEY } from '~/server/calendar'
import { authCall } from '~/lib/auth-call'
import {
  ALARM_PRESETS,
  RECUR_FREQS,
  addDays,
  addMonths,
  alarmLabelFor,
  alarmMinutesFrom,
  attendeesToText,
  buildRule,
  calTimeFromInputs,
  filterTasks,
  formatHms,
  hmsFromInput,
  monthGrid,
  monthLabel,
  occDay,
  occTime,
  parseAttendeeEmails,
  parseYmdKey,
  recurLabel,
  ruleToState,
  sortTasks,
  timeRangeLabel,
  todayYmd,
  triggerForMinutes,
  WEEKDAY_CODES,
  weekdayShort,
  weekWindow,
  windowUtc,
  ymdKey,
  ymdToDate,
  type ByDayEntry,
  type HMS,
  type RecurFreq,
  type Weekday,
  type YMD,
} from '~/lib/calendar'

export type CalendarView = 'month' | 'week' | 'day' | 'tasks'

interface EditTarget {
  kind: 'event' | 'task'
  item?: CalendarItem
  /** Optional pre-filled creation date (set when creating from a grid cell). */
  date?: YMD
}

interface CalendarBrowserProps {
  key?: string
  view?: CalendarView
  date?: string // YYYY-MM-DD
}

/* ── small helpers -------------------------------------------------------- */

/** Parse an item's DTSTART/DUE into (allDay, date, time) for the form. */
function calTimeToForm(t?: CalTime | null): { allDay: boolean; ymd: YMD; hms: HMS | null } | null {
  if (!t) return null
  return { allDay: t.kind === 'date', ymd: t.date, hms: t.kind === 'date' ? null : t.time }
}

/** ISO duration "PT30M" / "P1D" → integer minutes (null when absent). */
function durationMinutes(d?: string): number | null {
  if (!d) return null
  const m = /^PT(\d+)M$/.exec(d)
  if (m) return Number(m[1])
  const h = /^PT(\d+(?:\.\d+)?)H/.exec(d)
  if (h) return Math.round(Number(h[1]) * 60)
  const day = /^P(\d+)D/.exec(d)
  if (day) return Number(day[1]) * 1440
  if (d === 'P1W') return 10080
  return null
}

/** End HMS of an occurrence given its start time and duration minutes. */
function endTime(start: HMS | null, mins: number | null, allDay: boolean): HMS | null {
  if (allDay || !start || !mins) return null
  const total = start.hour * 60 + start.minute + mins
  return { hour: Math.floor(total / 60) % 24, minute: total % 60, second: 0 }
}

function sameOcc(a: { uid: string; startLocal: string }, b: { uid: string; startLocal: string }): boolean {
  return a.uid === b.uid && a.startLocal === b.startLocal
}

/* ── main component -------------------------------------------------------- */

export function CalendarBrowser({ view = 'month', date }: CalendarBrowserProps): React.ReactElement {
  const qc = useQueryClient()

  const [viewState, setViewState] = React.useState<CalendarView>(view)
  const anchorDate = parseYmdKey(date ?? '') ?? todayYmd()
  const [anchor, setAnchor] = React.useState<YMD>(anchorDate)
  const [sel, setSel] = React.useState<{ uid: string; startLocal: string } | null>(null)
  const [filter, setFilter] = React.useState('')
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null)
  const help = useDialog()
  const confirmDel = useDialog()

  /* ---- data ------------------------------------------------------------ */
  const calsQuery = useQuery({ queryKey: ['calendar', 'cals'], queryFn: () => authCall(() => listCalendars({ data: {} })) })
  const calendars = calsQuery.data ?? []

  // Active calendar collection — resolved to the first real collection once it
  // loads (XER-306 multi-calendar picker), falling back to the demo default key.
  const [calKey, setCalKey] = React.useState<string>(DEFAULT_CAL_KEY)
  React.useEffect(() => {
    if (calendars.length && !calendars.some((c) => c.key === calKey)) {
      setCalKey(calendars[0]!.key)
    }
  }, [calendars, calKey])

  const itemsQuery = useQuery({
    queryKey: ['calendar', 'items', calKey],
    queryFn: () => authCall(() => listItems({ data: { key: calKey, kind: 'all' } })),
  })
  const items = itemsQuery.data?.items ?? []
  const byUid = new Map<string, CalendarItem>()
  for (const it of items) byUid.set(it.uid, it)

  const visibleDays = React.useMemo<YMD[]>(() => {
    switch (viewState) {
      case 'month':
        return monthGrid(anchor).flat()
      case 'week':
        return weekWindow(anchor)
      case 'day':
        return [anchor]
      default:
        return []
    }
  }, [viewState, anchor])

  const { start, end } = windowUtc(visibleDays)
  const occQuery = useQuery({
    queryKey: ['calendar', 'occ', calKey, start, end],
    queryFn: () => authCall(() => expand({ data: { key: calKey, start, end } })),
    enabled: viewState !== 'tasks',
  })
  const occurrences = occQuery.data ?? []

  const calColor = (() => {
    return calendars.find((c) => c.key === calKey)?.color ?? '#6366f1'
  })()

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'occurrences'] })
    void qc.invalidateQueries({ queryKey: ['calendar', 'occ'] })
    void qc.invalidateQueries({ queryKey: ['calendar', 'items'] })
  }

  /** Open the create dialog for a specific day (click-to-create, XER-306). */
  const createOn = (day: YMD): void => {
    setAnchor(day)
    setEditTarget({ kind: 'event', date: day })
  }

  /* ---- keyboard ------------------------------------------------------------------ */

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const t = e.target as HTMLElement
    const onInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    if (onInput || e.metaKey || e.ctrlKey) return
    switch (e.key) {
      case 'm':
        setViewState('month')
        break
      case 'w':
        setViewState('week')
        break
      case 'd':
        setViewState('day')
        break
      case 't':
        setViewState('tasks')
        break
      case '[':
        e.preventDefault()
        setAnchor(prevPeriod(anchor, viewState))
        break
      case ']':
        e.preventDefault()
        setAnchor(nextPeriod(anchor, viewState))
        break
      case 'c':
        if (calendars.length > 1) {
          e.preventDefault()
          const idx = calendars.findIndex((c) => c.key === calKey)
          setCalKey(calendars[(idx + 1) % calendars.length]!.key)
        }
        break
      case 'n':
        e.preventDefault()
        setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event' })
        break
      case 'e':
        if (sel) {
          const it = byUid.get(sel.uid)
          if (it) setEditTarget({ kind: it.kind, item: it })
        }
        break
      case 'Delete':
      case 'Backspace':
        if (sel) configDel(sel)
        break
      case '/':
        e.preventDefault()
        setViewState('tasks')
        break
      case '?':
        help.setOpen(true)
        break
      case 'j':
      case 'ArrowDown':
        moveFocus(1)
        break
      case 'k':
      case 'ArrowUp':
        moveFocus(-1)
        break
      case 'Enter':
        if (sel) {
          const it = byUid.get(sel.uid)
          if (it) setEditTarget({ kind: it.kind, item: it })
        } else {
          setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event' })
        }
        break
    }
  }

  const moveFocus = (dir: 1 | -1): void => {
    const list: { uid: string; startLocal: string }[] =
      viewState === 'tasks'
        ? taskList.map((t) => ({ uid: t.uid, startLocal: '' }))
        : visibleOcc.map((o) => ({ uid: o.uid, startLocal: o.startLocal }))
    if (!list.length) return
    if (!sel) {
      setSel({ uid: list[0]!.uid, startLocal: list[0]!.startLocal })
      return
    }
    const idx = list.findIndex((o) => sameOcc({ uid: o.uid, startLocal: o.startLocal }, sel))
    const next = (idx + dir + list.length) % list.length
    setSel({ uid: list[next]!.uid, startLocal: list[next]!.startLocal })
  }

  const configDel = (o: { uid: string; startLocal: string } | null): void => {
    void o
    confirmDel.setOpen(true)
  }

  /* ---- derived lists ------------------------------------------------------- */

  /** Occurrences visible in the current grid window (joined w/ item meta). */
  const visibleOcc = React.useMemo<Occurrence[]>(
    () =>
      occurrences
        .filter((o) => {
          const d = occDay(o)
          return visibleDays.some((v) => ymdKey(v) === ymdKey(d))
        })
        .sort((a, b) => (a.startUtc > b.startUtc ? 1 : a.startUtc < b.startUtc ? -1 : 0)),
    [occurrences, visibleDays],
  )

  const taskList = React.useMemo<CalendarTask[]>(() => {
    const tasks = items.filter((i) => i.kind === 'task') as CalendarTask[]
    return sortTasks(filterTasks(tasks, filter))
  }, [items, filter])

  /* ---- mutations ---------------------------------------------------------- */

  const remove = useMutation({
    mutationFn: (o: { uid: string }) => authCall(() => deleteItem({ data: { key: calKey, uid: o.uid } })),
    onSuccess: () => {
      confirmDel.close()
      setSel(null)
      refresh()
    },
  })

  const toggleTask = useMutation({
    mutationFn: (t: CalendarItem) => {
      const done = t.status !== 'COMPLETED'
      return authCall(() =>
        updateItem({
          data: {
            key: calKey,
            uid: t.uid,
            patch: { status: done ? 'COMPLETED' : 'NEEDS-ACTION', percentComplete: done ? 100 : 0 },
          },
        }),
      )
    },
    onSuccess: () => refresh(),
  })

  /* ---- render ---------------------------------------------------------------- */

  const today = todayYmd()
  const occOn = (d: YMD): Occurrence[] => {
    const key = ymdKey(d)
    return visibleOcc.filter((o) => ymdKey(occDay(o)) === key)
  }

  return (
    <div className="cl-root" data-cl tabIndex={0} onKeyDown={onKeyDown}>
      <CommandMenu
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          title="Calendar + Tasks"
          placeholder="Jump to a view or action…"
          shortcut="mod+k"
          items={[
            { id: 'month', label: 'View: Month', group: 'Views', hint: 'm', onSelect: () => setViewState('month') },
            { id: 'week', label: 'View: Week', group: 'Views', hint: 'w', onSelect: () => setViewState('week') },
            { id: 'day', label: 'View: Day', group: 'Views', hint: 'd', onSelect: () => setViewState('day') },
            { id: 'tasks', label: 'Tasks list', group: 'Views', hint: 't', onSelect: () => setViewState('tasks') },
            ...calendars.map((c) => ({
              id: `cal:${c.key}`,
              label: `Go to calendar: ${c.displayName}`,
              group: 'Calendars',
              keywords: [c.displayName, c.key],
              icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color ?? '#6366f1', display: 'inline-block' }} />,
              onSelect: () => setCalKey(c.key),
            })),
            { id: 'new-event', label: 'New event', group: 'Actions', hint: 'n', onSelect: () => setEditTarget({ kind: 'event' }) },
            { id: 'new-task', label: 'New task', group: 'Actions', hint: 'shift+n', onSelect: () => setEditTarget({ kind: 'task' }) },
            { id: 'today', label: 'Today', group: 'Actions', onSelect: () => setAnchor(today) },
            { id: 'help', label: 'Keyboard shortcuts', group: 'Actions', hint: '?', onSelect: () => help.setOpen(true) },
          ]}
        />

      {/* toolbar */}
      <div className="cl-toolbar">
        <div className="cl-nav">
          <Button size="sm" variant="ghost" onClick={() => setAnchor(prevPeriod(anchor, viewState))} aria-label="Previous">
            ‹
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(nextPeriod(anchor, viewState))} aria-label="Next">
            ›
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <span className="cl-title">{viewState === 'tasks' ? 'Tasks' : periodLabel(anchor, viewState)}</span>
        </div>

        {calendars.length > 0 && (
          <div className="cl-cal-picker">
            <span className="cl-cal-dot" style={{ background: calColor }} aria-hidden />
            <Select
              size="sm"
              value={calKey}
              aria-label="Calendar"
              onChange={(e) => setCalKey(e.target.value)}
            >
              {calendars.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.displayName}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="cl-views" role="tablist" aria-label="Calendar view">
          {(
            [
              ['month', 'Month'],
              ['week', 'Week'],
              ['day', 'Day'],
              ['tasks', 'Tasks'],
            ] as [CalendarView, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={viewState === v}
              className={`cl-view-btn${viewState === v ? ' active' : ''}`}
              onClick={() => setViewState(v)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cl-actions">
          <Button size="sm" variant="ghost" onClick={() => help.setOpen(true)} aria-label="Keyboard shortcuts">
            <Kbd>?</Kbd>
          </Button>
          <Button size="sm" variant="primary" onClick={() => setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event' })}>
            New {viewState === 'tasks' ? 'task' : 'event'}
          </Button>
        </div>
      </div>

      {/* body */}
      {viewState === 'tasks' ? (
        renderTasks()
      ) : occQuery.isLoading ? (
        <div className="cl-empty">Loading…</div>
      ) : viewState === 'month' ? (
        renderMonth()
      ) : viewState === 'week' ? (
        renderWeek()
      ) : (
        renderDay()
      )}

      <div className="cl-status">
        <span>
          {viewState === 'tasks' ? `${taskList.length} task${taskList.length === 1 ? '' : 's'}` : `${visibleOcc.length} event${visibleOcc.length === 1 ? '' : 's'}`}
          {calKey !== DEFAULT_CAL_KEY ? ` · ${calKey}` : ''}
        </span>
      </div>

      {/* item create/edit dialog */}
      {editTarget ? (
        <ItemDialog
          target={editTarget}
          defaultDate={editTarget.date ?? anchor}
          calKey={calKey}
          calendars={calendars}
          onClose={() => setEditTarget(null)}
          onSaved={refresh}
        />
      ) : null}

      {/* delete confirm */}
      <Dialog {...confirmDel} title="Delete item" width={400}>
        {sel ? (
          <p className="cl-muted">
            Delete “{byUid.get(sel.uid)?.summary ?? 'this item'}”? This removes it from the calendar and the task list.
          </p>
        ) : (
          <p className="cl-muted">Delete this item?</p>
        )}
        <div className="cl-dialog-actions">
          <Button type="button" size="sm" variant="ghost" onClick={() => confirmDel.close()}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={() => sel && void remove.mutate({ uid: sel.uid })} disabled={remove.isPending || !sel}>
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Dialog>

      {/* help */}
      <Dialog {...help} title="Keyboard shortcuts" width={440}>
        <ul className="cl-help">
          {[
            ['m / w / d / t', 'Month / Week / Day / Tasks views'],
            ['[ / ]', 'Previous / next period'],
            ['c', 'Cycle calendars'],
            ['j / k', 'Move focus through items'],
            ['n', 'New item (task in Tasks view, else event)'],
            ['e / Enter', 'Edit focused item'],
            ['⌫ / Delete', 'Delete focused item'],
            ['/ ', 'Jump to task list'],
            ['?', 'Show this help'],
            ['⌘K', 'Command palette'],
          ].map(([key, desc]) => (
            <li key={key}>
              <Kbd>{key}</Kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <div className="cl-dialog-actions">
          <Button size="sm" variant="ghost" onClick={() => help.close()}>
            Done
          </Button>
        </div>
      </Dialog>
    </div>
  )

  /* ---- sub-renders --------------------------------------------------------- */

  function renderMonth(): React.ReactElement {
    const grid = monthGrid(anchor)
    return (
      <div className="cl-month" role="grid" aria-label="Month view">
        <div className="cl-month-head">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="cl-dow">
              {weekdayShort(i)}
            </span>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="cl-week" role="row">
            {week.map((d) => {
              const key = ymdKey(d)
              const inMonth = d.month === anchor.month
              const occs = occOn(d)
              return (
                <div key={key} className={`cl-day${inMonth ? '' : ' out'}`} role="gridcell">
                  <div className="cl-day-head">
                    <button
                      type="button"
                      className={`cl-daynum${ymdKey(d) === ymdKey(today) ? ' today' : ''}`}
                      onClick={() => setAnchor(d)}
                      aria-label={`${ymdKey(d)}`}
                    >
                      {d.day}
                    </button>
                    <button
                      type="button"
                      className="cl-day-add"
                      aria-label={`Add event on ${ymdKey(d)}`}
                      title="Add event"
                      onClick={() => createOn(d)}
                    >
                      +
                    </button>
                  </div>
                  <div className="cl-day-events">
                    {occs.slice(0, 3).map((o) => chip(o))}
                    {occs.length > 3 ? (
                      <span className="cl-more">+{occs.length - 3} more</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  function renderWeek(): React.ReactElement {
    const days = weekWindow(anchor)
    return (
      <div className="cl-weekview" role="grid" aria-label="Week view">
        <div className="cl-weekview-head">
          {days.map((d) => {
            const lbl = d.month === anchor.month ? `${weekdayShort(weekdayIndex(d))} ${d.day}` : formatShort(d)
            return (
              <div key={ymdKey(d)} className="cl-col-head">
                <button
                  type="button"
                  className={`cl-col-head-btn${ymdKey(d) === ymdKey(today) ? ' today' : ''}${weekdayIndex(d) >= 5 ? ' wknd' : ''}`}
                  onClick={() => setAnchor(d)}
                >
                  {lbl}
                </button>
                <button
                  type="button"
                  className="cl-col-add"
                  aria-label={`Add event on ${ymdKey(d)}`}
                  title="Add event"
                  onClick={() => createOn(d)}
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
        <div className="cl-weekview-body">
          {days.map((d) => {
            const occs = occOn(d)
            const key = ymdKey(d)
            return (
              <div key={key} className={`cl-col${weekdayIndex(d) >= 5 ? ' wknd' : ''}`} onDoubleClick={() => createOn(d)}>
                {occs.length === 0 ? (
                  <div className="cl-col-empty">—</div>
                ) : (
                  occs.map((o) => chip(o))
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderDay(): React.ReactElement {
    const occs = occOn(anchor)
    return (
      <div className="cl-dayview" aria-label="Day view">
        <div className="cl-dayview-head">
          <span className={`cl-dayview-title${ymdKey(anchor) === ymdKey(today) ? ' today' : ''}`}>
            {formatLong(anchor)}
          </span>
          <Button size="sm" variant="primary" onClick={() => createOn(anchor)}>
            New
          </Button>
        </div>
        {occs.length === 0 ? (
          <div className="cl-empty">No events this day. Press <Kbd>n</Kbd> to add one.</div>
        ) : (
          <ul className="cl-day-list">
            {occs.map((o) => (
              <li key={`${o.uid}${o.startLocal}`} className={selected(o) ? ' sel' : ''} onClick={() => setSel({ uid: o.uid, startLocal: o.startLocal })}>
                {chip(o)}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  function renderTasks(): React.ReactElement {
    return (
      <div className="cl-tasks" aria-label="Tasks list">
        <div className="cl-tasks-head">
          <input
            className="cl-filter"
            placeholder={filter ? `${filteredCount()} match${filteredCount() === 1 ? '' : 'es'}` : 'Filter tasks…  ( / )'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Filter tasks"
          />
          <Button size="sm" variant="primary" onClick={() => setEditTarget({ kind: 'task' })}>
            New task
          </Button>
        </div>
        {taskList.length === 0 ? (
          <div className="cl-empty">No tasks {filter ? 'match your filter' : 'yet'}.</div>
        ) : (
          <ul className="cl-task-list" role="listbox" aria-label="Tasks">
            {taskList.map((t) => {
              const done = t.status === 'COMPLETED'
              const isSel = sel && sel.uid === t.uid
              const due = calTimeToForm(t.due ?? t.dtstart)
              return (
                <li
                  key={t.uid}
                  role="option"
                  aria-selected={!!isSel}
                  data-active={isSel ? 'true' : undefined}
                  className={`cl-task-row${done ? ' done' : ''}`}
                  onMouseMove={() => setSel({ uid: t.uid, startLocal: '' })}
                  onDoubleClick={() => setEditTarget({ kind: 'task', item: t })}
                >
                  <Checkbox checked={done} onCheckedChange={() => void toggleTask.mutate(t)} />
                  <span className="cl-task-summary">{t.summary ?? 'Untitled task'}</span>
                  {t.percentComplete != null && t.percentComplete > 0 && t.percentComplete < 100 ? (
                    <span className="cl-task-pct">{t.percentComplete}%</span>
                  ) : null}
                  <span className="cl-task-due">{due ? `${dueHmsLabel(due)}` : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditTarget({ kind: 'task', item: t })}>
                    Edit
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  function chip(o: Occurrence): React.ReactElement {
    const it = byUid.get(o.uid)
    const key = `${o.uid}${o.startLocal}`
    const start = occTime(o)
    const mins = it ? (it.kind === 'event' ? durationMinutes(it.duration) : null) : null
    const end = start ? endTime(start, mins, o.allDay) : null
    const cls = it?.kind === 'task' ? 'cl-chip task' : 'cl-chip'
    const selCls = selected(o) ? ' sel' : ''
    return (
      <button
        type="button"
        key={key}
        className={`${cls}${selCls}`}
        style={it?.kind === 'task' ? undefined : { borderColor: calColor, color: calColor }}
        title={it?.summary ?? ''}
        onClick={() => {
          setSel({ uid: o.uid, startLocal: o.startLocal })
          if (it) setEditTarget({ kind: it.kind, item: it })
        }}
      >
        <span className="cl-chip-time">{timeRangeLabel(start, end, o.allDay)}</span>
        <span className="cl-chip-summary">{it?.summary ?? o.uid}</span>
      </button>
    )
  }

  function selected(o: { uid: string; startLocal: string }): boolean {
    return !!sel && sel.uid === o.uid && sel.startLocal === o.startLocal
  }

  function filteredCount(): number {
    const q = filter.trim().toLowerCase()
    return q ? items.filter((t) => t.kind === 'task' && (t.summary ?? '').toLowerCase().includes(q)).length : taskList.length
  }

  }

/* ---- create/edit dialog (standalone component) ---- */

interface ItemDialogTarget {
  kind: 'event' | 'task'
  item?: CalendarItem
  /** Optional pre-filled creation date (set when creating from a grid cell). */
  date?: YMD
}

function ItemDialog({
  target,
  defaultDate,
  calKey,
  calendars,
  onClose,
  onSaved,
}: {
  target: ItemDialogTarget
  defaultDate: YMD
  calKey: string
  calendars: CalendarCollection[]
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
  const [startTime, setStartTime] = React.useState(dt?.hms ? formatHms(dt.hms) : '09:00')
  const [durMin, setDurMin] = React.useState(dt ? (durationMinutes(existing && existing.kind === 'event' ? existing.duration : undefined) ?? 60) : 60)
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
    const startYmd = parseYmdKey(startDate)
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
      body.duration = allDay ? `P${Math.max(1, Math.round(durMin / 1440))}D` : `PT${durMin}M`
      void save.mutate({ kind: 'event', calKey: destCal, uid: existing?.uid, body })
    } else {
      body.kind = 'task'
      const dueYmd = parseYmdKey(dueDate) ?? startYmd
      body.due = calTimeFromInputs(allDay, dueYmd, hmsFromInput(dueTime))
      body.status = done ? 'COMPLETED' : 'NEEDS-ACTION'
      body.percentComplete = done ? 100 : 0
      void save.mutate({ kind: 'task', calKey: destCal, uid: existing?.uid, body })
    }
  }

  const toggleDay = (w: Weekday): void => {
    setByday((prev) => {
      const has = prev.some((d) => d.weekday === w)
      const next = has ? prev.filter((d) => d.weekday !== w) : [...prev, { weekday: w }]
      return next
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
              <label>Date</label>
              <input className="cl-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            {!allDay && (
              <>
                <div className="cl-form-row split">
                  <label>Start</label>
                  <input className="cl-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
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
              <label>Due date</label>
              <input className="cl-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {!allDay && (
              <div className="cl-form-row split">
                <label>Due time</label>
                <input className="cl-input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
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
              <span className="cl-muted">{freq === 'DAILY' ? (interval === 1 ? 'day' : 'days') : freq === 'WEEKLY' ? (interval === 1 ? 'week' : 'weeks') : freq === 'MONTHLY' ? (interval === 1 ? 'month' : 'months') : interval === 1 ? 'year' : 'years'}</span>
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

function dueHmsLabel(f: { allDay: boolean; ymd: YMD; hms: HMS | null }): string {
  const d = ymdToDate(f.ymd)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (f.allDay || !f.hms) return date
  return `${date} ${formatHms(f.hms)}`
}

/* ---- period navigation helpers --------------------------------------------------- */

function prevPeriod(anchor: YMD, view: CalendarView): YMD {
  switch (view) {
    case 'month':
      return addMonths(anchor, -1)
    case 'week':
      return addDays(anchor, -7)
    case 'day':
      return addDays(anchor, -1)
    default:
      return anchor
  }
}
function nextPeriod(anchor: YMD, view: CalendarView): YMD {
  switch (view) {
    case 'month':
      return addMonths(anchor, 1)
    case 'week':
      return addDays(anchor, 7)
    case 'day':
      return addDays(anchor, 1)
    default:
      return anchor
  }
}

function periodLabel(anchor: YMD, view: CalendarView): string {
  switch (view) {
    case 'month':
      return monthLabel(anchor)
    case 'week': {
      const w = weekWindow(anchor)
      return `${ymdKey(w[0]!)} – ${ymdKey(w[6]!)}`
    }
    case 'day':
      return formatLong(anchor)
    default:
      return ''
  }
}

function weekdayIndex(y: YMD): number {
  return (ymdToDate(y).getDay() + 6) % 7
}

function formatLong(y: YMD): string {
  const d = ymdToDate(y)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShort(y: YMD): string {
  const d = ymdToDate(y)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}