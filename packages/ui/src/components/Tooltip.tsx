import * as React from 'react'

export interface TooltipProps {
  /** Content of the bubble (shown as raw text). */
  label: React.ReactNode
  /** Single expected child element (needs to accept spread HTML attrs). */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>
  placement?: 'top' | 'bottom'
  delay?: number
}

/**
 * CSS-only tooltip: no positioning math, no portal — just a hover/
 * focus-within reveal. Feels instant (120ms) and is fully SSR-safe. The
 * tooltip bubble is linked to the child via `aria-describedby`.
 */
export const Tooltip = React.forwardRef<HTMLSpanElement, TooltipProps>(function Tooltip(
  { label, children, placement = 'bottom', delay = 120 },
  ref,
) {
  const id = React.useId()

  return (
    <span ref={ref} className="cx-tooltip" data-placement={placement} data-delay={delay}>
      {React.cloneElement(children, {
        'aria-describedby': id,
      })}
      <span role="tooltip" id={id} className="cx-tooltip__bubble">
        {label}
      </span>
    </span>
  )
})