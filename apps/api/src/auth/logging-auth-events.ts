import { Injectable } from '@nestjs/common'
import { AppLogger } from '../common/logging/app-logger.service'
import type { AuthEventPayload, AuthEventsPort } from './auth-events.port'

@Injectable()
export class LoggingAuthEvents implements AuthEventsPort {
  private readonly logger = new AppLogger()

  emit(event: string, payload: AuthEventPayload = {}): void {
    this.logger.log(event, {
      metric: event,
      ...payload,
    })
  }
}
