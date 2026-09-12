import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import type { Role } from '@clivyra/types'
import { CurrentTenant } from '../tenant/tenant-context.decorator'
import { TenantContextGuard } from '../tenant/tenant-context.guard'
import type { TenantContext } from '../tenant/tenant-context.types'
import { PrismaService } from '../prisma/prisma.service'
import { TenantScopeViolationError } from '../prisma/tenant-scope.errors'
import { TestPrincipalGuard } from './test-principal.guard'

const ROLES = ['OWNER', 'ADMIN', 'PROFESSIONAL', 'RECEPTION'] as const

class CreateMembershipDto {
  @IsString()
  userId!: string

  @IsIn(ROLES)
  role!: Role

  /** Intentionally accepted to prove extension rejects client tenantId. */
  @IsOptional()
  @IsString()
  tenantId?: string
}

class UpdateMembershipDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

/**
 * Test-only routes to exercise tenant-owned Membership operations.
 * Registered only when NODE_ENV=test.
 */
@Controller('__test__/memberships')
@UseGuards(TestPrincipalGuard, TenantContextGuard)
export class TestMembershipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    void tenant
    return this.prisma.membership.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        role: true,
        isActive: true,
      },
    })
  }

  @Post()
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateMembershipDto) {
    void tenant
    try {
      return await this.prisma.membership.create({
        data: {
          userId: body.userId,
          role: body.role,
          ...(body.tenantId !== undefined ? { tenantId: body.tenantId } : {}),
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          role: true,
          isActive: true,
        },
      })
    } catch (error) {
      if (error instanceof TenantScopeViolationError) {
        throw error
      }
      throw error
    }
  }

  @Patch(':id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateMembershipDto,
  ) {
    void tenant
    return this.prisma.membership.update({
      where: { id },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        role: true,
        isActive: true,
      },
    })
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    void tenant
    const deleted = await this.prisma.membership.delete({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        role: true,
        isActive: true,
      },
    })
    if (!deleted) {
      throw new NotFoundException('Resource not found')
    }
    return deleted
  }
}
