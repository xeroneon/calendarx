import { useQuery } from '@tanstack/react-query'
import type { CalDavConnection } from '@calendarx/sdk'
import { authCall } from '~/lib/auth-call'
import { listConnections } from '~/server/connections'

export type ConnectionStatus =
  | { state: 'loading' }
  | { state: 'connected'; connection: CalDavConnection }
  | { state: 'empty' }

/**
 * Whether the app has a saved CalDAV connection. Used by the first-run gate so
 * unconfigured users hit the "add your CalDAV server" screen instead of an
 * empty calendar, and by the /connect screen to show the active connection.
 */
export function useConnectionStatus(): ConnectionStatus {
  const query = useQuery({
    queryKey: ['connections', 'list'],
    queryFn: () => authCall(() => listConnections({ data: {} })),
  })
  if (query.isLoading) return { state: 'loading' }
  const conns = query.data ?? []
  const active = conns[0]
  if (!active) return { state: 'empty' }
  return { state: 'connected', connection: active }
}