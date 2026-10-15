import * as React from 'react'
import type { CSSVarStyle } from '../lib.js'
import { cn } from '../lib.js'

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean
}

const areaStyle: CSSVarStyle = {
  width: '100%',
  boxSizing: 'border-box',
  resize: 'vertical',
  background: 'var(--cx-surface)',
  color: 'var(--cx-text)',
  border: '1px solid var(--cx-border-strong)',
  borderRadius: 'var(--cx-radius-md)',
  padding: 'var(--cx-sp-3)',
  fontFamily: 'var(--cx-font-sans)',
  fontSize: 'var(--cx-text-md)',
  lineHeight: 'var(--cx-lh-md)',
  transitionProperty: 'border-color, box-shadow, background-color',
  transitionDuration: 'var(--cx-dur-base)',
  transitionTimingFunction: 'var(--cx-ease-in-out)',
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ mono, className, style, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn('cx-focus-visible', className)}
        style={{
          ...areaStyle,
          fontFamily: mono ? 'var(--cx-font-mono)' : undefined,
          ...style,
        }}
        {...rest}
      />
    )
  },
)