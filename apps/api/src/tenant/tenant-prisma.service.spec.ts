import { ForbiddenException } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { TenantPrismaService } from './tenant-prisma.service'

const tenantContext: TenantContext = {
  userId: 'user-1',
  tenantId: 'tenant-a',
  membershipId: 'membership-1',
  role: 'OWNER',
}

describe('TenantPrismaService', () => {
  const service = new TenantPrismaService()

  it('forces where clauses to use the authenticated tenant', () => {
    expect(service.where(tenantContext, { id: 'record-1', tenantId: 'tenant-b' })).toEqual({
      id: 'record-1',
      tenantId: 'tenant-a',
    })
  })

  it('forces create data to use the authenticated tenant', () => {
    expect(service.createData(tenantContext, { name: 'Example', tenantId: 'tenant-b' })).toEqual({
      name: 'Example',
      tenantId: 'tenant-a',
    })
  })

  it('rejects entities from another tenant before mutation', () => {
    expect(() => service.assertTenantOwnership(tenantContext, { tenantId: 'tenant-b' })).toThrow(
      ForbiddenException,
    )
  })
})
