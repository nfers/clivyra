import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { COUNCIL_TYPES, DOCUMENT_TYPES, PROFESSIONAL_STATUSES } from '@clivyra/types'

export class PatchTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string

  @IsOptional()
  @IsIn([...DOCUMENT_TYPES])
  documentType?: 'CNPJ' | 'CPF'

  @IsOptional()
  @IsString()
  @MaxLength(18)
  documentNumber?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsapp?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine1?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine2?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string
}

export class CreateProfessionalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string

  @IsOptional()
  @IsIn([...COUNCIL_TYPES])
  councilType?: (typeof COUNCIL_TYPES)[number]

  @IsOptional()
  @IsString()
  @MaxLength(32)
  councilNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(2)
  councilState?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string

  @IsOptional()
  @IsString()
  membershipId?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[]

  @IsOptional()
  @IsBoolean()
  councilNotApplicable?: boolean

  @IsOptional()
  @IsIn([...PROFESSIONAL_STATUSES])
  status?: (typeof PROFESSIONAL_STATUSES)[number]
}

export class PatchProfessionalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string

  @IsOptional()
  @IsIn([...COUNCIL_TYPES])
  councilType?: (typeof COUNCIL_TYPES)[number]

  @IsOptional()
  @IsString()
  @MaxLength(32)
  councilNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(2)
  councilState?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[]

  @IsOptional()
  @IsBoolean()
  councilNotApplicable?: boolean

  @IsOptional()
  @IsIn([...PROFESSIONAL_STATUSES])
  status?: (typeof PROFESSIONAL_STATUSES)[number]
}

export class PatchProfessionalMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string

  @IsOptional()
  @IsIn([...COUNCIL_TYPES])
  councilType?: (typeof COUNCIL_TYPES)[number]

  @IsOptional()
  @IsString()
  @MaxLength(32)
  councilNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(2)
  councilState?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string

  @IsOptional()
  @IsBoolean()
  councilNotApplicable?: boolean
}

export class LinkMembershipDto {
  @IsString()
  membershipId!: string
}

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string
}

export class PatchServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class CreateRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number
}

export class PatchRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class WorkingHoursEntryDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime!: string

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime!: string
}

export class PutWorkingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursEntryDto)
  entries!: WorkingHoursEntryDto[]
}

export class ListProfessionalsQueryDto {
  @IsOptional()
  @IsIn([...PROFESSIONAL_STATUSES])
  status?: (typeof PROFESSIONAL_STATUSES)[number]

  @IsOptional()
  @IsString()
  serviceId?: string

  @IsOptional()
  @IsString()
  cursor?: string
}

export class EffectiveWorkingHoursQueryDto {
  @IsString()
  professionalId!: string

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string
}
