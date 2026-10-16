/// <reference types="vite/client" />
import { Link, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import calendarCss from '~/styles/calendar.css?url'
import uiTokens from '@calendarx/ui/tokens.css?url'
import { seo } from '~/utils/seo'

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
  component: () => (
    <div className="cl-app">
      <header className="cl-brandbar">
        <Link to="/" className="cl-brand">
          CalendarX
        </Link>
        <nav className="cl-brandnav">
          <Link to="/calendar" className="cl-brandlink">
            Calendar
          </Link>
          <Link to="/connect" className="cl-brandlink">
            Connection
          </Link>
        </nav>
      </header>
      <main className="cl-main">
        <React.Suspense fallback={<div className="cl-empty">Loading…</div>}>
          <Outlet />
        </React.Suspense>
      </main>
      <Scripts />
    </div>
  ),
})