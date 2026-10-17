import { useQuery } from '@tanstack/react-query'
import type { AuthUser } from '~/server/auth'
import { me } from '~/server/auth'

export type AuthState =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'authed'; user: AuthUser }

/**
 * The signed-in account (XER-316 account gate). `guest` when there is no
 * session; used by the route gate to redirect unauthenticated visitors to the
 * login screen and to show the account in the brandbar.
 */
export function useAuth(): AuthState {
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me({ data: {} }),
    retry: false,
  })
  if (query.isLoading) return { state: 'loading' }
  const user = query.data?.user ?? null
  return user ? { state: 'authed', user } : { state: 'guest' }
}