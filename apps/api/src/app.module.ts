import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { HealthController } from './health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { TenantModule } from './tenant/tenant.module'

@Module({
  imports: [
    PrismaModule,
    TenantModule,
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
