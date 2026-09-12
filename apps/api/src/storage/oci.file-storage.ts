import { Injectable } from '@nestjs/common'
import type { FileStoragePort, FileStoragePutInput } from './file-storage.port'

/**
 * OCI Object Storage stub (D8). Configure via FILE_STORAGE_DRIVER=oci when credentials exist.
 * Production must switch to a real private-bucket adapter before enabling uploads.
 */
@Injectable()
export class OciFileStorage implements FileStoragePort {
  async put(input: FileStoragePutInput): Promise<void> {
    void input
    throw new Error(
      'OCI file storage is not configured. Set FILE_STORAGE_DRIVER=local for development or provide OCI credentials.',
    )
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    void key
    void ttlSeconds
    throw new Error('OCI file storage is not configured')
  }

  async delete(key: string): Promise<void> {
    void key
    throw new Error('OCI file storage is not configured')
  }
}
