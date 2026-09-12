import { ForbiddenException, Injectable } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'

type ObjectRecord = Record<string, unknown>

function withoutClientTenantId<TValue extends ObjectRecord>(value: TValue): Omit<TValue, 'tenantId'> {
  const safeValue = { ...value }
  delete safeValue.tenantId

  return safeValue as Omit<TValue, 'tenantId'>
}

@Injectable()
export class TenantPrismaService {
  where<TWhere extends ObjectRecord>(
    tenant: TenantContext,
    where?: TWhere,
  ): Omit<TWhere, 'tenantId'> & { tenantId: string } {
    const safeWhere = withoutClientTenantId(where ?? ({} as TWhere))

    return {
      ...safeWhere,
      tenantId: tenant.tenantId,
    } as Omit<TWhere, 'tenantId'> & { tenantId: string }
  }

  createData<TData extends ObjectRecord>(
    tenant: TenantContext,
    data: TData,
  ): Omit<TData, 'tenantId'> & { tenantId: string } {
    const safeData = withoutClientTenantId(data)

    return {
      ...safeData,
      tenantId: tenant.tenantId,
    } as Omit<TData, 'tenantId'> & { tenantId: string }
  }

  assertTenantOwnership(tenant: TenantContext, entity: { tenantId: string } | null | undefined) {
    if (!entity || entity.tenantId !== tenant.tenantId) {
      throw new ForbiddenException('Resource does not belong to the active tenant')
    }
  }
}
