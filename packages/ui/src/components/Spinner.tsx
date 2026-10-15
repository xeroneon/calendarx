import * as React from 'react'
import { cn } from '../lib.js'

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number
  /** Contrast with the surface behind — for use inside buttons/overlays. */
  light?: boolean
}

/** Themed inline spinner (pure SVG, 150ms motion). */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 16, light = false, className, style, 'aria-label': ariaLabel = 'Loading', ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      role="status"
      aria-label={ariaLabel}
      className={cn(className)}
      style={{ display: 'inline-flex', flexShrink: 0, ...style }}
      {...rest}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          animation: 'cx-spin 750ms linear infinite',
          transformOrigin: 'center',
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={light ? 'rgba(255,255,255,0.25)' : 'var(--cx-border-strong)'}
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke={light ? '#fff' : 'var(--cx-accent-500)'}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
})

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Height in px. */
  height?: number
  width?: number | string
}

/** Soft placeholder block for content that's still loading. */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { height = 12, width = '100%', className, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(className)}
      style={{
        height,
        width,
        borderRadius: 'var(--cx-radius-sm)',
        background: 'var(--cx-surface-hover)',
        animation: 'cx-pulse 1200ms var(--cx-ease-in-out) infinite',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    />
  )
})