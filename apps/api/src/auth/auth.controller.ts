import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { AuthenticatedPrincipal } from '@clivyra/types'
import type { Request } from 'express'
import { TenantContextGuard } from '../tenant/tenant-context.guard'
import { AUTH_THROTTLE } from './auth-throttle.config'
import { AuthService } from './auth.service'
import type { RequestWithAuth } from './auth.types'
import { CurrentUser } from './current-user.decorator'
import {
  LoginDto,
  LogoutDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  SignupDto,
  SwitchTenantDto,
} from './dto/auth.dto'
import { PasswordResetService } from './password-reset.service'
import { Public } from './public.decorator'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(201)
  @Throttle(AUTH_THROTTLE.signup)
  signup(@Body() dto: SignupDto, @Req() request: Request & RequestWithAuth) {
    return this.auth.signup(dto, request)
  }

  @Public()
  @Post('login')
  @Throttle(AUTH_THROTTLE.login)
  login(@Body() dto: LoginDto, @Req() request: Request & RequestWithAuth) {
    return this.auth.login(dto, request)
  }

  @Public()
  @Post('refresh')
  @Throttle(AUTH_THROTTLE.refresh)
  refresh(@Body() dto: RefreshDto, @Req() request: Request & RequestWithAuth) {
    return this.auth.refresh(dto, request)
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE.logout)
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto)
  }

  @Post('logout-all')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE.logoutAll)
  @UseGuards(TenantContextGuard)
  async logoutAll(@CurrentUser() user: AuthenticatedPrincipal) {
    await this.auth.logoutAll(user.userId)
  }

  @Post('switch-tenant')
  @Throttle(AUTH_THROTTLE.switchTenant)
  @UseGuards(TenantContextGuard)
  switchTenant(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: SwitchTenantDto,
    @Req() request: Request & RequestWithAuth,
  ) {
    return this.auth.switchTenant(user.userId, user.sessionId, dto, request)
  }

  @Get('me')
  @UseGuards(TenantContextGuard)
  me(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.auth.me(user.userId, user.currentTenantId)
  }

  @Get('sessions')
  @UseGuards(TenantContextGuard)
  sessions(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.auth.listSessions(user.userId, user.sessionId)
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @UseGuards(TenantContextGuard)
  async revokeSession(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') id: string) {
    await this.auth.revokeSession(user.userId, id)
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(202)
  @Throttle(AUTH_THROTTLE.passwordResetRequest)
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.passwordReset.request(dto)
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE.passwordResetConfirm)
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    await this.passwordReset.confirm(dto)
  }
}
