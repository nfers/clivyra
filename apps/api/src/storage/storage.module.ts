import { Module } from '@nestjs/common'
import { FILE_STORAGE_PORT } from './file-storage.port'
import { LocalFileStorage } from './local.file-storage'
import { OciFileStorage } from './oci.file-storage'
import { StorageController } from './storage.controller'

function createFileStorage(): LocalFileStorage | OciFileStorage {
  const driver = (process.env.FILE_STORAGE_DRIVER ?? 'local').toLowerCase()
  if (driver === 'oci') return new OciFileStorage()
  return new LocalFileStorage()
}

@Module({
  controllers: [StorageController],
  providers: [
    LocalFileStorage,
    OciFileStorage,
    {
      provide: FILE_STORAGE_PORT,
      useFactory: createFileStorage,
    },
  ],
  exports: [FILE_STORAGE_PORT, LocalFileStorage],
})
export class StorageModule {}
