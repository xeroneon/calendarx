import * as React from 'react'

/** Reactive `matchMedia` hook. Returns a fresh boolean when it changes. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  const getServerSnapshot = () => serverValue

  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    getSnapshot,
    getServerSnapshot,
  )
}

/** Convenience: is the theme light (OS preference)? */
export function usePrefersDark(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)')
}