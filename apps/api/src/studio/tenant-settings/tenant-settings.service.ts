import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import type { TenantContext, TenantSettingsView } from '@clivyra/types'
import { hasPermission } from '@clivyra/types'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import {
  digitsOnly,
  isValidCnpj,
  isValidCpf,
  isValidTimezone,
  maskStudioDocument,
} from '../validators'
import { mapTenantSettings } from '../professionals/professional.mapper'
import type { PatchTenantSettingsDto } from '../dto/studio.dto'

const LEGAL_FIELDS = new Set(['legalName', 'documentType', 'documentNumber'])

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async ensureDefaults(tenantId: string, displayName: string) {
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, displayName },
      update: {},
    })
  }

  async get(ctx: TenantContext): Promise<TenantSettingsView> {
    const row = await this.getOrCreate(ctx)
    return mapTenantSettings(row, ctx)
  }

  async patch(ctx: TenantContext, dto: PatchTenantSettingsDto): Promise<TenantSettingsView> {
    this.authz.assert(ctx, 'settings:write')
    const before = await this.getOrCreate(ctx)
    const data: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue
      if (LEGAL_FIELDS.has(key) && !hasPermission(ctx.role, 'tenant:manage')) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
      }
      data[key] = value
    }

    if (typeof data.timezone === 'string' && !isValidTimezone(data.timezone)) {
      throw new BadRequestException({ code: 'INVALID_TIMEZONE', message: 'Invalid timezone' })
    }

    if (data.documentNumber !== undefined || data.documentType !== undefined) {
      const documentType = (data.documentType as string | undefined) ?? before.documentType
      const raw =
        data.documentNumber !== undefined
          ? digitsOnly(String(data.documentNumber))
          : before.documentNumber
      if (raw) {
        if (documentType === 'CPF' && !isValidCpf(raw)) {
          throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: 'Invalid CPF' })
        }
        if (documentType === 'CNPJ' && !isValidCnpj(raw)) {
          throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: 'Invalid CNPJ' })
        }
        data.documentNumber = raw
      }
    }

    if (typeof data.displayName === 'string' && data.displayName.trim().length < 2) {
      throw new BadRequestException({ code: 'INVALID_DISPLAY_NAME', message: 'displayName required' })
    }

    const after = await this.prisma.tenantSettings.update({
      where: { tenantId: ctx.tenantId },
      data,
    })

    await this.audit.record({
      action: 'tenant.settings.updated',
      entityType: 'TenantSettings',
      entityId: ctx.tenantId,
      metadata: { fields: Object.keys(data) },
      changes: {
        before: {
          ...before,
          documentNumber: before.documentNumber
            ? maskStudioDocument(before.documentType, before.documentNumber)
            : null,
        },
        after: {
          ...after,
          documentNumber: after.documentNumber
            ? maskStudioDocument(after.documentType, after.documentNumber)
            : null,
        },
        fields: Object.keys(data),
        maskFields: ['documentNumber', 'phone', 'whatsapp'],
      },
    })

    return mapTenantSettings(after, ctx)
  }

  async setLogoKey(ctx: TenantContext, logoStorageKey: string): Promise<TenantSettingsView> {
    this.authz.assert(ctx, 'settings:write')
    await this.getOrCreate(ctx)
    const after = await this.prisma.tenantSettings.update({
      where: { tenantId: ctx.tenantId },
      data: { logoStorageKey },
    })
    await this.audit.record({
      action: 'tenant.logo.updated',
      entityType: 'TenantSettings',
      entityId: ctx.tenantId,
    })
    return mapTenantSettings(after, ctx)
  }

  private async getOrCreate(ctx: TenantContext) {
    const existing = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    })
    if (existing) return existing
    const tenant = await this.prisma.bypassTenant('tenant-settings-name', () =>
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: ctx.tenantId },
        select: { name: true },
      }),
    )
    return this.prisma.tenantSettings.create({
      data: { tenantId: ctx.tenantId, displayName: tenant.name },
    })
  }
}
