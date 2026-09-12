import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { MailerModule } from '../mailer/mailer.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantModule } from '../tenant/tenant.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { AuthTokenService } from './auth-token.service'
import { PasswordHasherService } from './password-hasher.service'
import { PasswordResetService } from './password-reset.service'

@Module({
  imports: [PrismaModule, MailerModule, TenantModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    AuthTokenService,
    PasswordHasherService,
    AuthGuard,
  ],
  exports: [AuthGuard, AuthTokenService, AuthService, PasswordHasherService],
})
export class AuthModule {}
