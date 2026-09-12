import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthenticatedPrincipal } from '@clivyra/types'
import { RequirePermissions } from '../rbac/permissions.decorator'
import { CurrentTenant } from '../tenant/tenant-context.decorator'
import { PrismaService } from '../prisma/prisma.service'
import {
  ChangeRoleDto,
  CreateInvitationDto,
  ListInvitationsQueryDto,
  ListUsersQueryDto,
} from './dto/users.dto'
import { InvitationService } from './invitation.service'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('users:read')
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query.status, query.cursor, query.limit)
  }

  @Get('invitations')
  @RequirePermissions('users:read')
  listInvitations(@Query() query: ListInvitationsQueryDto) {
    return this.invitations.list(query.status)
  }

  @Post('invitations')
  @HttpCode(201)
  @RequirePermissions('users:write')
  async createInvitation(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateInvitationDto,
  ) {
    const inviter = await this.prisma.bypassTenant('users-inviter-name', () =>
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { name: true },
      }),
    )
    return this.invitations.create(ctx, dto.email, dto.role, inviter.name)
  }

  @Post('invitations/:id/resend')
  @HttpCode(204)
  @RequirePermissions('users:write')
  async resendInvitation(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    const inviter = await this.prisma.bypassTenant('users-inviter-name', () =>
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { name: true },
      }),
    )
    await this.invitations.resend(ctx, id, inviter.name)
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @RequirePermissions('users:write')
  async revokeInvitation(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    await this.invitations.revoke(ctx, id)
  }

  @Patch(':membershipId/role')
  @RequirePermissions('users:write')
  changeRole(
    @CurrentTenant() ctx: TenantContext,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.users.changeRole(ctx, membershipId, dto.role)
  }

  @Post(':membershipId/deactivate')
  @HttpCode(204)
  @RequirePermissions('users:write')
  async deactivate(@CurrentTenant() ctx: TenantContext, @Param('membershipId') membershipId: string) {
    await this.users.deactivate(ctx, membershipId)
  }

  @Post(':membershipId/activate')
  @HttpCode(204)
  @RequirePermissions('users:write')
  async activate(@CurrentTenant() ctx: TenantContext, @Param('membershipId') membershipId: string) {
    await this.users.activate(ctx, membershipId)
  }
}
