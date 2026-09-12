import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { MailerPort, MailMessage, TestMailboxMessage } from './mailer.port'

@Injectable()
export class TestMailboxMailer implements MailerPort {
  private readonly messages: TestMailboxMessage[] = []

  async send(message: MailMessage): Promise<void> {
    this.messages.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...message,
    })
  }

  list(to?: string): TestMailboxMessage[] {
    if (!to) return [...this.messages]
    const normalized = to.trim().toLowerCase()
    return this.messages.filter((item) => item.to.trim().toLowerCase() === normalized)
  }

  clear(): void {
    this.messages.length = 0
  }
}
