import { Injectable } from '@nestjs/common'
import type { MailerPort, MailMessage } from './mailer.port'

@Injectable()
export class NoopMailer implements MailerPort {
  async send(message: MailMessage): Promise<void> {
    void message
  }
}
