import { Module, type Type } from '@nestjs/common'
import { MAILER_PORT } from './mailer.port'
import { NoopMailer } from './noop.mailer'
import { SmtpMailer } from './smtp.mailer'
import { TestMailboxController } from './test-mailbox.controller'
import { TestMailboxMailer } from './test-mailbox.mailer'

function resolveMailer(): Type<NoopMailer | SmtpMailer | TestMailboxMailer> {
  const driver = (process.env.MAILER_DRIVER ?? 'noop').toLowerCase()
  if (process.env.NODE_ENV === 'test' || driver === 'test-mailbox') {
    return TestMailboxMailer
  }
  if (driver === 'smtp') {
    return SmtpMailer
  }
  return NoopMailer
}

const testControllers: Type<unknown>[] =
  process.env.NODE_ENV === 'test' ? [TestMailboxController] : []

@Module({
  controllers: [...testControllers],
  providers: [
    {
      provide: MAILER_PORT,
      useClass: resolveMailer(),
    },
  ],
  exports: [MAILER_PORT],
})
export class MailerModule {}
