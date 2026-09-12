import { Module, type Type } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthGuard } from './auth/auth.guard'
import { AuthModule } from './auth/auth.module'
import { ContextAlsInterceptor } from './common/request-context/context-als.interceptor'
import { TenantExceptionFilter } from './common/filters/tenant-exception.filter'
import { HealthController } from './health.controller'
import { MailerModule } from './mailer/mailer.module'
import { PrismaModule } from './prisma/prisma.module'
import { TenantModule } from './tenant/tenant.module'
import { TestMembershipsController } from './test-support/test-memberships.controller'

const testControllers: Type<unknown>[] =
  process.env.NODE_ENV === 'test' ? [TestMembershipsController] : []

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuthModule,
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
  ],
})
export class AppModule {}
