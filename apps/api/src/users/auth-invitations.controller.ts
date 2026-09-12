import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { Public } from '../auth/public.decorator'
import { AUTH_THROTTLE } from '../auth/auth-throttle.config'
import type { RequestWithAuth } from '../auth/auth.types'
import { AcceptInvitationDto } from './dto/users.dto'
import { InvitationService } from './invitation.service'

@Controller('auth/invitations')
export class AuthInvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Public()
  @Get(':token')
  @Throttle(AUTH_THROTTLE.passwordResetRequest)
  preview(@Param('token') token: string) {
    return this.invitations.preview(token)
  }

  @Public()
  @Post('accept')
  @HttpCode(201)
  @Throttle(AUTH_THROTTLE.signup)
  accept(@Body() dto: AcceptInvitationDto, @Req() request: Request & RequestWithAuth) {
    return this.invitations.accept(dto, request)
  }
}
