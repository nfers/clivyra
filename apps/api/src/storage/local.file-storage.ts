import { Injectable } from '@nestjs/common'
import { mkdir, unlink, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FileStoragePort, FileStoragePutInput } from './file-storage.port'

@Injectable()
export class LocalFileStorage implements FileStoragePort {
  private readonly root: string
  private readonly signingSecret: string

  constructor() {
    this.root = process.env.FILE_STORAGE_LOCAL_DIR ?? path.join(process.cwd(), '.local-storage')
    this.signingSecret =
      process.env.FILE_STORAGE_SIGNING_SECRET ??
      process.env.AUTH_ACCESS_TOKEN_SECRET ??
      'local-dev-file-storage-signing-secret'
  }

  async put(input: FileStoragePutInput): Promise<void> {
    this.assertTenantPrefix(input.key, input.tenantId)
    const absolute = this.resolvePath(input.key)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, input.body)
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.min(ttlSeconds, 300))
    const signature = this.sign(`${key}:${expires}`)
    const base = process.env.API_PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 3001}`
    const params = new URLSearchParams({
      key,
      expires: String(expires),
      sig: signature,
    })
    return `${base}/storage/signed?${params.toString()}`
  }

  async delete(key: string): Promise<void> {
    const absolute = this.resolvePath(key)
    try {
      await access(absolute)
      await unlink(absolute)
    } catch {
      // idempotent
    }
  }

  resolvePath(key: string): string {
    if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
      throw new Error('Invalid storage key')
    }
    const absolute = path.resolve(this.root, key)
    if (!absolute.startsWith(path.resolve(this.root))) {
      throw new Error('Storage path escape')
    }
    return absolute
  }

  verifySignature(key: string, expires: number, sig: string): boolean {
    if (expires < Math.floor(Date.now() / 1000)) return false
    const expected = this.sign(`${key}:${expires}`)
    try {
      const a = Buffer.from(expected)
      const b = Buffer.from(sig)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingSecret).update(payload).digest('hex')
  }

  private assertTenantPrefix(key: string, tenantId: string): void {
    const prefix = `tenants/${tenantId}/`
    if (!key.startsWith(prefix)) {
      throw new Error('Storage key must be prefixed with tenant id')
    }
  }
}
