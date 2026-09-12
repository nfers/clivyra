import { hasEveryPermission, rolePermissions } from './permissions'

describe('permissions matrix', () => {
  it('keeps clinical record and finance permissions independent', () => {
    expect(rolePermissions('PROFESSIONAL')).toContain('clinical-record:read')
    expect(rolePermissions('PROFESSIONAL')).not.toContain('finance:read')
  })

  it('allows owner to manage users and settings', () => {
    expect(hasEveryPermission('OWNER', ['users:write', 'settings:write'])).toBe(true)
  })

  it('denies reception access to clinical and finance permissions', () => {
    expect(hasEveryPermission('RECEPTION', ['clinical-record:read'])).toBe(false)
    expect(hasEveryPermission('RECEPTION', ['finance:read'])).toBe(false)
  })
})
