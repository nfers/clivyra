import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthAccessGuard } from './auth-access.guard'
import { AuthTokenService } from './auth-token.service'
import { AuthController } from './auth.controller'
import { PasswordHasherService } from './password-hasher.service'
import { AuthService } from './auth.service'

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, PasswordHasherService, AuthAccessGuard],
  exports: [AuthAccessGuard, AuthTokenService],
})
export class AuthModule {}
