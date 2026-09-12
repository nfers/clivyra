import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LocalFileStorage } from './local.file-storage'
import { tenantStorageKey } from './file-storage.port'

describe('LocalFileStorage', () => {
  let dir: string
  let storage: LocalFileStorage

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'clivyra-storage-'))
    process.env.FILE_STORAGE_LOCAL_DIR = dir
    process.env.FILE_STORAGE_SIGNING_SECRET = 'test-signing-secret'
    storage = new LocalFileStorage()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('prefixes keys with tenant id', async () => {
    const key = tenantStorageKey('tenant-1', 'professionals', 'pro-1', 'signature.png')
    expect(key.startsWith('tenants/tenant-1/')).toBe(true)
    await storage.put({
      key,
      body: Buffer.from('abc'),
      contentType: 'image/png',
      tenantId: 'tenant-1',
    })
    const stored = await readFile(path.join(dir, key))
    expect(stored.toString()).toBe('abc')
  })

  it('rejects keys without tenant prefix', async () => {
    await expect(
      storage.put({
        key: 'other/path.png',
        body: Buffer.from('x'),
        contentType: 'image/png',
        tenantId: 'tenant-1',
      }),
    ).rejects.toThrow(/prefixed/)
  })
})
