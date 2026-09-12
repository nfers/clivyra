import { Global, Module, OnModuleInit } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AUTH_EVENTS_PORT } from '../auth/auth-events.port'
import { PrismaModule } from '../prisma/prisma.module'
import { setBypassAuditHook } from '../prisma/tenant-scoped.extension'
import { AuditController } from './audit.controller'
import { AuditInterceptor } from './audit.interceptor'
import { AuditQueryService } from './audit-query.service'
import { AuditService } from './audit.service'
import { AuthEventsAuditAdapter } from './auth-events.audit-adapter'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    AuthEventsAuditAdapter,
    {
      provide: AUTH_EVENTS_PORT,
      useExisting: AuthEventsAuditAdapter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, AuditQueryService, AUTH_EVENTS_PORT],
})
export class AuditModule implements OnModuleInit {
  constructor(private readonly audit: AuditService) {}

  onModuleInit(): void {
    setBypassAuditHook((reason, tenantId) => {
      if (!tenantId) return
      void this.audit.recordAccess({
        action: 'system.tenant_bypass',
        entityType: 'System',
        actor: { type: 'SYSTEM', reason: `bypass:${reason}` },
        tenantId,
        metadata: { reason },
      })
    })
  }
}
