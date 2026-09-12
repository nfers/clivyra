import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailerModule } from '../mailer/mailer.module'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthInvitationsController } from './auth-invitations.controller'
import { InvitationService } from './invitation.service'
import { MembershipPolicy } from './membership.policy'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [PrismaModule, MailerModule, AuthModule],
  controllers: [UsersController, AuthInvitationsController],
  providers: [UsersService, InvitationService, MembershipPolicy],
  exports: [UsersService, InvitationService, MembershipPolicy],
})
export class UsersModule {}
