import { Link, createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/components/AuthGate'
import { useConnectionStatus } from '~/hooks/useConnectionStatus'

export const Route = createFileRoute('/')({
  component: () => (
    <AuthGate>
      <Welcome />
    </AuthGate>
  ),
})

function Welcome(): React.ReactElement {
  const status = useConnectionStatus()
  const connected = status.state === 'connected'
  return (
    <div className="cl-welcome">
      <h1>CalendarX</h1>
      <p className="cl-muted">Your CalDAV calendar + tasks, in a fast, opinionated UI.</p>
      <div className="cl-dialog-actions">
        {connected ? (
          <Link to="/calendar" className="btn primary">
            Open calendar
          </Link>
        ) : status.state === 'empty' ? (
          <Link to="/connect" className="btn primary">
            Connect your CalDAV server
          </Link>
        ) : (
          <span className="btn primary" aria-disabled>
            Loading…
          </span>
        )}
      </div>
    </div>
  )
}