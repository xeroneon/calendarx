import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, CommandMenu, Dialog, Kbd, Select, useDialog } from '@calendarx/ui'
import type { CalTime, CalendarItem, CalendarTask, Occurrence } from '@calendarx/sdk'
import { createCalendarController } from '@ui-sdk/react/calendar'
import { deleteItem, expand, listCalendars, listItems, updateItem, DEFAULT_CAL_KEY } from '~/server/calendar'
import { authCall } from '~/lib/auth-call'
import {
  addDays,
  appWeekStartsOn,
  filterTasks,
  formatIsoDate,
  monthGridLocale,
  occDay,
  sortTasks,
  todayYmd,
  uiLocale,
  weekWindowLocale,
  windowUtc,
  ymdKey,
  type QuickRangeKind,
  type YMD,
} from '~/lib/calendar'
import { spanToTimes, type EventSpan } from '~/lib/span-model'
import { MonthView } from './MonthView'
import { TimeGrid } from './TimeGrid'
import { ItemDialog, type EditTarget } from './ItemDialog'
import { QuickRanges, quickRangeDay } from './QuickRanges'

export type CalendarView = 'month' | 'week' | 'day' | 'tasks'

interface CalendarBrowserProps {
  key?: string
  view?: CalendarView
  date?: string // YYYY-MM-DD
}

/* ── main component -------------------------------------------------------- */

