import { Module, type Type } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuditModule } from './audit/audit.module'
import { AuthGuard } from './auth/auth.guard'
import { AuthModule } from './auth/auth.module'
import { ContextAlsInterceptor } from './common/request-context/context-als.interceptor'
import { TenantExceptionFilter } from './common/filters/tenant-exception.filter'
import { HealthController } from './health.controller'
import { MailerModule } from './mailer/mailer.module'
import { PrismaModule } from './prisma/prisma.module'
import { RbacGuard } from './rbac/rbac.guard'
import { RbacModule } from './rbac/rbac.module'
import { TenantContextGuard } from './tenant/tenant-context.guard'
import { TenantModule } from './tenant/tenant.module'
import { TestMembershipsController } from './test-support/test-memberships.controller'
import { TestRbacProbeController } from './test-support/test-rbac-probe.controller'
import { UsersModule } from './users/users.module'

const testControllers: Type<unknown>[] =
  process.env.NODE_ENV === 'test'
    ? [TestMembershipsController, TestRbacProbeController]
    : []

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RbacModule,
    MailerModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [HealthController, ...testControllers],
  providers: [
    {
      provide: APP_FILTER,
      useClass: TenantExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ContextAlsInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
