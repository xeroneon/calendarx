import * as React from 'react'
import { cn } from '../lib.js'

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  /** Hairline vs slightly stronger divider. */
  weight?: 'hairline' | 'medium'
}

/** Hairline divider — a signature Linear detail. */
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { orientation = 'horizontal', weight = 'hairline', className, style, ...rest },
  ref,
) {
  const bc = weight === 'hairline' ? 'var(--cx-border)' : 'var(--cx-border-strong)'
  const isVertical = orientation === 'vertical'
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(className)}
      style={{
        background: bc,
        border: 'none',
        flexShrink: 0,
        width: isVertical ? 1 : '100%',
        height: isVertical ? undefined : 1,
        alignSelf: isVertical ? 'stretch' : undefined,
        ...style,
      }}
      {...rest}
    />
  )
})