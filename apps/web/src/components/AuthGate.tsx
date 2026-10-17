import { Navigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useAuth } from '~/hooks/useAuth'

/**
 * Route guard for the account gate (XER-316): unauthenticated visitors are
 * redirected to /login, so the calendar and connection screens are never shown
 * to someone without an account.
 */
export function AuthGate({ children }: { children: ReactNode }): ReactNode {
  const auth = useAuth()
  if (auth.state === 'loading') return <div className="cl-empty">Loading…</div>
  if (auth.state === 'guest') return <Navigate to="/login" />
  return children
}