import * as React from 'react'

/**
 * Keyboard-first primitive: run `handler` when a chord (e.g. `mod+k`, `j`,
 * `shift+?`) is pressed while the target (default document) is focused and no
 * editable field is focused. `mod` = meta on macOS, ctrl elsewhere.
 *
 * SSR-safe: no-ops when `window` is unavailable.
 */
export type HotkeyChord =
  | `${'' | 'mod+' | 'ctrl+' | 'alt+' | 'shift+' | 'mod+shift+'}${string}`
  | string

export interface UseHotkeyOptions {
  enabled?: boolean
  target?: React.RefObject<HTMLElement | null> | HTMLElement | null
  /** Suppress the handler when an editable field has focus. Default true. */
  preventWhenEditable?: boolean
}

interface ParsedChord {
  key: string
  mod: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const isMacMod = (e: KeyboardEvent) => (MAC ? e.metaKey : e.ctrlKey)

function parseChord(spec: string): ParsedChord {
  const parts = spec.toLowerCase().trim().split('+')
  const last = parts[parts.length - 1] ?? ''
  const mods = parts.slice(0, -1)
  const parsed: ParsedChord = { key: last, mod: false, ctrl: false, alt: false, shift: false }
  if (mods.includes('mod')) parsed.mod = true
  if (mods.includes('ctrl')) parsed.ctrl = true
  if (mods.includes('alt')) parsed.alt = true
  if (mods.includes('shift')) parsed.shift = true
  return parsed
}

function chordMatches(e: KeyboardEvent, spec: string): boolean {
  const chord = parseChord(spec)
  const eventKey = e.key.toLowerCase()
  const code = e.code?.toLowerCase() ?? ''
  const keyTarget = chord.key

  // Match by key name first, then by physical code for arrow/space keys.
  const keyOk = eventKey === keyTarget || code === keyTarget || eventKey === code
  if (!keyOk) return false

  const wantCtrl = chord.ctrl || chord.mod
  const ctrlOk = wantCtrl ? e.ctrlKey || e.metaKey : !e.ctrlKey
  if (!ctrlOk) return false
  if (chord.mod && wantCtrl && !isMacMod(e)) return false
  if (chord.ctrl && !e.ctrlKey) return false
  if (chord.alt !== e.altKey) return false
  if (chord.shift !== e.shiftKey) return false
  return true
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function useHotkey(
  chords: HotkeyChord | readonly HotkeyChord[],
  handler: (e: KeyboardEvent) => void,
  { enabled = true, target, preventWhenEditable = true }: UseHotkeyOptions = {},
): void {
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler
  const list = (Array.isArray(chords) ? chords : [chords]).map((c) => c.toLowerCase())

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const el = target && 'current' in target ? (target.current ?? null) : (target ?? document)
    if (!el) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (preventWhenEditable && isEditable(e.target)) return
      if (list.some((c) => chordMatches(e, c))) {
        e.preventDefault()
        handlerRef.current(e)
      }
    }
    el.addEventListener('keydown', onKeyDown as EventListener)
    return () => el.removeEventListener('keydown', onKeyDown as EventListener)
  }, [enabled, target, preventWhenEditable, list.join('|')])
}