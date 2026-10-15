import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md'
  /** Show a busy state and disable the button. */
  loading?: boolean
  asChild?: never
}

const base: CSSVarStyle = {
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--cx-sp-2)',
  fontWeight: 'var(--cx-weight-medium)',
  fontFamily: 'var(--cx-font-sans)',
  borderRadius: 'var(--cx-radius-md)',
  border: '1px solid transparent',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  transitionProperty: 'background-color, border-color, color, box-shadow',
  transitionDuration: 'var(--cx-dur-fast)',
  transitionTimingFunction: 'var(--cx-ease-in-out)',
}

const sizeStyle: Record<NonNullable<ButtonProps['size']>, CSSVarStyle> = {
  sm: {
    height: 28,
    padding: '0 var(--cx-sp-3)',
    fontSize: 'var(--cx-text-sm)',
    lineHeight: 'var(--cx-lh-sm)',
    borderRadius: 'var(--cx-radius-sm)',
  },
  md: {
    height: 32,
    padding: '0 var(--cx-sp-4)',
    fontSize: 'var(--cx-text-md)',
    lineHeight: 'var(--cx-lh-md)',
  },
}

const variantStyle: Record<NonNullable<ButtonProps['variant']>, CSSVarStyle> = {
  primary: {
    background: 'var(--cx-accent-600)',
    color: 'var(--cx-text-inverse)',
    borderColor: 'var(--cx-accent-600)',
  },
  secondary: {
    background: 'var(--cx-surface)',
    color: 'var(--cx-text)',
    borderColor: 'var(--cx-border)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--cx-text)',
    borderColor: 'var(--cx-border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--cx-text-muted)',
    borderColor: 'transparent',
  },
  danger: {
    background: 'var(--cx-danger)',
    color: 'var(--cx-danger-fg)',
    borderColor: 'var(--cx-danger)',
  },
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled,
    className,
    style,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('cx-focus-visible', className)}
      style={{ ...base, ...sizeStyle[size], ...variantStyle[variant], ...style }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  )
})