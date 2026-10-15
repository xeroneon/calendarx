import type { CSSProperties } from 'react'

/** Merge className parts, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ').trim()
}

export type CSSVar = { [key: `--${string}`]: string | number }

/** Cast a set of CSS custom-property overrides to a style object. */
export function vars(overrides: Record<string, string | number>): CSSVar {
  return overrides as CSSVar
}

export function px(n: number): string {
  return `${n}px`
}

export type CSSVarStyle = CSSProperties & CSSVar