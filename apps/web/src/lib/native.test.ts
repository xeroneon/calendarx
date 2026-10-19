import { describe, expect, it } from 'vitest'
import { isNativeCapacitor } from './native'

describe('@calendarx/web native-env detection (XER-320)', () => {
  it('reports native when the bridge has a truthy isNativePlatform()', () => {
    expect(isNativeCapacitor({ isNativePlatform: () => true })).toBe(true)
  })

  it('reports not-native when isNativePlatform() returns false', () => {
    expect(isNativeCapacitor({ isNativePlatform: () => false })).toBe(false)
  })

  it('reports not-native when the bridge is missing or incomplete', () => {
    expect(isNativeCapacitor(undefined)).toBe(false)
    expect(isNativeCapacitor(null)).toBe(false)
    expect(isNativeCapacitor({})).toBe(false)
    expect(isNativeCapacitor({ isNativePlatform: 'android' })).toBe(false)
    expect(isNativeCapacitor('window.Capacitor')).toBe(false)
  })

  it('tolerates a bridge whose method throws or is absent at runtime', () => {
    expect(isNativeCapacitor({ isNativePlatform: undefined })).toBe(false)
  })
})