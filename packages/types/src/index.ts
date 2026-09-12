export type HealthStatus = 'ok'

export interface HealthResponse {
  readonly status: HealthStatus
  readonly timestamp: string
}
