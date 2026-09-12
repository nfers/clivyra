import { describe, expect, it } from '@jest/globals'
import { LgpdRegistry } from './lgpd.registry'
import type { DataExporterPort } from './ports/data-exporter.port'
import type { DataAnonymizerPort } from './ports/data-anonymizer.port'

const fakeExporter = (module: string): DataExporterPort => ({
  module,
  subjectTypes: ['USER'],
  export: async () => [],
})

const fakeAnonymizer = (module: string): DataAnonymizerPort => ({
  module,
  category: 'USER_PROFILE',
  subjectTypes: ['USER'],
  anonymize: async () => ({ affected: 0, strategy: 'ANONYMIZED' }),
})

describe('LgpdRegistry', () => {
  it('registers exporters and anonymizers', () => {
    const registry = new LgpdRegistry()
    registry.registerExporter(fakeExporter('users'))
    registry.registerAnonymizer(fakeAnonymizer('users'))
    expect(registry.hasExporter('users')).toBe(true)
    expect(registry.hasAnonymizer('users')).toBe(true)
    expect(registry.listExporters()).toHaveLength(1)
  })

  it('rejects duplicate exporters', () => {
    const registry = new LgpdRegistry()
    registry.registerExporter(fakeExporter('users'))
    expect(() => registry.registerExporter(fakeExporter('users'))).toThrow()
  })
})
