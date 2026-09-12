import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { RoomView, TenantContext } from '@clivyra/types'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import type { CreateRoomDto, PatchRoomDto } from '../dto/studio.dto'

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<RoomView[]> {
    this.authz.assert(ctx, 'settings:read')
    const rows = await this.prisma.room.findMany({ orderBy: { name: 'asc' } })
    return rows.map(mapRoom)
  }

  async create(ctx: TenantContext, dto: CreateRoomDto): Promise<RoomView> {
    this.authz.assert(ctx, 'settings:write')
    await this.assertUniqueName(dto.name)
    try {
      const created = await this.prisma.room.create({
        data: {
          tenantId: ctx.tenantId,
          name: dto.name.trim(),
          capacity: dto.capacity ?? 1,
        },
      })
      await this.audit.record({
        action: 'room.created',
        entityType: 'Room',
        entityId: created.id,
        metadata: { name: created.name },
      })
      return mapRoom(created)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  async patch(ctx: TenantContext, id: string, dto: PatchRoomDto): Promise<RoomView> {
    this.authz.assert(ctx, 'settings:write')
    const before = await this.require(id)
    if (dto.name && dto.name.trim().toLowerCase() !== before.name.toLowerCase()) {
      await this.assertUniqueName(dto.name)
    }
    try {
      const updated = await this.prisma.room.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      })
      await this.audit.record({
        action: 'room.updated',
        entityType: 'Room',
        entityId: id,
        metadata: { fields: Object.keys(dto) },
        changes: { before, after: updated, fields: Object.keys(dto) },
      })
      return mapRoom(updated)
    } catch (error) {
      this.rethrowUnique(error)
      throw error
    }
  }

  async deactivate(ctx: TenantContext, id: string): Promise<RoomView> {
    this.authz.assert(ctx, 'settings:write')
    await this.require(id)
    const updated = await this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    })
    await this.audit.record({
      action: 'room.deactivated',
      entityType: 'Room',
      entityId: id,
    })
    return mapRoom(updated)
  }

  private async assertUniqueName(name: string) {
    const all = await this.prisma.room.findMany({ select: { id: true, name: true } })
    if (all.some((row) => row.name.toLowerCase() === name.trim().toLowerCase())) {
      throw new ConflictException({ code: 'ROOM_NAME_TAKEN', message: 'Room name already exists' })
    }
  }

  private async require(id: string) {
    const row = await this.prisma.room.findFirst({ where: { id } })
    if (!row) throw new NotFoundException()
    return row
  }

  private rethrowUnique(error: unknown): void {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      throw new ConflictException({ code: 'ROOM_NAME_TAKEN', message: 'Room name already exists' })
    }
  }
}

function mapRoom(row: { id: string; name: string; capacity: number; isActive: boolean }): RoomView {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    isActive: row.isActive,
  }
}
