import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ProfessionalView, TenantContext } from '@clivyra/types'
import { hasPermission } from '@clivyra/types'
import type { CouncilType, ProfessionalStatus } from '@prisma/client'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import { FILE_STORAGE_PORT, type FileStoragePort, tenantStorageKey } from '../../storage/file-storage.port'
import { validateImageUpload } from '../../storage/upload.validation'
import type {
  CreateProfessionalDto,
  LinkMembershipDto,
  ListProfessionalsQueryDto,
  PatchProfessionalDto,
  PatchProfessionalMeDto,
} from '../dto/studio.dto'
import { normalizeCouncilNumber } from '../validators'
import { mapProfessional, canSeeProfessionalSensitive } from './professional.mapper'
import { ProfessionalPolicy } from './professional.policy'

const PROFESSIONAL_INCLUDE = {
  services: { select: { serviceId: true } },
} as const

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly policy: ProfessionalPolicy,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
  ) {}

  async list(ctx: TenantContext, query: ListProfessionalsQueryDto) {
    this.authz.assert(ctx, 'professionals:read')
    const rows = await this.prisma.professional.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.serviceId
          ? { services: { some: { serviceId: query.serviceId } } }
          : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: 50,
      include: PROFESSIONAL_INCLUDE,
    })
    return rows.map((row) => mapProfessional(row, ctx))
  }

  async getById(ctx: TenantContext, id: string): Promise<ProfessionalView> {
    this.authz.assert(ctx, 'professionals:read')
    const row = await this.requireProfessional(id)
    const mapped = mapProfessional(row, ctx)
    return {
      ...mapped,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async getMe(ctx: TenantContext): Promise<ProfessionalView> {
    this.authz.assert(ctx, 'professionals:self')
    const row = await this.prisma.professional.findFirst({
      where: { membershipId: ctx.membershipId },
      include: PROFESSIONAL_INCLUDE,
    })
    if (!row) throw new NotFoundException()
    const mapped = mapProfessional(row, ctx)
    return {
      ...mapped,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async create(ctx: TenantContext, dto: CreateProfessionalDto) {
    this.authz.assert(ctx, 'professionals:write')
    const specialties = this.policy.assertSpecialties(dto.specialties)
    if (dto.membershipId) {
      await this.assertLinkableMembership(ctx, dto.membershipId)
    }
    if (dto.serviceIds?.length) {
      await this.assertServicesInTenant(dto.serviceIds)
    }

    const activation = this.policy.resolveActivation({
      displayName: dto.displayName,
      councilType: dto.councilType,
      councilNumber: dto.councilNumber,
      councilState: dto.councilState,
      councilNotApplicable: dto.councilNotApplicable,
      requestedStatus: dto.status ?? (dto.councilNotApplicable || dto.councilNumber ? 'ACTIVE' : 'DRAFT'),
    })

    const councilNumber = activation.clearCouncil
      ? null
      : dto.councilNumber
        ? normalizeCouncilNumber(dto.councilNumber)
        : null

    try {
      const created = await this.prisma.professional.create({
        data: {
          displayName: dto.displayName.trim(),
          fullName: dto.fullName?.trim(),
          councilType: activation.clearCouncil ? null : ((dto.councilType as CouncilType | undefined) ?? null),
          councilNumber,
          councilState: activation.clearCouncil ? null : (dto.councilState?.toUpperCase() ?? null),
          specialties,
          bio: dto.bio,
          phone: dto.phone,
          color: dto.color,
          membershipId: dto.membershipId,
          status: activation.status as ProfessionalStatus,
          services: dto.serviceIds?.length
            ? {
                create: dto.serviceIds.map((serviceId) => ({
                  serviceId,
                  tenantId: ctx.tenantId,
                })),
              }
            : undefined,
        },
        include: PROFESSIONAL_INCLUDE,
      })

      await this.audit.record({
        action: 'professional.created',
        entityType: 'Professional',
        entityId: created.id,
        metadata: { status: created.status },
      })

      return mapProfessional(created, ctx)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  async patch(ctx: TenantContext, id: string, dto: PatchProfessionalDto) {
    this.authz.assert(ctx, 'professionals:write')
    const before = await this.requireProfessional(id)
    return this.applyPatch(ctx, before, dto, true)
  }

  async patchMe(ctx: TenantContext, dto: PatchProfessionalMeDto) {
    this.authz.assert(ctx, 'professionals:self')
    this.policy.assertMeAllowlist(dto as Record<string, unknown>)
    const before = await this.prisma.professional.findFirst({
      where: { membershipId: ctx.membershipId },
      include: PROFESSIONAL_INCLUDE,
    })
    if (!before) throw new NotFoundException()
    return this.applyPatch(ctx, before, dto, false)
  }

  async linkMembership(ctx: TenantContext, id: string, dto: LinkMembershipDto) {
    this.authz.assert(ctx, 'professionals:write')
    await this.requireProfessional(id)
    await this.assertLinkableMembership(ctx, dto.membershipId)
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { membershipId: dto.membershipId },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.linked',
      entityType: 'Professional',
      entityId: id,
      metadata: { membershipId: dto.membershipId },
    })
    return mapProfessional(updated, ctx)
  }

  async unlinkMembership(ctx: TenantContext, id: string) {
    this.authz.assert(ctx, 'professionals:write')
    await this.requireProfessional(id)
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { membershipId: null },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.unlinked',
      entityType: 'Professional',
      entityId: id,
    })
    return mapProfessional(updated, ctx)
  }

  async deactivate(ctx: TenantContext, id: string) {
    this.authz.assert(ctx, 'professionals:write')
    await this.requireProfessional(id)
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.deactivated',
      entityType: 'Professional',
      entityId: id,
    })
    return mapProfessional(updated, ctx)
  }

  async activate(ctx: TenantContext, id: string) {
    this.authz.assert(ctx, 'professionals:write')
    const before = await this.requireProfessional(id)
    const activation = this.policy.resolveActivation({
      displayName: before.displayName,
      councilType: before.councilType,
      councilNumber: before.councilNumber,
      councilState: before.councilState,
      requestedStatus: 'ACTIVE',
    })
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { status: activation.status },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.activated',
      entityType: 'Professional',
      entityId: id,
    })
    return mapProfessional(updated, ctx)
  }

  async uploadSignature(
    ctx: TenantContext,
    id: string | 'me',
    file: { buffer: Buffer; originalname?: string },
  ) {
    const professional = await this.resolveWritableProfessional(ctx, id)
    const validated = validateImageUpload(file.buffer, 'signature', file.originalname)
    const key = tenantStorageKey(
      ctx.tenantId,
      'professionals',
      professional.id,
      `signature.${validated.extension}`,
    )
    await this.storage.put({
      key,
      body: file.buffer,
      contentType: validated.contentType,
      tenantId: ctx.tenantId,
    })
    if (professional.signatureStorageKey && professional.signatureStorageKey !== key) {
      await this.storage.delete(professional.signatureStorageKey).catch(() => undefined)
    }
    const updated = await this.prisma.professional.update({
      where: { id: professional.id },
      data: { signatureStorageKey: key },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.signature.uploaded',
      entityType: 'Professional',
      entityId: professional.id,
    })
    return mapProfessional(updated, ctx)
  }

  async getSignatureUrl(ctx: TenantContext, id: string | 'me') {
    const professional = await this.resolveReadableSignature(ctx, id)
    if (!professional.signatureStorageKey) throw new NotFoundException()
    const url = await this.storage.getSignedUrl(professional.signatureStorageKey, 300)
    await this.audit.record({
      action: 'professional.signature.viewed',
      entityType: 'Professional',
      entityId: professional.id,
    })
    return { url, expiresInSeconds: 300 }
  }

  async deleteSignature(ctx: TenantContext, id: string | 'me') {
    const professional = await this.resolveWritableProfessional(ctx, id)
    if (professional.signatureStorageKey) {
      await this.storage.delete(professional.signatureStorageKey).catch(() => undefined)
    }
    const updated = await this.prisma.professional.update({
      where: { id: professional.id },
      data: { signatureStorageKey: null },
      include: PROFESSIONAL_INCLUDE,
    })
    await this.audit.record({
      action: 'professional.signature.deleted',
      entityType: 'Professional',
      entityId: professional.id,
    })
    return mapProfessional(updated, ctx)
  }

  /**
   * Called when a PROFESSIONAL invitation is accepted.
   * Uses bypass because accept runs without an active tenant ALS for the new membership write path,
   * but we receive tenantId explicitly from the event.
   */
  async createDraftForMembership(input: {
    tenantId: string
    membershipId: string
    displayName: string
  }): Promise<void> {
    await this.prisma.bypassTenant('professional-draft-on-invite', async () => {
      const existing = await this.prisma.professional.findFirst({
        where: { tenantId: input.tenantId, membershipId: input.membershipId },
        select: { id: true },
      })
      if (existing) return
      await this.prisma.professional.create({
        data: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          displayName: input.displayName.trim() || 'Profissional',
          status: 'DRAFT',
          specialties: [],
        },
      })
    })
  }

  private async applyPatch(
    ctx: TenantContext,
    before: Awaited<ReturnType<ProfessionalsService['requireProfessional']>>,
    dto: PatchProfessionalDto | PatchProfessionalMeDto,
    allowServices: boolean,
  ) {
    const specialties =
      dto.specialties !== undefined ? this.policy.assertSpecialties(dto.specialties) : undefined
    if (allowServices && 'serviceIds' in dto && dto.serviceIds) {
      await this.assertServicesInTenant(dto.serviceIds)
    }

    const nextDisplayName = dto.displayName?.trim() ?? before.displayName
    const activation = this.policy.resolveActivation({
      displayName: nextDisplayName,
      councilType: dto.councilType !== undefined ? dto.councilType : before.councilType,
      councilNumber: dto.councilNumber !== undefined ? dto.councilNumber : before.councilNumber,
      councilState: dto.councilState !== undefined ? dto.councilState : before.councilState,
      councilNotApplicable: dto.councilNotApplicable,
      requestedStatus:
        'status' in dto && dto.status
          ? dto.status
          : before.status === 'ACTIVE'
            ? 'ACTIVE'
            : dto.councilNotApplicable || dto.councilNumber
              ? 'ACTIVE'
              : before.status,
    })

    const data: Record<string, unknown> = {}
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim()
    if (dto.fullName !== undefined) data.fullName = dto.fullName
    if (dto.bio !== undefined) data.bio = dto.bio
    if (dto.phone !== undefined) data.phone = dto.phone
    if (dto.color !== undefined) data.color = dto.color
    if (specialties !== undefined) data.specialties = specialties
    if (activation.clearCouncil) {
      data.councilType = null
      data.councilNumber = null
      data.councilState = null
    } else {
      if (dto.councilType !== undefined) data.councilType = dto.councilType
      if (dto.councilNumber !== undefined) {
        data.councilNumber = dto.councilNumber ? normalizeCouncilNumber(dto.councilNumber) : null
      }
      if (dto.councilState !== undefined) {
        data.councilState = dto.councilState ? dto.councilState.toUpperCase() : null
      }
    }
    if (allowServices && 'status' in dto && dto.status) {
      data.status = activation.status
    } else if (!allowServices) {
      // me endpoint cannot set status directly; auto-upgrade DRAFT→ACTIVE when complete
      if (before.status === 'DRAFT' && activation.status === 'ACTIVE') {
        data.status = 'ACTIVE'
      }
    } else if (activation.status !== before.status && dto.councilNotApplicable) {
      data.status = activation.status
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (allowServices && 'serviceIds' in dto && dto.serviceIds) {
          await tx.professionalService.deleteMany({ where: { professionalId: before.id } })
          if (dto.serviceIds.length) {
            await tx.professionalService.createMany({
              data: dto.serviceIds.map((serviceId) => ({
                professionalId: before.id,
                serviceId,
                tenantId: ctx.tenantId,
              })),
            })
          }
        }
        return tx.professional.update({
          where: { id: before.id },
          data,
          include: PROFESSIONAL_INCLUDE,
        })
      })

      await this.audit.record({
        action: 'professional.updated',
        entityType: 'Professional',
        entityId: before.id,
        metadata: { fields: Object.keys(data) },
        changes: {
          before,
          after: updated,
          fields: Object.keys(data),
          maskFields: ['councilNumber', 'phone'],
        },
      })

      return mapProfessional(updated, ctx)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  private async requireProfessional(id: string) {
    const row = await this.prisma.professional.findFirst({
      where: { id },
      include: PROFESSIONAL_INCLUDE,
    })
    if (!row) throw new NotFoundException()
    return row
  }

  private async resolveWritableProfessional(ctx: TenantContext, id: string | 'me') {
    if (id === 'me') {
      this.authz.assert(ctx, 'professionals:self')
      const row = await this.prisma.professional.findFirst({
        where: { membershipId: ctx.membershipId },
        include: PROFESSIONAL_INCLUDE,
      })
      if (!row) throw new NotFoundException()
      return row
    }
    const row = await this.requireProfessional(id)
    const isSelf = row.membershipId === ctx.membershipId
    if (!hasPermission(ctx.role, 'professionals:write') && !isSelf) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
    if (isSelf && !hasPermission(ctx.role, 'professionals:write')) {
      this.authz.assert(ctx, 'professionals:self')
    } else {
      this.authz.assert(ctx, 'professionals:write')
    }
    return row
  }

  private async resolveReadableSignature(ctx: TenantContext, id: string | 'me') {
    const row =
      id === 'me'
        ? await this.prisma.professional.findFirst({
            where: { membershipId: ctx.membershipId },
            include: PROFESSIONAL_INCLUDE,
          })
        : await this.requireProfessional(id)
    if (!row) throw new NotFoundException()
    if (!canSeeProfessionalSensitive(ctx, row.membershipId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
    return row
  }

  private async assertLinkableMembership(ctx: TenantContext, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, isActive: true },
      select: { id: true, role: true, tenantId: true },
    })
    if (!membership) throw new NotFoundException()
    this.policy.assertCanLinkRole(membership.role)
    const taken = await this.prisma.professional.findFirst({
      where: { membershipId },
      select: { id: true },
    })
    if (taken) {
      throw new ConflictException({
        code: 'MEMBERSHIP_ALREADY_LINKED',
        message: 'Membership already linked to a professional',
      })
    }
  }

  private async assertServicesInTenant(serviceIds: string[]) {
    const unique = [...new Set(serviceIds)]
    const count = await this.prisma.service.count({
      where: { id: { in: unique }, isActive: true },
    })
    if (count !== unique.length) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE',
        message: 'One or more services are invalid for this tenant',
      })
    }
  }

  private rethrowUnique(error: unknown): void {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      throw new ConflictException({
        code: 'PROFESSIONAL_CONFLICT',
        message: 'Professional already exists with this council or membership',
      })
    }
  }
}
