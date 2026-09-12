import { SetMetadata } from '@nestjs/common'
import type { Permission } from '@clivyra/types'

export const REQUIRED_PERMISSIONS_METADATA_KEY = 'clivyra.requiredPermissions'
export const REQUIRED_ANY_PERMISSION_METADATA_KEY = 'clivyra.requiredAnyPermission'

/**
 * Declare required permissions (AND). Empty list = any authenticated tenant role.
 * Routes without this (and without @Public / @NoTenant) are denied as undeclared.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions)

/** Declare that any one of the listed permissions is sufficient (OR). */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSION_METADATA_KEY, permissions)
