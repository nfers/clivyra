import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'

export type UploadKind = 'signature' | 'logo'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

const LIMITS: Record<UploadKind, { maxBytes: number; maxWidth?: number; maxHeight?: number }> = {
  signature: { maxBytes: 1 * 1024 * 1024, maxWidth: 2000, maxHeight: 800 },
  logo: { maxBytes: 512 * 1024 },
}

export interface ValidatedUpload {
  readonly contentType: 'image/png' | 'image/jpeg'
  readonly extension: 'png' | 'jpg'
  readonly width?: number
  readonly height?: number
}

export function detectImageType(buffer: Buffer): ValidatedUpload['contentType'] | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png'
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg'
  // SVG / XML — blocked (XSS)
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return null
  return null
}

function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function readJpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }
    offset += 2 + length
  }
  return null
}

export function validateImageUpload(buffer: Buffer, kind: UploadKind, filename?: string): ValidatedUpload {
  const limits = LIMITS[kind]
  if (buffer.length > limits.maxBytes) {
    throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'File too large' })
  }
  if (buffer.length === 0) {
    throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Empty file' })
  }

  const contentType = detectImageType(buffer)
  if (!contentType) {
    throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Only PNG and JPEG are accepted' })
  }

  const extension = contentType === 'image/png' ? 'png' : 'jpg'
  if (filename) {
    const lower = filename.toLowerCase()
    const claimedPng = lower.endsWith('.png')
    const claimedJpeg = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
    if (claimedPng && contentType !== 'image/png') {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Extension does not match content' })
    }
    if (claimedJpeg && contentType !== 'image/jpeg') {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Extension does not match content' })
    }
    if (lower.endsWith('.svg')) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'SVG is not accepted' })
    }
  }

  const size = contentType === 'image/png' ? readPngSize(buffer) : readJpegSize(buffer)
  if (kind === 'signature' && size) {
    if (
      (limits.maxWidth && size.width > limits.maxWidth) ||
      (limits.maxHeight && size.height > limits.maxHeight)
    ) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Image dimensions exceed limit' })
    }
  }

  return {
    contentType,
    extension,
    width: size?.width,
    height: size?.height,
  }
}
