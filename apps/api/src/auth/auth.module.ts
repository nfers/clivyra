import { Module } from '@nestjs/common'
import { MailerModule } from '../mailer/mailer.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantModule } from '../tenant/tenant.module'
import { AUTH_EVENTS_PORT } from './auth-events.port'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { AuthTokenService } from './auth-token.service'
import { LoggingAuthEvents } from './logging-auth-events'
import { PasswordHasherService } from './password-hasher.service'
import { PasswordResetService } from './password-reset.service'

@Module({
  imports: [PrismaModule, MailerModule, TenantModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    AuthTokenService,
    PasswordHasherService,
    AuthGuard,
    {
      provide: AUTH_EVENTS_PORT,
      useClass: LoggingAuthEvents,
    },
  ],
  exports: [AuthGuard, AuthTokenService, AuthService, PasswordHasherService, AUTH_EVENTS_PORT],
})
export class AuthModule {}
