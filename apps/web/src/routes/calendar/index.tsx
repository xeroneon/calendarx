import { createFileRoute, useSearch } from '@tanstack/react-router'
import * as React from 'react'
import { CalendarBrowser, type CalendarView } from '~/components/calendar/CalendarBrowser'
import { ConnectionScreen } from '~/components/connection/ConnectionScreen'
import { parseYmdKey } from '~/lib/calendar'
import { useConnectionStatus } from '~/hooks/useConnectionStatus'

const VIEWS: CalendarView[] = ['month', 'week', 'day', 'tasks']

export const Route = createFileRoute('/calendar/')({
  component: () => {
    const search = useSearch({ strict: false }) as Record<string, unknown>
    const rawView = typeof search.view === 'string' ? (search.view as CalendarView) : 'month'
    const view = VIEWS.includes(rawView) ? rawView : 'month'
    const rawDate = typeof search.date === 'string' ? search.date : undefined
    const date = rawDate && parseYmdKey(rawDate) ? rawDate : undefined
    return <CalendarRouteGate view={view} date={date} />
  },
})

/** Show the "add your CalDAV server" screen on first run instead of an empty calendar. */
function CalendarRouteGate({ view, date }: { view: CalendarView; date?: string }): React.ReactElement {
  const status = useConnectionStatus()
  if (status.state === 'loading') return <div className="cl-empty">Loading…</div>
  if (status.state === 'empty') {
    return (
      <div className="cl-connect-wrap">
        <ConnectionScreen />
      </div>
    )
  }
  return <CalendarBrowser view={view} date={date} />
}