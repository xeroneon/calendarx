import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import { useHotkey } from '../hooks/useHotkey.js'
import { useListNavigation } from '../hooks/useListNavigation.js'
import { cn } from '../lib.js'

interface MenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  onItemSelect: (index: number) => void
  ordered: Array<{ index: number; label: string }>
  registerLabel: (index: number) => (label: string) => void
  closeOnSelect: boolean
  onSelect?: (index: number, label?: string) => void
  activeIndex: number
  setActiveIndex: (index: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
  align: 'start' | 'end'
  /** Which way the menu opens from its trigger: below (default) or above. */
  side: 'bottom' | 'top'
  allocateIndex: () => number
}

const MenuContext = React.createContext<MenuContextValue | null>(null)

function useMenu(): MenuContextValue {
  const ctx = React.useContext(MenuContext)
  if (!ctx) throw new Error('Menu components must be used within <Menu>.')
  return ctx
}

export interface MenuProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  closeOnSelect?: boolean
  onSelect?: (index: number, label?: string) => void
  children: React.ReactNode
  className?: string
  align?: 'start' | 'end'
  /** Which way the menu opens from its trigger: below (default) or above. */
  side?: 'bottom' | 'top'
}

export function Menu({
  open,
  defaultOpen = false,
  onOpenChange,
  closeOnSelect = true,
  onSelect,
  children,
  className,
  align = 'start',
  side = 'bottom',
}: MenuProps) {
  const [isOpen, setOpen] = useControllableState<boolean>({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
    name: 'Menu.open',
  })
  const [ordered, setOrdered] = React.useState<Array<{ index: number; label: string }>>([])
  const nextIndex = React.useRef(0)
  const allocateIndex = React.useCallback(() => nextIndex.current++, [])

  const nav = useListNavigation({
    length: ordered.length,
    enabled: isOpen,
    onSelect: (index) => {
      if (closeOnSelect) setOpen(false)
      onSelect?.(index, ordered[index]?.label)
    },
  })

  const registerLabel = React.useCallback(
    (index: number) => (label: string) =>
      setOrdered((prev) => {
        const existing = prev.find((o) => o.index === index)
        if (existing && existing.label === label) return prev
        return [...prev.filter((o) => o.index !== index), { index, label }].sort(
          (a, b) => a.index - b.index,
        )
      }),
    [],
  )
  const labelGetter = React.useCallback(() => ordered.map((o) => o.label), [ordered])
  nav.registerTypeAhead?.(labelGetter)

  const handleItemSelect = (index: number) => {
    if (closeOnSelect) setOpen(false)
    onSelect?.(index, ordered[index]?.label)
  }

  // Close on outside click (client only); deferred so the opening click isn't caught.
  React.useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest('[data-cx-menu]')) setOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [isOpen, setOpen])

  useHotkey('Escape', () => setOpen(false), { enabled: isOpen })

  const value: MenuContextValue = {
    open: isOpen,
    setOpen,
    onItemSelect: handleItemSelect,
    ordered,
    registerLabel,
    closeOnSelect,
    onSelect,
    activeIndex: nav.activeIndex,
    setActiveIndex: nav.setActiveIndex,
    onKeyDown: nav.onKeyDown,
    align,
    side,
    allocateIndex,
  }

  return (
    <MenuContext.Provider value={value}>
      <div className={cn('cx-menu', className)} data-cx-menu style={{ position: 'relative', display: 'inline-flex' }}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}

export function MenuContent({
  children,
  label,
}: {
  children: React.ReactNode
  /** Optional widescreen label shown at the top of the panel. */
  label?: string
}) {
  const ctx = useMenu()
  if (!ctx.open) return null
  const a = ctx.align
  const s = ctx.side
  return React.createElement(
    'div',
    {
      role: 'menu',
      'data-mount': '',
      className: 'cx-menu__content cx-font-sans',
      onKeyDown: ctx.onKeyDown,
      style: {
        position: 'absolute',
        ...(s === 'top' ? { bottom: 'calc(100% + 4px)', top: 'auto' } : { top: 'calc(100% + 4px)', bottom: 'auto' }),
        ...(a === 'end' ? { right: 0 } : { left: 0 }),
        zIndex: 'var(--cx-z-dropdown)',
        minWidth: 200,
        maxWidth: 280,
        background: 'var(--cx-surface-raised)',
        color: 'var(--cx-text)',
        borderRadius: 'var(--cx-radius-md)',
        border: '1px solid var(--cx-border)',
        boxShadow: 'var(--cx-elev-1)',
        padding: 'var(--cx-sp-1)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'cx-fade 120ms var(--cx-ease-in-out)',
      },
    },
    label != null ? React.createElement(MenuLabel, null, label) : null,
    children,
  )
}

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  /** Keyboard-navigation index (ordinal among MenuItems). */
  index?: number
  destructive?: boolean
  onSelect?: () => void
}

export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { label, index, destructive, onSelect, className, style, children, disabled, ...rest },
  ref,
) {
  const ctx = useMenu()
  // Stable index: use explicit `index` when given, else allocate an ordinal.
  const [assigned] = React.useState<number>(() => index ?? ctx.allocateIndex())
  React.useEffect(() => {
    ctx.registerLabel(assigned)(label)
  }, [assigned, label, ctx])
  const active = ctx.activeIndex === assigned
  return (
    <button
      ref={ref}
      role="menuitem"
      type="button"
      disabled={disabled}
      tabIndex={active ? 0 : -1}
      data-label={label}
      aria-current={active || undefined}
      onPointerEnter={() => !disabled && ctx.setActiveIndex(assigned)}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        onSelect?.()
        ctx.onItemSelect(assigned)
      }}
      className={cn('cx-focus-visible', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--cx-sp-3)',
        width: '100%',
        textAlign: 'left',
        padding: 'var(--cx-sp-2) var(--cx-sp-3)',
        borderRadius: 'var(--cx-radius-sm)',
        border: 'none',
        background: active ? 'var(--cx-surface-hover)' : 'transparent',
        color: destructive ? 'var(--cx-danger)' : 'var(--cx-text)',
        fontFamily: 'var(--cx-font-sans)',
        fontSize: 'var(--cx-text-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      {children ?? label}
    </button>
  )
})

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="presentation"
      className="cx-font-mono"
      style={{
        fontSize: 'var(--cx-text-xs)',
        fontWeight: 'var(--cx-weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--cx-track-wide)',
        color: 'var(--cx-text-faint)',
        padding: 'var(--cx-sp-2) var(--cx-sp-3) var(--cx-sp-1)',
      }}
    >
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return (
    <div
      role="separator"
      style={{ height: 1, background: 'var(--cx-border)', margin: 'var(--cx-sp-1) 0' }}
    />
  )
}

export function MenuTrigger({
  children,
}: {
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>
}) {
  const ctx = useMenu()
  const child = React.Children.only(children)
  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      child.props.onClick?.(e)
      ctx.setOpen(!ctx.open)
    },
    'aria-expanded': ctx.open,
    'aria-haspopup': 'menu' as const,
  })
}