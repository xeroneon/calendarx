import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import { cn } from '../lib.js'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
  id?: string
}

/** Linear-style toggle switch. Keyboard-first via the hidden native input. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked = false, onCheckedChange, disabled, label, className, id },
  ref,
) {
  const [value, setValue] = useControllableState<boolean>({
    value: checked,
    defaultValue: defaultChecked,
    onChange: onCheckedChange,
    name: 'Switch.checked',
  })

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      className={cn('cx-focus-visible', className)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setValue(!value)
        }
      }}
      onClick={() => setValue(!value)}
      style={{
        width: 34,
        height: 20,
        borderRadius: 'var(--cx-radius-full)',
        background: value ? 'var(--cx-accent-600)' : 'var(--cx-border-strong)',
        border: 'none',
        padding: 0,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        flexShrink: 0,
        transitionProperty: 'background-color',
        transitionDuration: 'var(--cx-dur-fast)',
        transitionTimingFunction: 'var(--cx-ease-in-out)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: 'var(--cx-radius-full)',
          background: 'var(--cx-neutral-0)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          transitionProperty: 'left',
          transitionDuration: 'var(--cx-dur-fast)',
          transitionTimingFunction: 'var(--cx-ease-in-out)',
        }}
      />
    </button>
  )
})