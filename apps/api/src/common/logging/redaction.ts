const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|hash|pepper)/i
const MAX_STRING_LENGTH = 2048

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item))
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = '[REDACTED]'
        continue
      }
      result[key] = redact(nested)
    }
    return result
  }

  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}…`
  }

  return value
}
