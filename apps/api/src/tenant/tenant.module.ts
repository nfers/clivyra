import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantContextGuard } from './tenant-context.guard'
import { TenantMembershipRepository } from './tenant-membership.repository'
import { TenantPrismaService } from './tenant-prisma.service'

@Module({
  imports: [PrismaModule],
  providers: [TenantContextGuard, TenantMembershipRepository, TenantPrismaService],
  exports: [TenantContextGuard, TenantMembershipRepository, TenantPrismaService],
})
export class TenantModule {}
