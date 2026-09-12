export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value?.trim() || undefined
}
