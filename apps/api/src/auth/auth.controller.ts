import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { AuthenticatedPrincipal, AuthPermissionsResponse, TenantContext } from '@clivyra/types'
import { rolePermissions } from '@clivyra/types'
import type { Request } from 'express'
import { RequirePermissions } from '../rbac/permissions.decorator'
import { CurrentTenant } from '../tenant/tenant-context.decorator'
import { NoTenant } from '../tenant/no-tenant.decorator'
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
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE.login)
  login(@Body() dto: LoginDto, @Req() request: Request & RequestWithAuth) {
    return this.auth.login(dto, request)
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
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

  @NoTenant()
  @Post('logout-all')
  @HttpCode(204)
  @Throttle(AUTH_THROTTLE.logoutAll)
  async logoutAll(@CurrentUser() user: AuthenticatedPrincipal) {
    await this.auth.logoutAll(user.userId)
  }

  @NoTenant()
  @Post('switch-tenant')
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE.switchTenant)
  switchTenant(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: SwitchTenantDto,
    @Req() request: Request & RequestWithAuth,
  ) {
    return this.auth.switchTenant(user.userId, user.sessionId, dto, request)
  }

  @NoTenant()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.auth.me(user.userId, user.currentTenantId)
  }

  @NoTenant()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.auth.listSessions(user.userId, user.sessionId)
  }

  @NoTenant()
  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') id: string) {
    await this.auth.revokeSession(user.userId, id)
  }

  /** Any authenticated tenant role may read their own permission set. */
  @Get('permissions')
  @RequirePermissions()
  permissions(@CurrentTenant() tenant: TenantContext): AuthPermissionsResponse {
    return {
      role: tenant.role,
      permissions: rolePermissions(tenant.role),
    }
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
