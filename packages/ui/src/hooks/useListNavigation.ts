import * as React from 'react'

/**
 * Keyboard-first list navigation (roving tabindex). Provides ArrowUp/Down,
 * Home/End and type-ahead over navigable items. Attach `onKeyDown` to the
 * container; mark the active item via `activeIndex`. Type-ahead reads
 * `data-label` attributes off the container's `[data-option]` children so no
 * shared registry is needed.
 */
export interface UseListNavigationOptions {
  length: number
  enabled?: boolean
  orientation?: 'vertical' | 'horizontal'
  loop?: boolean
  onSelect?: (index: number) => void
}

export function useListNavigation({
  length,
  enabled = true,
  orientation = 'vertical',
  loop = true,
  onSelect,
}: UseListNavigationOptions): {
  activeIndex: number
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
  registerTypeAhead: (getter: () => string[]) => void
} {
  const [activeIndex, setActiveIndex] = React.useState<number>(-1)
  const lengthRef = React.useRef(length)
  lengthRef.current = length
  const selectRef = React.useRef(onSelect)
  selectRef.current = onSelect

  const move = (dir: 1 | -1) =>
    setActiveIndex((cur) => {
      const n = lengthRef.current
      if (n === 0) return -1
      if (cur === -1) return dir === 1 ? 0 : n - 1
      let next = cur + dir
      next = loop ? (next + n) % n : Math.max(0, Math.min(n - 1, next))
      return next
    })

  const labels = React.useRef<(() => string[]) | undefined>(undefined)
  const registerTypeAhead = React.useCallback((getter: () => string[]) => {
    labels.current = getter
  }, [])

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled || !(e.target instanceof HTMLElement) || isEditable(e.target)) return
      const isHorizontal = orientation === 'horizontal'
      switch (e.key) {
        case 'ArrowDown':
          if (!isHorizontal) {
            e.preventDefault()
            move(1)
          }
          break
        case 'ArrowRight':
          if (isHorizontal) {
            e.preventDefault()
            move(1)
          }
          break
        case 'ArrowUp':
          if (!isHorizontal) {
            e.preventDefault()
            move(-1)
          }
          break
        case 'ArrowLeft':
          if (isHorizontal) {
            e.preventDefault()
            move(-1)
          }
          break
        case 'Home':
        case 'End':
          e.preventDefault()
          setActiveIndex(e.key === 'Home' ? 0 : lengthRef.current - 1)
          break
        case 'Enter':
        case ' ':
          if (activeIndex >= 0 && lengthRef.current > activeIndex) {
            e.preventDefault()
            selectRef.current?.(activeIndex)
          }
          break
        default: {
          if (e.key.length === 1) {
            e.preventDefault()
            const list = labels.current?.() ?? []
            for (let i = 0; i < list.length; i++) {
              if (list[i]?.toLowerCase().startsWith(e.key.toLowerCase())) {
                setActiveIndex(i)
                break
              }
            }
          }
        }
      }
    },
    [enabled, move, orientation, activeIndex],
  )

  return { activeIndex, setActiveIndex, onKeyDown, registerTypeAhead }
}

function isEditable(target: HTMLElement): boolean {
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}