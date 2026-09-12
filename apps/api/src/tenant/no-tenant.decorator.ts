import { SetMetadata } from '@nestjs/common'

export const IS_NO_TENANT_KEY = 'isNoTenant'

/** Authenticated route that must not require an active tenant membership. */
export const NoTenant = () => SetMetadata(IS_NO_TENANT_KEY, true)
