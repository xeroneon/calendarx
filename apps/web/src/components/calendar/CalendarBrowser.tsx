import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, CommandMenu, Dialog, Kbd, Select, useDialog } from '@calendarx/ui'
import type { CalendarItem, CalTime, CalendarTask, Occurrence } from '@calendarx/sdk'
import { createItem, deleteItem, expand, listCalendars, listItems, updateItem, DEFAULT_CAL_KEY } from '~/server/calendar'
import { authCall } from '~/lib/auth-call'
import {
  RECUR_FREQS,
  addDays,
  addMonths,
  calTimeFromInputs,
  formatHms,
  freqFromRule,
  hmsFromInput,
  monthGrid,
  monthLabel,
  occDay,
  occTime,
  parseYmdKey,
  recurLabel,
  ruleForFreq,
  timeRangeLabel,
  todayYmd,
  weekdayShort,
  weekWindow,
  windowUtc,
  ymdKey,
  ymdToDate,
  type HMS,
  type RecurFreq,
  type YMD,
} from '~/lib/calendar'

export type CalendarView = 'month' | 'week' | 'day' | 'tasks'

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
  const [editTarget, setEditTarget] = React.useState<{ kind: 'event' | 'task'; item?: CalendarItem } | null>(null)
  const help = useDialog()
  const confirmDel = useDialog()

  const calKey = DEFAULT_CAL_KEY

  /* ---- data ------------------------------------------------------------ */
  const calsQuery = useQuery({ queryKey: ['calendar', 'cals'], queryFn: () => authCall(() => listCalendars({ data: {} })) })
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

  const calColor = ((): string => {
    const cs = calsQuery.data ?? []
    return cs.find((c) => c.key === calKey)?.color ?? '#6366f1'
  })()

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'occurrences'] })
    void qc.invalidateQueries({ queryKey: ['calendar', 'occ'] })
    void qc.invalidateQueries({ queryKey: ['calendar', 'items'] })
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
    const q = filter.trim().toLowerCase()
    const filtered = q ? tasks.filter((t) => (t.summary ?? '').toLowerCase().includes(q)) : tasks
    const score = (t: CalendarTask): number => {
      if (t.status === 'COMPLETED') return 2
      const due = t.due
      return due ? (due.kind === 'date' ? 0 : 1) : 3
    }
    return [...filtered].sort((a, b) => {
      const sa = score(a)
      const sb = score(b)
      if (sa !== sb) return sa - sb
      const da = calTimeToForm(a.due ?? a.dtstart)
      const db = calTimeToForm(b.due ?? b.dtstart)
      return (da && db ? ymdKey(da.ymd).localeCompare(ymdKey(db.ymd)) : 0)
    })
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
          defaultDate={anchor}
          calKey={calKey}
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
                  <button
                    type="button"
                    className={`cl-daynum${ymdKey(d) === ymdKey(today) ? ' today' : ''}`}
                    onClick={() => setAnchor(d)}
                    aria-label={`${ymdKey(d)}`}
                  >
                    {d.day}
                  </button>
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
              </div>
            )
          })}
        </div>
        <div className="cl-weekview-body">
          {days.map((d) => {
            const occs = occOn(d)
            const key = ymdKey(d)
            return (
              <div key={key} className={`cl-col${weekdayIndex(d) >= 5 ? ' wknd' : ''}`}>
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
          <Button size="sm" variant="primary" onClick={() => setEditTarget({ kind: 'event' })}>
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
}

function ItemDialog({
  target,
  defaultDate,
  calKey,
  onClose,
  onSaved,
}: {
  target: ItemDialogTarget
  defaultDate: YMD
  calKey: string
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const existing = target.item
  const editKind = existing?.kind ?? target.kind
  const existingTask = existing?.kind === 'task' ? existing : null
  const existingEvent = existing?.kind === 'event' ? existing : null
  const dt = existing ? calTimeToForm(editKind === 'task' ? (existingTask?.due ?? existingTask?.dtstart) : existingEvent?.dtstart) : null

  const [summary, setSummary] = React.useState(existing?.summary ?? '')
  const [kind, setKind] = React.useState<'event' | 'task'>(editKind)
  const [allDay, setAllDay] = React.useState(dt?.allDay ?? false)
  const [startDate, setStartDate] = React.useState(dt ? ymdKey(dt.ymd) : ymdKey(defaultDate))
  const [startTime, setStartTime] = React.useState(dt?.hms ? formatHms(dt.hms) : '09:00')
  const [durMin, setDurMin] = React.useState(dt ? (durationMinutes(existing && existing.kind === 'event' ? existing.duration : undefined) ?? 60) : 60)
  const [dueDate, setDueDate] = React.useState(dt ? ymdKey(dt.ymd) : ymdKey(defaultDate))
  const [dueTime, setDueTime] = React.useState(dt?.hms ? formatHms(dt.hms) : '17:00')
  const [recur, setRecur] = React.useState<RecurFreq>(freqFromRule(existing?.recurrence))
  const [desc, setDesc] = React.useState(existing?.description ?? '')
  const [done, setDone] = React.useState(existing?.kind === 'task' && existing.status === 'COMPLETED')

  const save = useMutation({
    mutationFn: (payload: { kind: 'event' | 'task'; uid?: string; body: Record<string, unknown> }) => {
      if (payload.uid) {
        const uid = payload.uid // widened-safe capture (closure doesn't preserve narrowing)
        return authCall(() => updateItem({ data: { key: calKey, uid, patch: payload.body } }))
      }
      return authCall(() => createItem({ data: { key: calKey, item: payload.body as unknown as CalendarItem } }))
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const submit = (): void => {
    const startYmd = parseYmdKey(startDate)
    if (!startYmd) return
    const body: Record<string, unknown> = { summary: summary.trim(), description: desc }
    body.recurrence = ruleForFreq(recur)
    if (kind === 'event') {
      body.kind = 'event'
      body.dtstart = calTimeFromInputs(allDay, startYmd, hmsFromInput(startTime))
      body.duration = allDay ? `P${Math.max(1, Math.round(durMin / 1440))}D` : `PT${durMin}M`
      void save.mutate({ kind: 'event', uid: existing?.uid, body })
    } else {
      body.kind = 'task'
      const dueYmd = parseYmdKey(dueDate) ?? startYmd
      body.due = calTimeFromInputs(allDay, dueYmd, hmsFromInput(dueTime))
      body.status = done ? 'COMPLETED' : 'NEEDS-ACTION'
      body.percentComplete = done ? 100 : 0
      void save.mutate({ kind: 'task', uid: existing?.uid, body })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => {
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
          <label>Repeats</label>
          <Select size="sm" value={recur} onChange={(e) => setRecur(e.target.value as RecurFreq)}>
            {RECUR_FREQS.map((f) => (
              <option key={f} value={f}>
                {recurLabel(f)}
              </option>
            ))}
          </Select>
        </div>

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