import { SetMetadata } from '@nestjs/common'
import type { Permission } from './permissions'

export const REQUIRED_PERMISSIONS_METADATA_KEY = 'clivyra.requiredPermissions'

export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions)
