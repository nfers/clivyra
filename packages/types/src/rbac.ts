import type { Role } from './tenant'

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
  'audit:read',
  'tenant:manage',
  'professionals:read',
  'professionals:write',
  'professionals:self',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Role → permission map for P0.
 * D4: ADMIN keeps clinical-record access.
 * `tenant:manage` is OWNER-only (CLI-16).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((permission) => permission !== 'tenant:manage'),
  PROFESSIONAL: [
    'agenda:read',
    'agenda:write',
    'clients:read',
    'clients:write',
    'clinical-record:read',
    'clinical-record:write',
    'settings:read',
    'professionals:read',
    'professionals:self',
  ],
  RECEPTION: [
    'agenda:read',
    'agenda:write',
    'clients:read',
    'clients:write',
    'settings:read',
    'professionals:read',
  ],
}

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  ADMIN: 2,
  PROFESSIONAL: 1,
  RECEPTION: 1,
}

export function rolePermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function hasEveryPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

/** OWNER may assign any role; ADMIN may assign any role except OWNER; others never. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === 'OWNER') return true
  if (actor === 'ADMIN') return target !== 'OWNER'
  return false
}

export const ROLES = ['OWNER', 'ADMIN', 'PROFESSIONAL', 'RECEPTION'] as const satisfies readonly Role[]
