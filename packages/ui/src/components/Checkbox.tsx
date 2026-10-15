import * as React from 'react'
import { useControllableState } from '../hooks/useControllableState.js'
import type { CSSVarStyle } from '../lib.js'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'checked' | 'defaultChecked'> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Dense hairline checkbox. Keyboard-first: the hidden native input keeps its
 * focus + space-toggle semantics; the visible box is theme-aware.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { checked, defaultChecked = false, onCheckedChange, disabled, className, style, ...rest },
    ref,
  ) {
    const [value, setValue] = useControllableState<boolean>({
      value: checked,
      defaultValue: defaultChecked,
      onChange: onCheckedChange,
      name: 'Checkbox.checked',
    })

    const checkStyle: CSSVarStyle = {
      width: 16,
      height: 16,
      border: value ? '1px solid var(--cx-accent-600)' : '1px solid var(--cx-border-strong)',
      background: value ? 'var(--cx-accent-600)' : 'var(--cx-surface)',
      borderRadius: 'var(--cx-radius-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--cx-text-inverse)',
      flexShrink: 0,
      transitionProperty: 'background-color, border-color',
      transitionDuration: 'var(--cx-dur-fast)',
      transitionTimingFunction: 'var(--cx-ease-in-out)',
    }

    return (
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--cx-sp-2)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        className={className}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
          disabled={disabled}
          aria-checked={value}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
          {...rest}
        />
        <span aria-hidden className="cx-focus-visible" style={checkStyle}>
          {value && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8.5L6.5 12L13 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {rest.children}
      </label>
    )
  },
)