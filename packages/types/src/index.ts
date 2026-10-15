export type UserID = string
export type VaultEntryID = string
export type FileNodeID = string

/** A user of the platform (auth module source of truth). */
export interface User {
  id: UserID
  email: string
  displayName: string
  createdAt: string
  avatarColor: string
}

/** The three product modules, matching the Phase 1-3 roadmap. */
export type CloudModule = 'files' | 'calendar' | 'vault'

/** Common envelope for API responses. */
export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

/** Health payload every service exposes for the compose stack. */
export interface HealthStatus {
  status: 'ok' | 'degraded'
  version: string
  service: string
  uptimeSeconds: number
}