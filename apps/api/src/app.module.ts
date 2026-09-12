import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { HealthController } from './health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { RbacModule } from './rbac/rbac.module'
import { TenantModule } from './tenant/tenant.module'

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuthModule,
    RbacModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [HealthController],
})
export class AppModule {}
