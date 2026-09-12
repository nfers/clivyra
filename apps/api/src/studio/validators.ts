/** Digits-only CPF validation with check digits. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  const calc = (base: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i)
    }
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  const d1 = calc(digits.slice(0, 9), 10)
  const d2 = calc(digits.slice(0, 10), 11)
  return d1 === Number(digits[9]) && d2 === Number(digits[10])
}

/** Digits-only CNPJ validation with check digits. */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  const calc = (base: string, weights: number[]) => {
    let sum = 0
    for (let i = 0; i < weights.length; i += 1) {
      sum += Number(base[i]) * weights[i]
    }
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calc(digits.slice(0, 12), w1)
  const d2 = calc(digits.slice(0, 13), w2)
  return d1 === Number(digits[12]) && d2 === Number(digits[13])
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Mask CNPJ-like `**.***.***/0001-**` or generic trailing digits for CPF. */
export function maskStudioDocument(documentType: string | null | undefined, digits: string): string {
  if (documentType === 'CNPJ' && digits.length === 14) {
    return `**.***.***/${digits.slice(8, 12)}-**`
  }
  if (digits.length <= 4) return '****'
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}

export function normalizeCouncilNumber(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

const COMMON_TIMEZONES = new Set([
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC',
])

export function isValidTimezone(value: string): boolean {
  if (COMMON_TIMEZONES.has(value)) return true
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}
