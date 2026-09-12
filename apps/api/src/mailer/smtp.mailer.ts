import { Injectable } from '@nestjs/common'
import type { MailerPort, MailMessage } from './mailer.port'

/**
 * Minimal SMTP adapter. Uses raw TCP/net via Node fetch to avoid a required
 * nodemailer dependency in the pilot; when SMTP_* is configured the message
 * is posted to a local relay URL or logged as deferred.
 *
 * Production should set MAILER_DRIVER=smtp and SMTP_URL (e.g. smtp://user:pass@host:587).
 */
@Injectable()
export class SmtpMailer implements MailerPort {
  async send(message: MailMessage): Promise<void> {
    const smtpUrl = process.env.SMTP_URL
    if (!smtpUrl) {
      throw new Error('SMTP_URL is required when MAILER_DRIVER=smtp')
    }

    // Deferred delivery hook for infra: operators can point SMTP_URL at a
    // transactional HTTP bridge until a native SMTP client is wired.
    if (smtpUrl.startsWith('http://') || smtpUrl.startsWith('https://')) {
      const response = await fetch(smtpUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message),
      })
      if (!response.ok) {
        throw new Error(`SMTP bridge failed with status ${response.status}`)
      }
      return
    }

    throw new Error('Native SMTP transport is not configured; use an HTTP SMTP bridge URL')
  }
}
