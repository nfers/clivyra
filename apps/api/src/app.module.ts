import { MiddlewareConsumer, Module, NestModule, type Type } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { RequestContextMiddleware } from './common/request-context/request-context.middleware'
import { ContextAlsInterceptor } from './common/request-context/context-als.interceptor'
import { TenantExceptionFilter } from './common/filters/tenant-exception.filter'
import { HealthController } from './health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { TenantModule } from './tenant/tenant.module'
import { TestMembershipsController } from './test-support/test-memberships.controller'

const testControllers: Type<unknown>[] =
  process.env.NODE_ENV === 'test' ? [TestMembershipsController] : []

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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*')
  }
}
