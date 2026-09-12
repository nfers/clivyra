import type { ProfessionalListItemView, TenantContext, TenantSettingsView } from '@clivyra/types'
import { hasPermission } from '@clivyra/types'
import { maskStudioDocument } from '../validators'

type ProfessionalRow = {
  id: string
  displayName: string
  fullName: string | null
  councilType: string | null
  councilNumber: string | null
  councilState: string | null
  specialties: string[]
  bio: string | null
  phone: string | null
  color: string | null
  signatureStorageKey: string | null
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  membershipId: string | null
  services?: Array<{ serviceId: string }>
  createdAt?: Date
  updatedAt?: Date
}

export function mapTenantSettings(
  row: {
    displayName: string
    legalName: string | null
    documentType: string | null
    documentNumber: string | null
    email: string | null
    phone: string | null
    whatsapp: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    timezone: string
    logoStorageKey: string | null
    onboardingCompletedAt: Date | null
  },
  ctx: TenantContext,
): TenantSettingsView {
  const canManage = hasPermission(ctx.role, 'tenant:manage')
  return {
    displayName: row.displayName,
    legalName: canManage ? row.legalName : null,
    documentType: canManage ? (row.documentType as TenantSettingsView['documentType']) : null,
    documentNumber:
      row.documentNumber == null
        ? null
        : canManage
          ? row.documentNumber
          : maskStudioDocument(row.documentType, row.documentNumber),
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    timezone: row.timezone,
    hasLogo: Boolean(row.logoStorageKey),
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
  }
}

export function canSeeProfessionalSensitive(ctx: TenantContext, membershipId: string | null): boolean {
  if (hasPermission(ctx.role, 'professionals:write')) return true
  return Boolean(membershipId && membershipId === ctx.membershipId)
}

export function mapProfessional(row: ProfessionalRow, ctx: TenantContext): ProfessionalListItemView {
  const sensitive = canSeeProfessionalSensitive(ctx, row.membershipId)
  const base: ProfessionalListItemView = {
    id: row.id,
    displayName: row.displayName,
    fullName: row.fullName,
    councilType: row.councilType as ProfessionalListItemView['councilType'],
    councilState: row.councilState,
    specialties: row.specialties,
    bio: row.bio,
    color: row.color,
    status: row.status,
    membershipId: row.membershipId,
    hasSignature: Boolean(row.signatureStorageKey),
    serviceIds: (row.services ?? []).map((item) => item.serviceId),
  }
  if (sensitive) {
    return {
      ...base,
      ...(row.councilNumber ? { councilNumber: row.councilNumber } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
    }
  }
  return base
}
