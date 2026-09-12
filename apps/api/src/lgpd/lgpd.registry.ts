import { ConflictException, Injectable } from '@nestjs/common'
import type { DataAnonymizerPort } from './ports/data-anonymizer.port'
import type { DataExporterPort } from './ports/data-exporter.port'

/**
 * Registry of data exporters/anonymizers. Domain modules register onModuleInit.
 * check-lgpd-ports.mjs enforces registration for SUBJECT_DATA_MODULES when those dirs exist.
 */
@Injectable()
export class LgpdRegistry {
  private readonly exporters = new Map<string, DataExporterPort>()
  private readonly anonymizers = new Map<string, DataAnonymizerPort>()

  registerExporter(exporter: DataExporterPort): void {
    if (this.exporters.has(exporter.module)) {
      throw new ConflictException({
        code: 'LGPD_EXPORTER_DUPLICATE',
        message: `Exporter already registered for module ${exporter.module}`,
      })
    }
    this.exporters.set(exporter.module, exporter)
  }

  registerAnonymizer(anonymizer: DataAnonymizerPort): void {
    if (this.anonymizers.has(anonymizer.module)) {
      throw new ConflictException({
        code: 'LGPD_ANONYMIZER_DUPLICATE',
        message: `Anonymizer already registered for module ${anonymizer.module}`,
      })
    }
    this.anonymizers.set(anonymizer.module, anonymizer)
  }

  listExporters(): DataExporterPort[] {
    return [...this.exporters.values()]
  }

  listAnonymizers(): DataAnonymizerPort[] {
    return [...this.anonymizers.values()]
  }

  hasExporter(module: string): boolean {
    return this.exporters.has(module)
  }

  hasAnonymizer(module: string): boolean {
    return this.anonymizers.has(module)
  }
}
