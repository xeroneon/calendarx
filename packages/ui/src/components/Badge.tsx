import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'
import { shadeFromSeed, tokens } from '../tokens.js'

export type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Render with a mono font (for identifiers, IDs, keys). */
  mono?: boolean
}

const toneStyle: Record<BadgeTone, CSSVarStyle> = {
  accent: {
    color: 'var(--cx-accent-600)',
    background: 'var(--cx-accent-50)',
    borderColor: 'var(--cx-accent-200)',
  },
  neutral: {
    color: 'var(--cx-text-muted)',
    background: 'var(--cx-surface-hover)',
    borderColor: 'var(--cx-border)',
  },
  success: {
    color: 'var(--cx-success)',
    background: 'color-mix(in srgb, var(--cx-success) 12%, var(--cx-surface))',
    borderColor: 'color-mix(in srgb, var(--cx-success) 30%, var(--cx-border))',
  },
  warning: {
    color: 'var(--cx-warning)',
    background: 'color-mix(in srgb, var(--cx-warning) 14%, var(--cx-surface))',
    borderColor: 'color-mix(in srgb, var(--cx-warning) 30%, var(--cx-border))',
  },
  danger: {
    color: 'var(--cx-danger)',
    background: 'color-mix(in srgb, var(--cx-danger) 10%, var(--cx-surface))',
    borderColor: 'color-mix(in srgb, var(--cx-danger) 28%, var(--cx-border))',
  },
}

const badgeBase: CSSVarStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--cx-sp-1)',
  height: 20,
  padding: '0 var(--cx-sp-2)',
  borderRadius: 'var(--cx-radius-sm)',
  border: '1px solid',
  fontSize: 'var(--cx-text-xs)',
  fontWeight: 'var(--cx-weight-medium)',
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', mono = false, className, style, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(mono && 'cx-font-mono', className)}
      style={{ ...badgeBase, ...toneStyle[tone], ...style }}
      {...rest}
    >
      {children}
    </span>
  )
})

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Seed for the deterministic accent hue. Defaults to the label. */
  seed?: string
  label: string
  size?: number
}

/** Deterministically-colored avatar (Linear/user-chips style). */
export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { seed, label, size = 24, className, style, ...rest },
  ref,
) {
  const color = shadeFromSeed(seed ?? label)
  const bg = color === tokens.accent[300] ? tokens.accent[600] : color
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn('cx-font-sans', className)}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--cx-radius-full)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: '#ffffff',
        fontSize: Math.max(10, Math.round(size * 0.4)),
        fontWeight: 'var(--cx-weight-semibold)',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {initials}
    </div>
  )
})