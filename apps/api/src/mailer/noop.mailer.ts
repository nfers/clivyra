import { Injectable } from '@nestjs/common'
import type { MailerPort, MailMessage } from './mailer.port'

@Injectable()
export class NoopMailer implements MailerPort {
  async send(_message: MailMessage): Promise<void> {
    // intentionally no-op for local development
  }
}
