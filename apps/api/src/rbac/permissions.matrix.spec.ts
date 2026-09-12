import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  canAssignRole,
  hasEveryPermission,
  hasPermission,
  type Permission,
  type Role,
} from '@clivyra/types'

/**
 * Explicit role × permission matrix. Update this table when the catalog changes.
 * Cells must match ROLE_PERMISSIONS — the test fails if either diverges.
 */
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
  OWNER: Object.fromEntries(PERMISSIONS.map((p) => [p, true])) as Record<Permission, boolean>,
  ADMIN: Object.fromEntries(PERMISSIONS.map((p) => [p, true])) as Record<Permission, boolean>,
  PROFESSIONAL: {
    'agenda:read': true,
    'agenda:write': true,
    'clients:read': true,
    'clients:write': true,
    'finance:read': false,
    'finance:write': false,
    'clinical-record:read': true,
    'clinical-record:write': true,
    'settings:read': true,
    'settings:write': false,
    'users:read': false,
    'users:write': false,
  },
  RECEPTION: {
    'agenda:read': true,
    'agenda:write': true,
    'clients:read': true,
    'clients:write': true,
    'finance:read': false,
    'finance:write': false,
    'clinical-record:read': false,
    'clinical-record:write': false,
    'settings:read': true,
    'settings:write': false,
    'users:read': false,
    'users:write': false,
  },
}

describe('permissions matrix', () => {
  it.each(ROLES)('matches explicit cells for %s', (role) => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(role, permission)).toBe(EXPECTED[role][permission])
      expect(ROLE_PERMISSIONS[role].includes(permission)).toBe(EXPECTED[role][permission])
    }
  })

  it('keeps finance and clinical-record independent', () => {
    expect(hasPermission('PROFESSIONAL', 'clinical-record:read')).toBe(true)
    expect(hasPermission('PROFESSIONAL', 'finance:read')).toBe(false)
    expect(hasPermission('RECEPTION', 'clinical-record:read')).toBe(false)
    expect(hasPermission('RECEPTION', 'finance:read')).toBe(false)
  })

  it('hasEveryPermission requires all listed permissions', () => {
    expect(hasEveryPermission('RECEPTION', ['agenda:read', 'clients:read'])).toBe(true)
    expect(hasEveryPermission('RECEPTION', ['agenda:read', 'finance:read'])).toBe(false)
  })
})

describe('canAssignRole', () => {
  it('allows OWNER to assign any role', () => {
    for (const role of ROLES) {
      expect(canAssignRole('OWNER', role)).toBe(true)
    }
  })

  it('allows ADMIN to assign non-OWNER roles only', () => {
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false)
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(true)
    expect(canAssignRole('ADMIN', 'PROFESSIONAL')).toBe(true)
    expect(canAssignRole('ADMIN', 'RECEPTION')).toBe(true)
  })

  it('denies PROFESSIONAL and RECEPTION from assigning roles', () => {
    expect(canAssignRole('PROFESSIONAL', 'RECEPTION')).toBe(false)
    expect(canAssignRole('RECEPTION', 'PROFESSIONAL')).toBe(false)
  })
})
