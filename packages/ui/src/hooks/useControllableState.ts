import * as React from 'react'

/**
 * Controlled-or-uncontrolled state with useSyncExternalStore-safe setters
 * (mirrors Radix/Reach behavior without the dependency).
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
  name = 'value',
}: {
  value?: T
  defaultValue: T
  onChange?: (value: T) => void
  name?: string
}): [T, (next: T | ((prev: T) => T)) => void] {
  const [internal, setInternal] = React.useState<T>(defaultValue)

  const isControlled = value !== undefined
  const current = isControlled ? (value as T) : internal

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(current) : next
      if (current === resolved) return
      if (!isControlled) setInternal(resolved)
      onChange?.(resolved)
    },
    [current, isControlled, onChange],
  )

  if (process.env.NODE_ENV !== 'production') {
    // Warn when switching between controlled/uncontrolled at runtime.
    React.useEffect(() => {
      if (isControlled !== (value !== undefined)) {
        console.warn(
          `${name} cannot switch from controlled to uncontrolled (or vice-versa).`,
        )
      }
    }, [isControlled])
  }

  return [current, setValue]
}