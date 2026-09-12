import { ConsoleLogger, Injectable, type LogLevel, type LoggerService } from '@nestjs/common'
import { RequestContextStorage } from '../request-context/request-context.storage'
import { TenantContextStorage } from '../../tenant/tenant-context.storage'
import { redact } from './redaction'

type LogMeta = Record<string, unknown>

@Injectable()
export class AppLogger implements LoggerService {
  private readonly fallback = new ConsoleLogger('AppLogger')

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams)
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams)
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams)
  }

  setLogLevels?(levels: LogLevel[]): void {
    this.fallback.setLogLevels?.(levels)
  }

  private write(level: string, message: unknown, optionalParams: unknown[]): void {
    const request = RequestContextStorage.get()
    const tenant = TenantContextStorage.get()
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.at(-1) as string) : undefined
    const metaCandidates = optionalParams.filter((param) => param && typeof param === 'object') as LogMeta[]
    const meta = metaCandidates.length > 0 ? (redact(Object.assign({}, ...metaCandidates)) as LogMeta) : undefined

    const payload = {
      ts: new Date().toISOString(),
      level,
      msg: typeof message === 'string' ? message : JSON.stringify(redact(message)),
      requestId: request?.requestId,
      tenantId: tenant?.tenantId,
      userId: tenant?.userId,
      context,
      ...(meta ?? {}),
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
}
