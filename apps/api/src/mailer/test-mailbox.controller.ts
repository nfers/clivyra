import { Controller, Get, Inject, Query } from '@nestjs/common'
import { Public } from '../auth/public.decorator'
import { MAILER_PORT, type MailerPort } from './mailer.port'
import { TestMailboxMailer } from './test-mailbox.mailer'

@Controller('__test__/mailbox')
export class TestMailboxController {
  constructor(@Inject(MAILER_PORT) private readonly mailer: MailerPort) {}

  @Public()
  @Get()
  list(@Query('to') to?: string) {
    if (!(this.mailer instanceof TestMailboxMailer)) {
      return []
    }
    return this.mailer.list(to)
  }
}