export function CalendarBrowser({ view = 'month', date }: CalendarBrowserProps): React.ReactElement {
  const qc = useQueryClient()
  const locale = React.useMemo(() => uiLocale(), [])
  const weekStartsOn = React.useMemo(() => appWeekStartsOn(locale), [locale])

  const [viewState, setViewState] = React.useState<CalendarView>(view)
  const anchorDate = React.useMemo(() => parseDay(date) ?? todayYmd(), [date])
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
  const byUid = React.useMemo(() => {
    const map = new Map<string, CalendarItem>()
    for (const it of items) map.set(it.uid, it)
    return map
  }, [items])

  const visibleDays = React.useMemo<YMD[]>(() => {
    switch (viewState) {
      case 'month':
        return monthGridLocale(anchor, weekStartsOn).flat()
      case 'week':
        return weekWindowLocale(anchor, weekStartsOn)
      case 'day':
        return [anchor]
      default:
        return []
    }
  }, [viewState, anchor, weekStartsOn])

  const window = React.useMemo(() => windowUtc(visibleDays), [visibleDays])
  const occQuery = useQuery({
    queryKey: ['calendar', 'occ', calKey, window.start, window.end],
    queryFn: () => authCall(() => expand({ data: { key: calKey, start: window.start, end: window.end } })),
    enabled: viewState !== 'tasks',
  })
  const occurrences = occQuery.data ?? []

  const calColor = calendars.find((c) => c.key === calKey)?.color ?? '#6366f1'

  const refresh = React.useCallback((): void => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'occ'] })
    void qc.invalidateQueries({ queryKey: ['calendar', 'items'] })
  }, [qc])

  /** Open the create dialog for a specific day (click-to-create, XER-306). */
  const createOn = React.useCallback((day: YMD, range?: { start: number; end: number }): void => {
    setAnchor(day)
    setEditTarget({ kind: 'event', date: day, range })
  }, [])

  /* ---- month controller (SDK drives the grid) --------------------------- */
  const monthController = React.useState(() => createCalendarController())[0]
  const monthKey = `${anchor.year}-${String(anchor.month).padStart(2, '0')}`

  const goMonth = (next: string): void => {
    const [y, m] = next.split('-').map(Number)
    if (!y || !m) return
    const day = Math.min(anchor.day, new Date(y, m, 0).getDate())
    setAnchor({ year: y, month: m, day })
  }

  /* ---- keyboard ---------------------------------------------------------- */

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const t = e.target as HTMLElement
    const onInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    const inGrid = t.closest('[data-cl-tg]') !== null || t.closest('[data-slot="calendar"]') !== null
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
        if (inGrid) return
        e.preventDefault()
        navigate(-1)
        break
      case ']':
        if (inGrid) return
        e.preventDefault()
        navigate(1)
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
        setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event', date: anchor })
        break
      case 'e':
        if (sel) {
          const it = byUid.get(sel.uid)
          if (it) setEditTarget({ kind: it.kind, item: it })
        }
        break
      case 'Delete':
      case 'Backspace':
        if (sel && !inGrid) confirmDel.setOpen(true)
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
        if (!inGrid) moveFocus(1)
        break
      case 'k':
      case 'ArrowUp':
        if (!inGrid) moveFocus(-1)
        break
      case 'Enter':
        if (inGrid) break
        if (sel) {
          const it = byUid.get(sel.uid)
          if (it) setEditTarget({ kind: it.kind, item: it })
        } else {
          setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event', date: anchor })
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
    const idx = list.findIndex((o) => o.uid === sel.uid && o.startLocal === sel.startLocal)
    const next = (idx + dir + list.length) % list.length
    setSel({ uid: list[next]!.uid, startLocal: list[next]!.startLocal })
  }

  /* ---- derived lists ------------------------------------------------------- */

  /** Occurrences visible in the current grid window (joined w/ item meta). */
  const visibleOcc = React.useMemo<Occurrence[]>(() => {
    const keys = new Set(visibleDays.map((v) => ymdKey(v)))
    return occurrences
      .filter((o) => keys.has(ymdKey(occDay(o))))
      .sort((a, b) => (a.startUtc > b.startUtc ? 1 : a.startUtc < b.startUtc ? -1 : 0))
  }, [occurrences, visibleDays])

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

  /** Move or resize from the time grid: patch the occurrence's start/duration. */
  const patchSpan = useMutation({
    mutationFn: (payload: { uid: string; start: CalTime | undefined; duration: string }) =>
      authCall(() =>
        updateItem({ data: { key: calKey, uid: payload.uid, patch: { dtstart: payload.start, duration: payload.duration } } }),
      ),
    onSuccess: () => refresh(),
  })

  const deleteSpan = useMutation({
    mutationFn: (uid: string) => authCall(() => deleteItem({ data: { key: calKey, uid } })),
    onSuccess: () => refresh(),
  })

  /* ---- grid commit handlers ---------------------------------------------- */

  const commitSpan = (span: EventSpan, uid: string): void => {
    const times = spanToTimes({ track: span.track, start: span.start, end: span.end })
    if (!times) return
    patchSpan.mutate({ uid, start: times.start, duration: times.duration })
  }

  const handleMove = (span: EventSpan, original: EventSpan): void => {
    const uid = original.id.split('|')[0]!
    commitSpan(span, uid)
  }

  const handleDraw = (span: EventSpan): void => {
    const day = quickRangeDay(span.track)
    createOn(day, { start: span.start, end: span.end })
  }

  const handleDelete = (span: EventSpan): void => {
    deleteSpan.mutate(span.id.split('|')[0]!)
  }

  /* ---- navigation --------------------------------------------------------- */

  const navigate = (dir: 1 | -1): void => {
    switch (viewState) {
      case 'month':
        if (dir === 1) monthController.next()
        else monthController.previous()
        break
      case 'week':
        setAnchor(addDays(anchor, dir * 7))
        break
      case 'day':
        setAnchor(addDays(anchor, dir))
        break
      default:
        break
    }
  }

  const pickQuickRange = (range: { kind: QuickRangeKind; start: string; end: string }): void => {
    setAnchor(quickRangeDay(range.start))
    if (range.kind === 'this-week' || range.kind === 'next-week') setViewState('week')
    else setViewState('month')
  }

  /* ---- render ---------------------------------------------------------------- */

  const today = todayYmd()

  return (
    <div className="cl-root" tabIndex={0} onKeyDown={onKeyDown}>
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
          { id: 'new-event', label: 'New event', group: 'Actions', hint: 'n', onSelect: () => setEditTarget({ kind: 'event', date: anchor }) },
          { id: 'new-task', label: 'New task', group: 'Actions', hint: 'shift+n', onSelect: () => setEditTarget({ kind: 'task' }) },
          { id: 'today', label: 'Today', group: 'Actions', onSelect: () => setAnchor(today) },
          { id: 'help', label: 'Keyboard shortcuts', group: 'Actions', hint: '?', onSelect: () => help.setOpen(true) },
        ]}
      />

      {/* toolbar */}
      <div className="cl-toolbar">
        <div className="cl-nav">
          <Button size="sm" variant="ghost" onClick={() => navigate(-1)} aria-label="Previous">
            ‹
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(1)} aria-label="Next">
            ›
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <span className="cl-title">{viewState === 'tasks' ? 'Tasks' : periodLabel(anchor, viewState, monthKey, locale, weekStartsOn)}</span>
        </div>

        {calendars.length > 0 && (
          <div className="cl-cal-picker">
            <span className="cl-cal-dot" style={{ background: calColor }} aria-hidden />
            <Select size="sm" value={calKey} aria-label="Calendar" onChange={(e) => setCalKey(e.target.value)}>
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
          <Button size="sm" variant="primary" onClick={() => setEditTarget({ kind: viewState === 'tasks' ? 'task' : 'event', date: anchor })}>
            New {viewState === 'tasks' ? 'task' : 'event'}
          </Button>
        </div>
      </div>

      {viewState !== 'tasks' ? <QuickRanges locale={locale} weekStartsOn={weekStartsOn} onPick={pickQuickRange} /> : null}

      {/* body */}
      {viewState === 'tasks' ? (
        renderTasks()
      ) : occQuery.isLoading ? (
        <div className="cl-empty">Loading…</div>
      ) : viewState === 'month' ? (
        <MonthView
          month={monthKey}
          onMonthChange={goMonth}
          anchor={anchor}
          onAnchorChange={setAnchor}
          occurrences={visibleOcc}
          byUid={byUid}
          calColor={calColor}
          locale={locale}
          weekStartsOn={weekStartsOn}
          selected={sel}
          onSelect={(o) => setSel({ uid: o.uid, startLocal: o.startLocal })}
          onEdit={(item) => setEditTarget({ kind: item.kind, item })}
          onCreateOn={(day) => createOn(day)}
          controller={monthController}
        />
      ) : (
        <TimeGrid
          days={visibleDays}
          occurrences={visibleOcc}
          byUid={byUid}
          calColor={calColor}
          locale={locale}
          selected={sel}
          onSelect={(o) => {
            setSel({ uid: o.uid, startLocal: o.startLocal })
            const item = byUid.get(o.uid)
            if (item) setEditTarget({ kind: item.kind, item })
          }}
          onCreate={handleDraw}
          onMove={handleMove}
          onResize={handleMove}
          onDelete={handleDelete}
          onDayClick={(day) => (viewState === 'week' ? setAnchor(day) : setAnchor(day))}
        />
      )}

      <div className="cl-status">
        <span>
          {viewState === 'tasks' ? `${taskList.length} task${taskList.length === 1 ? '' : 's'}` : `${visibleOcc.length} event${visibleOcc.length === 1 ? '' : 's'}`}
          {calKey !== DEFAULT_CAL_KEY ? ` · ${calendars.find((c) => c.key === calKey)?.displayName ?? 'calendar'}` : ''}
        </span>
      </div>

      {/* item create/edit dialog */}
      {editTarget ? (
        <ItemDialog
          target={editTarget}
          defaultDate={editTarget.date ?? anchor}
          calKey={calKey}
          calendars={calendars}
          locale={locale}
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

  /* ---- tasks view --------------------------------------------------------- */

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
                  <span className="cl-task-due">{dueLabel(t)}</span>
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

  function filteredCount(): number {
    const q = filter.trim().toLowerCase()
    return q ? items.filter((t) => t.kind === 'task' && (t.summary ?? '').toLowerCase().includes(q)).length : taskList.length
  }
}

/* ---- period navigation helpers --------------------------------------------------- */

function parseDay(s?: string): YMD | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function periodLabel(anchor: YMD, view: CalendarView, monthKey: string, locale: string, weekStartsOn: number): string {
  switch (view) {
    case 'month':
      return formatIsoDate(`${monthKey}-01`, locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    case 'week': {
      const w = weekWindowLocale(anchor, weekStartsOn)
      return `${formatIsoDate(ymdKey(w[0]!), locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${formatIsoDate(ymdKey(w[6]!), locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
    }
    case 'day':
      return formatIsoDate(ymdKey(anchor), locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    default:
      return ''
  }
}

function dueLabel(t: CalendarTask): string {
  const d = t.due ?? t.dtstart
  if (!d) return ''
  const iso = ymdKey(d.date)
  const day = formatIsoDate(iso, uiLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (d.kind === 'date') return day
  const h = String(d.time.hour).padStart(2, '0')
  const m = String(d.time.minute).padStart(2, '0')
  return `${day} ${h}:${m}`
}
