import { describe, expect, it } from 'vitest'
import type { ApiResponse, HealthStatus, User } from './index.js'

describe('@calendax/types', () => {
  it('models a health status as ok', () => {
    const health: HealthStatus = {
      status: 'ok',
      version: '0.1.0',
      service: 'server',
      uptimeSeconds: 12,
    }
    expect(health.status).toBe('ok')
  })

  it('models an ApiResponse as a success envelope', () => {
    const user: User = {
      id: 'u_1',
      email: 'a@xeroneon.dev',
      displayName: 'Axel',
      createdAt: '2026-01-01T00:00:00Z',
      avatarColor: '#6366f1',
    }
    const res: ApiResponse<User> = { ok: true, data: user }
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.displayName).toBe('Axel')
  })
})