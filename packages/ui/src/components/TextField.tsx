import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

const inputBase: CSSVarStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--cx-surface)',
  color: 'var(--cx-text)',
  border: '1px solid var(--cx-border-strong)',
  borderRadius: 'var(--cx-radius-md)',
  fontFamily: 'var(--cx-font-sans)',
  transitionProperty: 'border-color, box-shadow, background-color',
  transitionDuration: 'var(--cx-dur-base)',
  transitionTimingFunction: 'var(--cx-ease-in-out)',
}

const inputSizes: Record<'sm' | 'md', CSSVarStyle> = {
  sm: { height: 28, padding: '0 var(--cx-sp-3)', fontSize: 'var(--cx-text-sm)' },
  md: { height: 32, padding: '0 var(--cx-sp-3)', fontSize: 'var(--cx-text-md)' },
}

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
  /**
   * Leading icon slot (e.g. search). Rendered inside the field at the left.
   */
  leading?: React.ReactNode
  /** Optional code-style intent: render value in JetBrains Mono. */
  mono?: boolean
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { size = 'md', leading, mono, className, style, type = 'text', ...rest },
    ref,
  ) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {leading != null && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--cx-text-faint)',
              display: 'inline-flex',
              pointerEvents: 'none',
            }}
          >
            {leading}
          </span>
        )}
        <input
          ref={ref}
          type={type}
          className={cn('cx-focus-visible', className)}
          style={{
            ...inputBase,
            ...inputSizes[size],
            paddingLeft: leading != null ? 30 : undefined,
            fontFamily: mono ? 'var(--cx-font-mono)' : undefined,
            fontSize: mono ? 'var(--cx-text-sm)' : undefined,
            ...style,
          }}
          {...rest}
        />
      </div>
    )
  },
)