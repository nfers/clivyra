import { Injectable, Module, OnModuleInit } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import {
  registerAuthEventHandler,
  type AuthEventPayload,
} from '../auth/auth-events.port'
import { PrismaModule } from '../prisma/prisma.module'
import { RbacModule } from '../rbac/rbac.module'
import { StorageModule } from '../storage/storage.module'
import { OnboardingService } from './onboarding/onboarding.service'
import { ProfessionalPolicy } from './professionals/professional.policy'
import { ProfessionalsController } from './professionals/professionals.controller'
import { ProfessionalsService } from './professionals/professionals.service'
import { RoomsController } from './rooms/rooms.controller'
import { RoomsService } from './rooms/rooms.service'
import { ServicesController } from './services/services.controller'
import { ServicesCatalogService } from './services/services.service'
import { TenantSettingsController } from './tenant-settings/tenant-settings.controller'
import { TenantSettingsService } from './tenant-settings/tenant-settings.service'
import { WorkingHoursController } from './working-hours/working-hours.controller'
import { WorkingHoursPolicy } from './working-hours/working-hours.policy'
import { WorkingHoursService } from './working-hours/working-hours.service'

@Injectable()
export class ProfessionalDraftOnInviteListener implements OnModuleInit {
  private unregister?: () => void

  constructor(private readonly professionals: ProfessionalsService) {}

  onModuleInit(): void {
    this.unregister = registerAuthEventHandler((event, payload) => {
      if (event !== 'users.invitation.accepted') return
      if (payload.role !== 'PROFESSIONAL') return
      void this.handleAccepted(payload)
    })
  }

  private async handleAccepted(payload: AuthEventPayload): Promise<void> {
    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : undefined
    const membershipId =
      typeof payload.membershipId === 'string' ? payload.membershipId : undefined
    const displayName =
      typeof payload.displayName === 'string' ? payload.displayName : 'Profissional'
    if (!tenantId || !membershipId) return
    await this.professionals.createDraftForMembership({
      tenantId,
      membershipId,
      displayName,
    })
  }
}

@Module({
  imports: [PrismaModule, RbacModule, AuditModule, StorageModule],
  controllers: [
    TenantSettingsController,
    ProfessionalsController,
    ServicesController,
    RoomsController,
    WorkingHoursController,
  ],
  providers: [
    TenantSettingsService,
    OnboardingService,
    ProfessionalsService,
    ProfessionalPolicy,
    ServicesCatalogService,
    RoomsService,
    WorkingHoursService,
    WorkingHoursPolicy,
    ProfessionalDraftOnInviteListener,
  ],
  exports: [ProfessionalsService, TenantSettingsService],
})
export class StudioModule {}
