/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/react-router'
import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { Avatar, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Sidebar } from '@calendarx/ui'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { useAuth } from '~/hooks/useAuth'
import { useNativeApp } from '~/hooks/useNativeApp'
import { logout } from '~/server/auth'
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
  component: RootComponent,
})

/** The app destinations shared by the sidebar and (in future) a command palette. */
const NAV = [
  { to: '/', label: 'Home', exact: true },
  { to: '/calendar', label: 'Calendar', exact: false },
  { to: '/connect', label: 'Connection', exact: false },
]

function RootComponent() {
  const location = useLocation()
  const auth = useAuth()
  const qc = useQueryClient()
  const authed = auth.state === 'authed'
  // In the Capacitor/Android app the server-side connection is invisible, so
  // the Connection nav entry is omitted (XER-320).
  const nativeApp = useNativeApp()

  const signOut = useMutation({
    mutationFn: () => logout({ data: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth'] })
      await qc.invalidateQueries({ queryKey: ['connections'] })
    },
  })

  // Clean, chrome-free surface for the auth screen (login).
  const authPage = location.pathname === '/login'

  return (
    <RootDocument showNav={!authPage} nativeApp={nativeApp} onLogout={() => signOut.mutate()} authed={authed} user={auth.state === 'authed' ? auth.user : undefined} signOutPending={signOut.isPending}>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({
  children,
  showNav,
  nativeApp,
  onLogout,
  authed,
  user,
  signOutPending,
}: {
  children: React.ReactNode
  showNav?: boolean
  nativeApp?: boolean
  onLogout?: () => void
  authed?: boolean
  user?: { id: string; email: string }
  signOutPending?: boolean
}) {
  // Native (Capacitor) users don't manage the CalDAV connection on-device —
  // it lives on their account server-side — so the Connection entry is hidden.
  const navLinks = NAV.filter((n) => !(nativeApp && n.to === '/connect')).map((n) => (
    <Link
      key={n.to}
      to={n.to}
      activeOptions={{ exact: n.exact }}
      activeProps={{ className: 'sidebar-link active' }}
      className="sidebar-link"
    >
      {n.label}
    </Link>
  ))

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {showNav && (
          <Sidebar ariaLabel="Main navigation" asideId="app-sidebar" brand={<Link to="/" activeOptions={{ exact: true }}>CalendarX</Link>}>
            <nav className="sidebar-nav" aria-label="Main navigation">
              {navLinks}
            </nav>
            <div className="sidebar-footer">
              {authed && user && onLogout && (
                <ProfileMenu email={user.email} onLogout={onLogout} signOutPending={signOutPending} />
              )}
            </div>
          </Sidebar>
        )}
        <main className={showNav ? 'cl-main' : 'cl-shell-auth'}>
          <React.Suspense fallback={<div className="cl-empty">Loading…</div>}>
            {children}
          </React.Suspense>
        </main>
        <Scripts />
      </body>
    </html>
  )
}

/** Profile avatar + anchored account menu in the sidebar footer (mirrors cloud XER-218). */
function ProfileMenu({
  email,
  onLogout,
  signOutPending,
}: {
  email: string
  onLogout: () => void
  signOutPending?: boolean
}) {
  const name = email.split('@')[0] || email
  return (
    <Menu align="end" side="top">
      <MenuTrigger>
        <button
          type="button"
          className="profile-trigger"
          aria-label={`Account menu for ${name}`}
          aria-haspopup="menu"
        >
          <Avatar label={name} size={22} seed={email} />
        </button>
      </MenuTrigger>
      <MenuContent label={name}>
        <div className="profile-menu__email">{email}</div>
        <MenuSeparator />
        <MenuItem label="Log out" destructive onSelect={onLogout}>
          {signOutPending ? '…' : 'Log out'}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}