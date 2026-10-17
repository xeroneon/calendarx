/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useNavigate,
} from '@tanstack/react-router'
import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { useAuth } from '~/hooks/useAuth'
import { logout } from '~/server/auth'
import appCss from '~/styles/app.css?url'
import calendarCss from '~/styles/calendar.css?url'
import uiTokens from '@calendarx/ui/tokens.css?url'
import { seo } from '~/utils/seo'
import { Button } from '@calendarx/ui'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'CalendarX',
        description: 'Your CalDAV calendar + tasks — self-hosted, open-source.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: uiTokens },
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: calendarCss },
    ],
  }),
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error, reset }) => <DefaultCatchBoundary error={error} reset={reset} />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className='cl-app'>
          <BrandBar />
          <main className='cl-main'>
            <React.Suspense fallback={<div className='cl-empty'>Loading…</div>}>
              {children}
            </React.Suspense>
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function BrandBar(): React.ReactElement {
  const auth = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const signOut = useMutation({
    mutationFn: () => logout({ data: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth'] })
      await qc.invalidateQueries({ queryKey: ['connections'] })
      await navigate({ to: '/login' })
    },
  })
  const authed = auth.state === 'authed'
  return (
    <header className='cl-brandbar'>
      <Link to={authed ? '/' : '/login'} className='cl-brand'>
        CalendarX
      </Link>
      <nav className='cl-brandnav'>
        {authed ? (
          <>
            <Link to='/calendar' className='cl-brandlink'>
              Calendar
            </Link>
            <Link to='/connect' className='cl-brandlink'>
              Connection
            </Link>
            <span className='cl-auth-email'>{auth.user.email}</span>
            <Button size='sm' variant='ghost' onClick={() => signOut.mutate()} disabled={signOut.isPending}>
              {signOut.isPending ? '…' : 'Sign out'}
            </Button>
          </>
        ) : (
          <Link to='/login' className='cl-brandlink'>
            Sign in
          </Link>
        )}
      </nav>
    </header>
  )
}