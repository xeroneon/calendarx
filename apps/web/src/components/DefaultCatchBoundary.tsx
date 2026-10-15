import { ErrorComponent, Link, useLocation, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useLocation({ select: (location) => location.pathname === '/' })

  console.error(error)

  return (
    <div className="card column">
      <h2>Something went wrong</h2>
      <ErrorComponent error={error} />
      <div className="row">
        <button type="button" className="btn" onClick={() => { reset(); void router.invalidate() }}>
          Try again
        </button>
        {isRoot ? (
          <Link to="/" className="btn ghost">
            Home
          </Link>
        ) : (
          <Link to="/" className="btn ghost" onClick={(e) => { e.preventDefault(); window.history.back() }}>
            Go back
          </Link>
        )}
      </div>
    </div>
  )
}