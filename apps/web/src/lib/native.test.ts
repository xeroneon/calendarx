import { describe, expect, it } from 'vitest'
import { isNative, unifiedPushPlugin } from './native'

describe('@calendarx/web native (Capacitor) detection', () => {
  const origWindow = globalThis.window
  const originalIsNative = Object.getOwnPropertyDescriptor(globalThis, 'window')

  function withWindow(value: unknown, fn: () => void): void {
    Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true })
    try {
      fn()
    } finally {
      if (originalIsNative) {
        Object.defineProperty(globalThis, 'window', originalIsNative)
      } else {
        // @ts-expect-error cleanup
        delete globalThis.window
      }
    }
  }

  it('isNative() is false during SSR (no window)', () => {
    withWindow(undefined, () => {
      expect(isNative()).toBe(false)
    })
  })

  it('isNative() is false on the plain web (no Capacitor)', () => {
    withWindow({}, () => {
      expect(isNative()).toBe(false)
    })
  })

  it('isNative() is true only when the Capacitor bridge reports a native platform', () => {
    withWindow({ Capacitor: { isNativePlatform: () => true, Plugins: {} } }, () => {
      expect(isNative()).toBe(true)
    })
    withWindow({ Capacitor: { isNativePlatform: () => false } }, () => {
      expect(isNative()).toBe(false)
    })
  })

  it('unifiedPushPlugin() surfaces the native plugin only, and is undefined otherwise', () => {
    withWindow({ Capacitor: { isNativePlatform: () => true, Plugins: { CalendarXUnifiedPush: { register: () => {} } } } }, () => {
      expect(unifiedPushPlugin()).toBeDefined()
    })
    withWindow(undefined, () => {
      expect(unifiedPushPlugin()).toBeUndefined()
    })
  })

  it('restores window after tests', () => {
    expect(globalThis.window).toBe(origWindow)
  })
})