/** Compact subset of highly common passwords (normalized lower-case). */
export const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  '123456789012',
  '1234567890',
  'qwertyuiop',
  'qwerty12345',
  'letmein1234',
  'welcome1234',
  'adminadmin1',
  'iloveyou123',
  'monkey12345',
  'dragon12345',
  'master12345',
  'loginlogin1',
  'abc123abc123',
  'passw0rd1234',
  'changeme1234',
  'football123',
  'baseball123',
  'superman123',
  'trustno1abc',
  'access12345',
  'shadow12345',
  'sunshine123',
  'princess123',
  'starwars123',
  'computer123',
  'michelle123',
  'jennifer123',
  'antonio1234',
  'clivyra1234',
  'studio12345',
  'pilates1234',
])

const LOWER = /[a-z]/
const UPPER = /[A-Z]/
const DIGIT = /\d/
const SPECIAL = /[^A-Za-z0-9]/

export function countCharacterClasses(password: string): number {
  let count = 0
  if (LOWER.test(password)) count += 1
  if (UPPER.test(password)) count += 1
  if (DIGIT.test(password)) count += 1
  if (SPECIAL.test(password)) count += 1
  return count
}

export function isPasswordStrong(password: string, email?: string): boolean {
  if (password.length < 12 || password.length > 128) return false
  if (countCharacterClasses(password) < 3) return false
  const normalized = password.toLowerCase()
  if (COMMON_PASSWORDS.has(normalized)) return false
  if (email) {
    const local = email.trim().toLowerCase().split('@')[0] ?? ''
    if (local.length >= 3 && normalized.includes(local)) return false
    if (normalized.includes(email.trim().toLowerCase())) return false
  }
  return true
}

export const RESERVED_TENANT_SLUGS = new Set(['admin', 'api', 'www', 'app', 'clivyra'])

export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidTenantSlug(slug: string): boolean {
  return TENANT_SLUG_PATTERN.test(slug) && !RESERVED_TENANT_SLUGS.has(slug)
}
