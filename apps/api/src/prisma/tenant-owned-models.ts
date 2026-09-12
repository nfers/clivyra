export const TENANT_OWNED_MODELS = ['Membership', 'RefreshSession'] as const

export const GLOBAL_MODELS = ['SystemMetadata', 'User', 'Tenant', 'PasswordResetToken'] as const

export type TenantOwnedModel = (typeof TENANT_OWNED_MODELS)[number]
export type GlobalModel = (typeof GLOBAL_MODELS)[number]

export function isTenantOwnedModel(model: string): model is TenantOwnedModel {
  return (TENANT_OWNED_MODELS as readonly string[]).includes(model)
}

export function isGlobalModel(model: string): model is GlobalModel {
  return (GLOBAL_MODELS as readonly string[]).includes(model)
}
