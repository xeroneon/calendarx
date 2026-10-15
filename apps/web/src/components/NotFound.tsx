import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="card column">
      <h2>Page not found</h2>
      <p className="muted">The page you are looking for does not exist.</p>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => window.history.back()}>
          Go back
        </button>
        <Link to="/" className="btn">
          Start over
        </Link>
      </div>
    </div>
  )
}