export const COUNCIL_TYPES = ['CREFITO', 'CREF', 'CRM', 'CRN', 'CRP', 'OTHER'] as const
export type CouncilType = (typeof COUNCIL_TYPES)[number]

export const PROFESSIONAL_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const
export type ProfessionalStatus = (typeof PROFESSIONAL_STATUSES)[number]

export const SPECIALTIES = [
  'Pilates clínico',
  'Ortopedia',
  'Neurofuncional',
  'RPG',
  'Pélvica',
  'Esportiva',
  'Respiratória',
  'Geriatria',
  'Pediatria',
  'Dermatofuncional',
  'Outro',
] as const

export type Specialty = (typeof SPECIALTIES)[number]

export const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
] as const

export const DOCUMENT_TYPES = ['CNPJ', 'CPF'] as const
export type StudioDocumentType = (typeof DOCUMENT_TYPES)[number]

export interface TenantSettingsView {
  readonly displayName: string
  readonly legalName: string | null
  /** Masked unless actor has `tenant:manage`. */
  readonly documentType: StudioDocumentType | null
  readonly documentNumber: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly whatsapp: string | null
  readonly addressLine1: string | null
  readonly addressLine2: string | null
  readonly city: string | null
  readonly state: string | null
  readonly postalCode: string | null
  readonly timezone: string
  readonly hasLogo: boolean
  readonly onboardingCompletedAt: string | null
}

export interface ProfessionalListItemView {
  readonly id: string
  readonly displayName: string
  readonly fullName: string | null
  readonly councilType: CouncilType | null
  readonly councilNumber?: string
  readonly councilState: string | null
  readonly specialties: readonly string[]
  readonly bio: string | null
  readonly phone?: string
  readonly color: string | null
  readonly status: ProfessionalStatus
  readonly membershipId: string | null
  readonly hasSignature: boolean
  readonly serviceIds: readonly string[]
}

export interface ProfessionalView extends ProfessionalListItemView {
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ServiceView {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly durationMinutes: number
  readonly category: string | null
  readonly isActive: boolean
}

export interface RoomView {
  readonly id: string
  readonly name: string
  readonly capacity: number
  readonly isActive: boolean
}

export interface WorkingHoursEntryView {
  readonly weekday: number
  readonly startTime: string
  readonly endTime: string
}

export interface WorkingHoursSetView {
  readonly professionalId: string | null
  readonly entries: readonly WorkingHoursEntryView[]
}

/**
 * Contract for agenda cards (CLI-48+).
 * If the professional has any override rows, only those apply (no merge with studio defaults).
 * Days without an override entry are empty even if the studio has hours that day.
 */
export interface EffectiveWorkingHoursView {
  readonly professionalId: string
  readonly date: string
  readonly weekday: number
  readonly source: 'override' | 'default'
  readonly entries: readonly WorkingHoursEntryView[]
}

export interface OnboardingStatusView {
  readonly completed: boolean
  readonly steps: {
    readonly studio: boolean
    readonly professional: boolean
    readonly workingHours: boolean
  }
}
