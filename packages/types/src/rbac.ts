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
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Role → permission map for P0.
 * D4: ADMIN keeps clinical-record access.
 * `tenant:manage` arrives in CLI-16 and will be OWNER-only.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
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
