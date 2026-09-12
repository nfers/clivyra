import { ConflictException, Injectable } from '@nestjs/common'
import type { OnboardingStatusView, TenantContext } from '@clivyra/types'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly settings: TenantSettingsService,
  ) {}

  async status(ctx: TenantContext): Promise<OnboardingStatusView> {
    this.authz.assert(ctx, 'settings:read')
    const settings = await this.settings.get(ctx)
    const [activePros, defaultHours] = await Promise.all([
      this.prisma.professional.count({ where: { status: 'ACTIVE' } }),
      this.prisma.workingHours.count({ where: { professionalId: null } }),
    ])
    const steps = {
      studio: Boolean(settings.displayName && settings.displayName.trim().length >= 2),
      professional: activePros >= 1,
      workingHours: defaultHours >= 1,
    }
    return {
      completed: Boolean(settings.onboardingCompletedAt),
      steps,
    }
  }

  async complete(ctx: TenantContext): Promise<OnboardingStatusView> {
    this.authz.assert(ctx, 'settings:write')
    const current = await this.status(ctx)
    if (!current.steps.studio || !current.steps.professional || !current.steps.workingHours) {
      throw new ConflictException({
        code: 'ONBOARDING_INCOMPLETE',
        message: 'Onboarding prerequisites not met',
      })
    }
    await this.prisma.tenantSettings.update({
      where: { tenantId: ctx.tenantId },
      data: { onboardingCompletedAt: new Date() },
    })
    await this.audit.record({
      action: 'tenant.onboarding.completed',
      entityType: 'TenantSettings',
      entityId: ctx.tenantId,
    })
    return { completed: true, steps: current.steps }
  }
}
