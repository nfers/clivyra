import { BadRequestException, Injectable } from '@nestjs/common'
import type { Role } from '@clivyra/types'
import { SPECIALTIES } from '@clivyra/types'

const LINKABLE_ROLES: ReadonlySet<Role> = new Set(['OWNER', 'ADMIN', 'PROFESSIONAL'])
const ME_ALLOWLIST = new Set([
  'displayName',
  'fullName',
  'councilType',
  'councilNumber',
  'councilState',
  'specialties',
  'bio',
  'phone',
  'color',
  'councilNotApplicable',
])

@Injectable()
export class ProfessionalPolicy {
  assertMeAllowlist(body: Record<string, unknown>): void {
    for (const key of Object.keys(body)) {
      if (!ME_ALLOWLIST.has(key)) {
        throw new BadRequestException({
          code: 'FIELD_NOT_ALLOWED',
          message: `Field ${key} is not allowed on /professionals/me`,
        })
      }
    }
  }

  assertCanLinkRole(role: Role): void {
    if (!LINKABLE_ROLES.has(role)) {
      throw new BadRequestException({
        code: 'MEMBERSHIP_NOT_LINKABLE',
        message: 'RECEPTION membership cannot be linked to a professional profile',
      })
    }
  }

  assertSpecialties(specialties: string[] | undefined): string[] {
    if (!specialties) return []
    if (specialties.length > 10) {
      throw new BadRequestException({ code: 'INVALID_SPECIALTIES', message: 'At most 10 specialties' })
    }
    const known = new Set<string>(SPECIALTIES)
    const cleaned: string[] = []
    for (const raw of specialties) {
      const value = raw.trim()
      if (!value || value.length > 40) {
        throw new BadRequestException({ code: 'INVALID_SPECIALTIES', message: 'Invalid specialty' })
      }
      if (!known.has(value) && value.length < 2) {
        throw new BadRequestException({ code: 'INVALID_SPECIALTIES', message: 'Invalid specialty' })
      }
      cleaned.push(value)
    }
    return cleaned
  }

  /**
   * ACTIVE requires displayName and either full council triple or councilNotApplicable.
   * When councilNotApplicable, persistence leaves councilType/number/state null.
   */
  resolveActivation(input: {
    displayName: string
    councilType?: string | null
    councilNumber?: string | null
    councilState?: string | null
    councilNotApplicable?: boolean
    requestedStatus?: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  }): { status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'; clearCouncil: boolean } {
    const requested = input.requestedStatus ?? 'DRAFT'
    if (requested === 'INACTIVE') {
      return { status: 'INACTIVE', clearCouncil: false }
    }
    if (requested !== 'ACTIVE') {
      return { status: 'DRAFT', clearCouncil: false }
    }
    if (!input.displayName || input.displayName.trim().length < 2) {
      throw new BadRequestException({
        code: 'PROFESSIONAL_INCOMPLETE',
        message: 'displayName is required to activate',
      })
    }
    if (input.councilNotApplicable) {
      return { status: 'ACTIVE', clearCouncil: true }
    }
    if (!input.councilType || !input.councilNumber || !input.councilState) {
      throw new BadRequestException({
        code: 'PROFESSIONAL_INCOMPLETE',
        message: 'Council data or councilNotApplicable is required to activate',
      })
    }
    return { status: 'ACTIVE', clearCouncil: false }
  }
}
