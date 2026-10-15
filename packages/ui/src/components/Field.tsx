import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  htmlFor?: string
  required?: boolean
}

const labelStyle: CSSVarStyle = {
  display: 'inline-flex',
  gap: 'var(--cx-sp-1)',
  fontSize: 'var(--cx-text-sm)',
  fontWeight: 'var(--cx-weight-medium)',
  color: 'var(--cx-text-muted)',
  marginBottom: 'var(--cx-sp-1)',
}

/** Label + input + hint/error wrapper. Dense Linear-style field layout. */
export const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, hint, error, htmlFor, required, className, style, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('cx-font-sans', className)} style={{ marginBottom: 'var(--cx-sp-4)', ...style }} {...rest}>
      {label != null && (
        <label style={labelStyle} htmlFor={htmlFor}>
          {label}
          {required && (
            <span aria-hidden style={{ color: 'var(--cx-danger)' }}>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error != null ? (
        <div role="alert" style={{ fontSize: 'var(--cx-text-sm)', color: 'var(--cx-danger)', marginTop: 'var(--cx-sp-1)' }}>
          {error}
        </div>
      ) : hint != null ? (
        <div style={{ fontSize: 'var(--cx-text-sm)', color: 'var(--cx-text-faint)', marginTop: 'var(--cx-sp-1)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
})