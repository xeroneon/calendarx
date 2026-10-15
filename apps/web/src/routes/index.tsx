import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="cl-welcome">
      <h1>CalendarX</h1>
      <p className="cl-muted">Your CalDAV calendar + tasks, in a fast, opinionated UI.</p>
      <div className="cl-dialog-actions">
        <Link to="/calendar" className="btn primary">
          Open calendar
        </Link>
      </div>
    </div>
  ),
})