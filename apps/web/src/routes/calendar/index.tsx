import { createFileRoute, useSearch } from '@tanstack/react-router'
import { CalendarBrowser, type CalendarView } from '~/components/calendar/CalendarBrowser'
import { parseYmdKey } from '~/lib/calendar'

const VIEWS: CalendarView[] = ['month', 'week', 'day', 'tasks']

export const Route = createFileRoute('/calendar/')({
  component: () => {
    const search = useSearch({ strict: false }) as Record<string, unknown>
    const rawView = typeof search.view === 'string' ? (search.view as CalendarView) : 'month'
    const view = VIEWS.includes(rawView) ? rawView : 'month'
    const rawDate = typeof search.date === 'string' ? search.date : undefined
    const date = rawDate && parseYmdKey(rawDate) ? rawDate : undefined
    return <CalendarBrowser view={view} date={date} />
  },
})