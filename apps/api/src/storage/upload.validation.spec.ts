import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import { detectImageType, validateImageUpload } from './upload.validation'

function pngBuffer(width = 10, height = 10): Buffer {
  const buf = Buffer.alloc(24)
  buf[0] = 0x89
  buf[1] = 0x50
  buf[2] = 0x4e
  buf[3] = 0x47
  buf[4] = 0x0d
  buf[5] = 0x0a
  buf[6] = 0x1a
  buf[7] = 0x0a
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

describe('upload.validation', () => {
  it('accepts PNG magic bytes', () => {
    const result = validateImageUpload(pngBuffer(), 'signature', 'sig.png')
    expect(result.contentType).toBe('image/png')
  })

  it('rejects JPEG renamed as PNG', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(() => validateImageUpload(jpeg, 'signature', 'sig.png')).toThrow(BadRequestException)
  })

  it('rejects SVG', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(detectImageType(svg)).toBeNull()
    expect(() => validateImageUpload(svg, 'logo', 'logo.svg')).toThrow(BadRequestException)
  })

  it('rejects oversized files', () => {
    const huge = Buffer.concat([pngBuffer(), Buffer.alloc(2 * 1024 * 1024)])
    expect(() => validateImageUpload(huge, 'signature', 'big.png')).toThrow(PayloadTooLargeException)
  })
})
