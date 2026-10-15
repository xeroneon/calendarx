import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md'
}

const selectStyle: CSSVarStyle = {
  boxSizing: 'border-box',
  appearance: 'none',
  background: 'var(--cx-surface)',
  color: 'var(--cx-text)',
  border: '1px solid var(--cx-border-strong)',
  borderRadius: 'var(--cx-radius-md)',
  fontFamily: 'var(--cx-font-sans)',
  fontSize: 'var(--cx-text-md)',
  cursor: 'pointer',
  paddingRight: 28,
  backgroundImage:
    'url("data:image/svg+xml;charset=utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 16 16%27%3E%3Cpath fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%271.5%27 d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  transitionProperty: 'border-color, box-shadow',
  transitionDuration: 'var(--cx-dur-base)',
  transitionTimingFunction: 'var(--cx-ease-in-out)',
}

const selectSizes: Record<'sm' | 'md', CSSVarStyle> = {
  sm: { height: 28, padding: '0 var(--cx-sp-3)' },
  md: { height: 32, padding: '0 var(--cx-sp-3)' },
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ size = 'md', className, style, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn('cx-focus-visible', className)}
        style={{ ...selectStyle, ...selectSizes[size], ...style }}
        {...rest}
      />
    )
  },
)