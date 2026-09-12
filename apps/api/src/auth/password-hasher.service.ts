import { Injectable } from '@nestjs/common'
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)
const ITERATIONS = 210_000
const KEY_LENGTH = 32
const DIGEST = 'sha512'

@Injectable()
export class PasswordHasherService {
  private readonly pepper: string

  constructor(pepper = process.env.AUTH_PASSWORD_PEPPER ?? 'local-development-password-pepper-change-me') {
    if (process.env.NODE_ENV === 'production' && !process.env.AUTH_PASSWORD_PEPPER) {
      throw new Error('AUTH_PASSWORD_PEPPER is required in production')
    }

    this.pepper = pepper
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url')
    const derived = await pbkdf2Async(this.withPepper(password), salt, ITERATIONS, KEY_LENGTH, DIGEST)

    return `pbkdf2$${ITERATIONS}$${salt}$${derived.toString('base64url')}`
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [scheme, iterationsRaw, salt, expectedRaw] = storedHash.split('$')

    if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !expectedRaw) {
      return false
    }

    const iterations = Number(iterationsRaw)

    if (!Number.isSafeInteger(iterations) || iterations <= 0) {
      return false
    }

    const expected = Buffer.from(expectedRaw, 'base64url')
    const actual = await pbkdf2Async(this.withPepper(password), salt, iterations, expected.length, DIGEST)

    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  private withPepper(password: string): string {
    return `${password}.${this.pepper}`
  }
}
