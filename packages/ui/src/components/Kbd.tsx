import * as React from 'react'
import { cn } from '../lib.js'

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  size?: 'xs' | 'sm'
}

/** Keyboard keycap rendered in JetBrains Mono — the keyboard-first signature. */
export const Kbd = React.forwardRef<HTMLElement, KbdProps>(function Kbd(
  { className, children, ...rest },
  ref,
) {
  return (
    <kbd ref={ref} className={cn('cx-kbd', className)} {...rest}>
      {children}
    </kbd>
  )
})