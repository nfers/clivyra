import { ForbiddenException } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { AuthorizationService } from './authorization.service'

describe('AuthorizationService', () => {
  const authz = new AuthorizationService()
  const owner: TenantContext = {
    userId: 'u1',
    tenantId: 't1',
    membershipId: 'm1',
    role: 'OWNER',
  }
  const reception: TenantContext = {
    userId: 'u2',
    tenantId: 't1',
    membershipId: 'm2',
    role: 'RECEPTION',
  }

  it('assert throws for missing permission', () => {
    expect(() => authz.assert(reception, 'finance:read')).toThrow(ForbiddenException)
    expect(() => authz.assert(owner, 'finance:read')).not.toThrow()
  })

  it('project removes fields the role cannot see', () => {
    const dto = { name: 'Ana', document: '123', balance: 10 }
    const projected = authz.project(reception, dto, {
      document: 'clinical-record:read',
      balance: 'finance:read',
    })
    expect(projected).toEqual({ name: 'Ana' })
  })
})
