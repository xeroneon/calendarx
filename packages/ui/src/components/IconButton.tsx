import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'outline' | 'secondary'
  label: string
}

const iconStyle: CSSVarStyle = {
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--cx-radius-sm)',
  border: '1px solid transparent',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--cx-text-muted)',
  background: 'transparent',
  flexShrink: 0,
  transitionProperty: 'background-color, border-color, color, box-shadow',
  transitionDuration: 'var(--cx-dur-fast)',
  transitionTimingFunction: 'var(--cx-ease-in-out)',
}

const iconVariants: Record<NonNullable<IconButtonProps['variant']>, CSSVarStyle> = {
  ghost: { background: 'transparent' },
  outline: { background: 'var(--cx-surface)', borderColor: 'var(--cx-border)' },
  secondary: { background: 'var(--cx-surface-hover)' },
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { size = 'md', variant = 'ghost', label, className, style, children, ...rest },
    ref,
  ) {
    const dim = size === 'sm' ? 26 : 30
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn('cx-focus-visible', className)}
        style={{
          ...iconStyle,
          ...iconVariants[variant],
          width: dim,
          height: dim,
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    )
  },
)