import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import { useHotkey } from '../hooks/useHotkey.js'
import { cn } from '../lib.js'

export interface DialogProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Accessible title (labelled id). */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Close (X) button. Default true. */
  closeButton?: boolean
  width?: number
  children?: React.ReactNode
}

/**
 * Theme-aware modal dialog. Client-only: renders into a portal on
 * `document.body`; SSR renders nothing. Esc + overlay-click close, focus moves
 * to the panel on open and returns on close, body scroll is locked. Enter/exit
 * use the 150ms Linear motion curve.
 *
 * NOTE: the focus-trap hooks (useRef/useLayoutEffect) are invoked
 * unconditionally so the hook count is identical across renders regardless of
 * the `ready` flag — their effect bodies no-op until the panel is mounted.
 */
export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    open,
    defaultOpen = false,
    onOpenChange,
    title,
    description,
    closeButton = true,
    width = 420,
    className,
    style,
    children,
    ...rest
  },
  forwardedRef,
) {
  const [isOpen, setOpen] = useControllableState<boolean>({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
    name: 'Dialog.open',
  })
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    setReady(true)
  }, [])

  const close = React.useCallback(() => setOpen(false), [setOpen])
  useHotkey('Escape', close, { enabled: isOpen })

  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  // Invoked unconditionally (Rules of Hooks); the effect no-ops until ready.
  focusAndScrollTrap(panelRef, ready)

  if (!ready || typeof document === 'undefined') return null
  if (!isOpen) return null

  const refCallback = (node: HTMLDivElement | null) => {
    panelRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  return (
    <div className="cx-dialog-root">
      <div
        aria-hidden
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--cx-overlay)',
          zIndex: 'var(--cx-z-overlay)',
          animation: 'cx-fade 150ms var(--cx-ease-in-out)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        aria-describedby={description != null ? descId : undefined}
        ref={refCallback}
        tabIndex={-1}
        data-mounted
        className={cn('cx-focus-visible cx-font-sans', className)}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width,
          maxWidth: 'calc(100vw - var(--cx-sp-8))',
          zIndex: 'var(--cx-z-modal)',
          background: 'var(--cx-surface-raised)',
          color: 'var(--cx-text)',
          borderRadius: 'var(--cx-radius-lg)',
          border: '1px solid var(--cx-border)',
          boxShadow: 'var(--cx-elev-2)',
          animation: 'cx-pop 150ms var(--cx-ease-in-out)',
          ...style,
        }}
        {...rest}
      >
        {(title != null || closeButton) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--cx-sp-4)',
              padding: 'var(--cx-sp-4) var(--cx-sp-5)',
              borderBottom: '1px solid var(--cx-border)',
            }}
          >
            {title != null && (
              <div>
                <div id={titleId} style={{ fontWeight: 'var(--cx-weight-semibold)', fontSize: 'var(--cx-text-md)' }}>
                  {title}
                </div>
                {description != null && (
                  <div id={descId} style={{ fontSize: 'var(--cx-text-sm)', color: 'var(--cx-text-muted)', marginTop: 2 }}>
                    {description}
                  </div>
                )}
              </div>
            )}
            {closeButton && (
              <button
                type="button"
                aria-label="Close dialog"
                onClick={close}
                className="cx-focus-visible"
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--cx-text-muted)',
                  cursor: 'pointer',
                  width: 26,
                  height: 26,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--cx-radius-sm)',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div style={{ padding: 'var(--cx-sp-5)' }}>{children}</div>
      </div>
    </div>
  )
})

/**
 * Focus + scroll locking for an open dialog. Its hooks are called on every
 * render (see the Dialog body) but the effect only acts once `enabled` is
 * true — i.e. after the dialog panel has mounted on the client.
 */
function focusAndScrollTrap(panelRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const prevFocus = React.useRef<Element | null>(null)
  React.useLayoutEffect(() => {
    if (!enabled || typeof document === 'undefined' || !panelRef.current) return
    prevFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current.focus({ preventScroll: true })
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const node = panelRef.current
      const focusables = node?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
    }
  }, [enabled, panelRef])
  return null
}

/** Convenience hook for controlling a Dialog + its trigger together. */
export function useDialog(initial = false) {
  const [open, setOpen] = React.useState(initial)
  return { open, setOpen, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }
}