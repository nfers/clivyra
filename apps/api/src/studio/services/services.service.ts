import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ServiceView, TenantContext } from '@clivyra/types'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import type { CreateServiceDto, PatchServiceDto } from '../dto/studio.dto'

@Injectable()
export class ServicesCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<ServiceView[]> {
    this.authz.assert(ctx, 'settings:read')
    const rows = await this.prisma.service.findMany({ orderBy: { name: 'asc' } })
    return rows.map(mapService)
  }

  async create(ctx: TenantContext, dto: CreateServiceDto): Promise<ServiceView> {
    this.authz.assert(ctx, 'settings:write')
    this.assertDuration(dto.durationMinutes)
    await this.assertUniqueName(dto.name)
    try {
      const created = await this.prisma.service.create({
        data: {
          tenantId: ctx.tenantId,
          name: dto.name.trim(),
          description: dto.description,
          durationMinutes: dto.durationMinutes,
          category: dto.category,
        },
      })
      await this.audit.record({
        action: 'service.created',
        entityType: 'Service',
        entityId: created.id,
        metadata: { name: created.name },
      })
      return mapService(created)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  async patch(ctx: TenantContext, id: string, dto: PatchServiceDto): Promise<ServiceView> {
    this.authz.assert(ctx, 'settings:write')
    const before = await this.require(id)
    if (dto.durationMinutes !== undefined) this.assertDuration(dto.durationMinutes)
    if (dto.name && dto.name.trim().toLowerCase() !== before.name.toLowerCase()) {
      await this.assertUniqueName(dto.name)
    }
    try {
      const updated = await this.prisma.service.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      })
      await this.audit.record({
        action: 'service.updated',
        entityType: 'Service',
        entityId: id,
        metadata: { fields: Object.keys(dto) },
        changes: { before, after: updated, fields: Object.keys(dto) },
      })
      return mapService(updated)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  async deactivate(ctx: TenantContext, id: string): Promise<ServiceView> {
    this.authz.assert(ctx, 'settings:write')
    await this.require(id)
    const updated = await this.prisma.service.update({
      where: { id },
      data: { isActive: false },
    })
    await this.audit.record({
      action: 'service.deactivated',
      entityType: 'Service',
      entityId: id,
    })
    return mapService(updated)
  }

  private assertDuration(value: number) {
    if (value < 5 || value > 480 || value % 5 !== 0) {
      throw new BadRequestException({
        code: 'INVALID_DURATION',
        message: 'durationMinutes must be 5..480 in steps of 5',
      })
    }
  }

  private async assertUniqueName(name: string) {
    const all = await this.prisma.service.findMany({ select: { id: true, name: true } })
    const taken = all.some((row) => row.name.toLowerCase() === name.trim().toLowerCase())
    if (taken) {
      throw new ConflictException({ code: 'SERVICE_NAME_TAKEN', message: 'Service name already exists' })
    }
  }

  private async require(id: string) {
    const row = await this.prisma.service.findFirst({ where: { id } })
    if (!row) throw new NotFoundException()
    return row
  }

  private rethrowUnique(error: unknown): void {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      throw new ConflictException({ code: 'SERVICE_NAME_TAKEN', message: 'Service name already exists' })
    }
  }
}

function mapService(row: {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  category: string | null
  isActive: boolean
}): ServiceView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.durationMinutes,
    category: row.category,
    isActive: row.isActive,
  }
}
