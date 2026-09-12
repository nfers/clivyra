import type { MembershipRole } from '@prisma/client'

export const PERMISSIONS = [
  'agenda:read',
  'agenda:write',
  'clients:read',
  'clients:write',
  'finance:read',
  'finance:write',
  'clinical-record:read',
  'clinical-record:write',
  'settings:read',
  'settings:write',
  'users:read',
  'users:write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS = {
  OWNER: PERMISSIONS,
  ADMIN: [
    'agenda:read',
    'agenda:write',
    'clients:read',
    'clients:write',
    'finance:read',
    'finance:write',
    'clinical-record:read',
    'clinical-record:write',
    'settings:read',
    'users:read',
    'users:write',
  ],
  PROFESSIONAL: [
    'agenda:read',
    'agenda:write',
    'clients:read',
    'clients:write',
    'clinical-record:read',
    'clinical-record:write',
    'settings:read',
  ],
  RECEPTION: ['agenda:read', 'agenda:write', 'clients:read', 'clients:write', 'settings:read'],
} satisfies Record<MembershipRole, readonly Permission[]>

export function rolePermissions(role: MembershipRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

export function hasEveryPermission(role: MembershipRole, permissions: readonly Permission[]): boolean {
  const granted = new Set(rolePermissions(role))

  return permissions.every((permission) => granted.has(permission))
}
