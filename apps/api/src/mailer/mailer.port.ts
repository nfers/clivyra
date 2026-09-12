export const MAILER_PORT = Symbol('MAILER_PORT')

export interface MailMessage {
  to: string
  subject: string
  text: string
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>
}

export interface TestMailboxMessage extends MailMessage {
  id: string
  createdAt: string
}
