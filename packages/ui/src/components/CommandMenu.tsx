import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import { useHotkey } from '../hooks/useHotkey.js'

export interface CommandItem {
  id: string
  label: string
  keywords?: string[]
  group?: string
  icon?: React.ReactNode
  hint?: string
  /** Value rendered in JetBrains Mono (shortcut / identifier). */
  monoHint?: string
  onSelect?: () => void
}

export interface CommandMenuProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  items: CommandItem[]
  placeholder?: string
  /** Hotkey that toggles the palette. Default `mod+k`. */
  shortcut?: string
  /** Header text shown above the non-empty results. */
  title?: string
  width?: number
  onSelectItem?: (item: CommandItem) => void
}

/**
 * The Command-K palette — Xeroneon Cloud's navigation/action/search hub.
 * Type-ahead filters, arrow keys navigate, Enter runs the active command, Esc
 * closes. Client-only (portal on demand); 150ms entrance.
 */
export const CommandMenu = React.forwardRef<HTMLDivElement, CommandMenuProps>(
  function CommandMenu(
    {
      open,
      defaultOpen = false,
      onOpenChange,
      items,
      placeholder = 'Type a command or search…',
      shortcut = 'mod+k',
      title,
      width = 560,
      onSelectItem,
    },
    ref,
  ) {
    const [isOpen, setOpen] = useControllableState<boolean>({
      value: open,
      defaultValue: defaultOpen,
      onChange: onOpenChange,
      name: 'CommandMenu.open',
    })
    const [ready, setReady] = React.useState(false)
    React.useEffect(() => setReady(true), [])

    const [query, setQuery] = React.useState('')
    const [active, setActive] = React.useState(0)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const itemRefs = React.useRef<Array<HTMLElement | null>>([])

    // Reset when opened.
    React.useEffect(() => {
      if (isOpen) {
        setQuery('')
        setActive(0)
        // focus the search field after the portal mounts
        const t = setTimeout(() => inputRef.current?.focus(), 0)
        return () => clearTimeout(t)
      }
    }, [isOpen])

    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase()
      if (!q) return items
      return items.filter((it) => {
        if (it.label.toLowerCase().includes(q)) return true
        return (it.keywords ?? []).some((k) => k.toLowerCase().includes(q))
      })
    }, [items, query])

    React.useEffect(() => setActive(0), [query])

    const run = (item: CommandItem | undefined) => {
      if (!item) return
      onSelectItem?.(item)
      item.onSelect?.()
      setOpen(false)
    }

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0))
          break
        case 'Enter':
          e.preventDefault()
          run(filtered[active])
          break
        case 'Tab':
          e.preventDefault()
          break
      }
    }

    const toggle = React.useCallback(() => setOpen(!isOpen), [isOpen, setOpen])
    useHotkey(shortcut, toggle, { enabled: ready })
    useHotkey('Escape', () => setOpen(false), {
      enabled: isOpen,
      preventWhenEditable: false,
    })

    if (!ready || typeof document === 'undefined') return null
    if (!isOpen) return null

    const groups: Record<string, CommandItem[]> = {}
    for (const it of filtered) (groups[it.group ?? ''] ??= []).push(it)
    const groupNames = Object.keys(groups)

    const listStyle: React.CSSProperties = {
      maxHeight: 380,
      overflowY: 'auto',
      padding: 'var(--cx-sp-1)',
      scrollbarWidth: 'thin',
    }

    return (
      <div className="cx-command" data-mount>
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--cx-overlay)',
            zIndex: 'var(--cx-z-overlay)',
            animation: 'cx-fade 150ms var(--cx-ease-in-out)',
          }}
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Command palette'}
          tabIndex={-1}
          className="cx-font-sans"
          style={{
            position: 'fixed',
            top: '14vh',
            left: '50%',
            transform: 'translateX(-50%)',
            width,
            maxWidth: 'calc(100vw - var(--cx-sp-8))',
            zIndex: 'var(--cx-z-modal)',
            background: 'var(--cx-surface-raised)',
            color: 'var(--cx-text)',
            borderRadius: 'var(--cx-radius-lg)',
            border: '1px solid var(--cx-border)',
            boxShadow: 'var(--cx-elev-2)',
            overflow: 'hidden',
            animation: 'cx-command-in 150ms var(--cx-ease-in-out)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--cx-sp-3)',
              padding: 'var(--cx-sp-2) var(--cx-sp-4)',
              borderBottom: '1px solid var(--cx-border)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="var(--cx-text-faint)" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="var(--cx-text-faint)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="cx-command-list"
            aria-activedescendant={filtered[active] ? `cx-cmd-${filtered[active].id}` : undefined}
            placeholder={placeholder}
            spellCheck={false}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--cx-text)',
              fontFamily: 'var(--cx-font-sans)',
              fontSize: 'var(--cx-text-md)',
              padding: 'var(--cx-sp-3) var(--cx-sp-4)',
            }}
          />
          <div id="cx-command-list" role="listbox" style={listStyle}>
            {filtered.length === 0 ? (
              <div style={{ padding: 'var(--cx-sp-6)', textAlign: 'center', color: 'var(--cx-text-faint)', fontSize: 'var(--cx-text-sm)' }}>
                No results for “{query}”
              </div>
            ) : (
              groupNames.map((g) => (
                <div key={g || 'ungrouped'}>
                  {g !== '' && (
                    <div
                      className="cx-font-mono"
                      style={{
                        fontSize: 'var(--cx-text-xs)',
                        textTransform: 'uppercase',
                        letterSpacing: 'var(--cx-track-wide)',
                        color: 'var(--cx-text-faint)',
                        padding: 'var(--cx-sp-2) var(--cx-sp-3) var(--cx-sp-1)',
                      }}
                    >
                      {g}
                    </div>
                  )}
                  {groupIndexed(groups[g] ?? [], filtered, active, setActive, run, itemRefs)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  },
)

function groupIndexed(
  group: CommandItem[],
  filtered: CommandItem[],
  active: number,
  setActive: (a: number) => void,
  run: (item: CommandItem) => void,
  itemRefs: React.MutableRefObject<Array<HTMLElement | null>>,
): React.ReactNode {
  // Offset is the global index of the first item of this group within filtered.
  const first = group[0]
  const start = first !== undefined ? filtered.indexOf(first) : 0
  return group.map((it, li) => {
    const globalIndex = start + li
    const isActive = active === globalIndex
    return (
      <button
        key={it.id}
        id={`cx-cmd-${it.id}`}
        ref={(n) => {
          itemRefs.current[globalIndex] = n
          if (isActive) n?.scrollIntoView({ block: 'nearest' })
        }}
        role="option"
        aria-selected={isActive}
        data-mount
        onMouseMove={() => setActive(globalIndex)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => run(it)}
        className="cx-font-sans"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--cx-sp-3)',
          width: '100%',
          textAlign: 'left',
          padding: 'var(--cx-sp-2) var(--cx-sp-3)',
          borderRadius: 'var(--cx-radius-sm)',
          border: 'none',
          background: isActive ? 'var(--cx-surface-hover)' : 'transparent',
          color: 'var(--cx-text)',
          fontSize: 'var(--cx-text-sm)',
          cursor: 'pointer',
        }}
      >
        {it.icon != null && (
          <span style={{ display: 'inline-flex', color: 'var(--cx-text-muted)' }} aria-hidden>
            {it.icon}
          </span>
        )}
        <span style={{ flex: 1 }}>{it.label}</span>
        {it.monoHint != null ? (
          <kbd className="cx-kbd" style={{ color: 'var(--cx-text-faint)' }}>
            {it.monoHint}
          </kbd>
        ) : it.hint != null ? (
          <span style={{ fontSize: 'var(--cx-text-xs)', color: 'var(--cx-text-faint)' }}>{it.hint}</span>
        ) : null}
      </button>
    )
  })
}

export { CommandMenu as CommandPalette }