import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useHotkey } from '../hooks/useHotkey.js'
import { cn } from '../lib.js'
import { IconButton } from './IconButton.js'

/**
 * @calendax/ui — Sidebar
 *
 * The app-shell navigation rail, ported from shadcn's sidebar/drawer pattern
 * and adapted onto the XER-74 Linear tokens (`--cx-*`). Two modes driven by a
 * single media query:
 *
 * - Desktop (>= `railQuery`): the `aside` is a persistent fixed left rail.
 *   The mobile top bar (hamburger) is hidden; give the rail a home by reflowing
 *   the main `.shell` beside it (e.g. `margin-left: var(--cx-sidebar-width)`).
 * - Mobile (< `railQuery`): the `aside` is an off-canvas drawer, translated
 *   off-screen by default (starts CLOSED per XER-216 Q4), slid in by the
 *   hamburger in a slim top bar, with a backdrop overlay. Nav never wraps.
 *
 * Keyboard-accessible: the hamburger toggles via `aria-expanded`/
 * `aria-controls`, the drawer closes on Escape, and the drawer is `aria-hidden`
 * when off-canvas.
 *
 *   <Sidebar ariaLabel="Main navigation" asideId="app-nav" brand="Xeroneon Cloud">
 *     <nav>…nav links…</nav>
 *   </Sidebar>
 */

export interface SidebarProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Media query that switches the sidebar to a persistent desktop rail. */
  railQuery?: string
  asideId?: string
  ariaLabel: string
  /** Brand shown in the desktop rail and the mobile top bar. */
  brand: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function Sidebar({
  open,
  defaultOpen = false,
  onOpenChange,
  railQuery = '(min-width: 768px)',
  asideId,
  ariaLabel,
  brand,
  className,
  children,
}: SidebarProps) {
  const [isOpen, setOpen] = useControllableState<boolean>({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
    name: 'Sidebar.open',
  })
  const isRail = useMediaQuery(railQuery)

  // Mobile drawer: close on Escape; on desktop the rail is always open.
  useHotkey('Escape', () => setOpen(false), { enabled: !isRail && isOpen })

  // Off-canvas unless it's a desktop rail or an open mobile drawer.
  const exposed = isRail || isOpen

  return (
    <>
      {/* Slim mobile top bar: hamburger + brand. Hidden on the desktop rail. */}
      <div
        className="cx-sidebar__topbar"
        data-cx-sidebar-rail={isRail || undefined}
      >
        <IconButton
          label={`Open ${ariaLabel}`}
          variant="ghost"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-controls={asideId}
          onClick={() => setOpen(!isOpen)}
          className="cx-sidebar__hamburger"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--cx-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M2 3.5h12" />
            <path d="M2 8h12" />
            <path d="M2 12.5h12" />
          </svg>
        </IconButton>
        <span className="cx-sidebar__topbar-brand">{brand}</span>
      </div>

      <aside
        id={asideId}
        aria-label={ariaLabel}
        data-cx-sidebar-rail={isRail || undefined}
        data-cx-sidebar-open={(!isRail && isOpen) || undefined}
        aria-hidden={exposed ? undefined : true}
        // Mobile drawer: tapping a nav link (or the brand) navigates AND closes
        // the off-canvas drawer — mirrors Linear. Desktop rail is unaffected.
        onClick={(e) => {
          if (!isRail && (e.target as Element | null)?.closest?.('a[href]')) {
            setOpen(false)
          }
        }}
        className={cn('cx-sidebar', className)}
      >
        <div className="cx-sidebar__content">
          <div className="cx-sidebar__brand">{brand}</div>
          {children}
        </div>
      </aside>

      {!isRail && isOpen && (
        <div
          className="cx-sidebar__backdrop"
          data-cx-sidebar-backdrop
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}