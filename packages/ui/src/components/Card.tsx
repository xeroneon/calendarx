import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hairline border on all sides. Default true. */
  bordered?: boolean
  /** Apply a level-1 elevation shadow (raised panel). */
  elevated?: boolean
  variant?: 'surface' | 'raised'
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { bordered = true, elevated = false, variant = 'surface', className, style, children, ...rest },
  ref,
) {
  const cardStyle: CSSVarStyle = {
    background: variant === 'raised' ? 'var(--cx-surface-raised)' : 'var(--cx-surface)',
    color: 'var(--cx-text)',
    borderRadius: 'var(--cx-radius-lg)',
    border: bordered ? '1px solid var(--cx-border)' : 'none',
    boxShadow: elevated ? 'var(--cx-elev-1)' : undefined,
    boxSizing: 'border-box',
  }
  return (
    <div ref={ref} className={cn('cx-font-sans', className)} style={{ ...cardStyle, ...style }} {...rest}>
      {children}
    </div>
  )
})

export interface CardHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  function CardHeader({ title, description, action, className, style, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--cx-sp-4)',
          padding: 'var(--cx-sp-4) var(--cx-sp-5)',
          borderBottom: '1px solid var(--cx-border)',
          ...style,
        }}
        {...rest}
      >
        <div>
          {title != null && (
            <div
              style={{
                fontSize: 'var(--cx-text-md)',
                fontWeight: 'var(--cx-weight-semibold)',
                color: 'var(--cx-text)',
              }}
            >
              {title}
            </div>
          )}
          {description != null && (
            <div
              style={{
                fontSize: 'var(--cx-text-sm)',
                color: 'var(--cx-text-muted)',
                marginTop: 2,
              }}
            >
              {description}
            </div>
          )}
        </div>
        {action != null && <div>{action}</div>}
      </div>
    )
  },
)

export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, style, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{ padding: 'var(--cx-sp-5)', ...style }}
        {...rest}
      />
    )
  },
)

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'left' | 'right' | 'space-between'
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  function CardFooter({ align = 'right', className, style, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          display: 'flex',
          justifyContent: align === 'space-between' ? 'space-between' : align,
          alignItems: 'center',
          gap: 'var(--cx-sp-3)',
          padding: 'var(--cx-sp-4) var(--cx-sp-5)',
          borderTop: '1px solid var(--cx-border)',
          ...style,
        }}
        {...rest}
      />
    )
  },
)