import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { Public } from '../auth/public.decorator'
import { LocalFileStorage } from './local.file-storage'

/**
 * Serves short-lived signed local storage URLs.
 * OCI driver returns pre-authenticated URLs directly and does not use this route.
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly local: LocalFileStorage) {}

  @Get('signed')
  @Public()
  async signed(
    @Query('key') key: string,
    @Query('expires') expiresRaw: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const expires = Number(expiresRaw)
    if (!key || !sig || !Number.isFinite(expires) || !this.local.verifySignature(key, expires, sig)) {
      throw new NotFoundException()
    }
    const absolute = this.local.resolvePath(key)
    try {
      await access(absolute)
    } catch {
      throw new NotFoundException()
    }
    const contentType = key.endsWith('.png') ? 'image/png' : 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'attachment')
    res.setHeader('Cache-Control', 'private, no-store')
    createReadStream(absolute).pipe(res)
  }
}
