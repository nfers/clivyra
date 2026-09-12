export const FILE_STORAGE_PORT = Symbol('FILE_STORAGE_PORT')

export interface FileStoragePutInput {
  readonly key: string
  readonly body: Buffer
  readonly contentType: string
  readonly tenantId: string
}

export interface FileStoragePort {
  put(input: FileStoragePutInput): Promise<void>
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>
  delete(key: string): Promise<void>
}

/** Builds a tenant-prefixed storage key. Never trust a client-supplied path. */
export function tenantStorageKey(
  tenantId: string,
  ...segments: string[]
): string {
  const safe = segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '_'))
  return `tenants/${tenantId}/${safe.join('/')}`
}
