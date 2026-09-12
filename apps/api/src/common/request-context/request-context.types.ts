export interface RequestContext {
  readonly requestId: string
  readonly ip?: string
  readonly userAgent?: string
}
