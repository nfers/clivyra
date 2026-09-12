import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  CONSENT_SOURCES,
  CONSENT_SUBJECT_TYPES,
  CONSENT_TERM_STATUSES,
  CONSENT_TERM_TYPES,
  LEGAL_BASES,
  type ConsentSource,
  type ConsentSubjectType,
  type ConsentTermStatus,
  type ConsentTermType,
  type LegalBasis,
} from '@clivyra/types'

export class CreateConsentTermDto {
  @IsIn([...CONSENT_TERM_TYPES])
  type!: ConsentTermType

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content!: string

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  purposes!: string[]

  @IsOptional()
  @IsIn([...LEGAL_BASES])
  legalBasis?: LegalBasis

  @IsOptional()
  @IsInt()
  @Min(1)
  requiresRenewalAfterDays?: number
}

export class UpdateConsentTermDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  purposes?: string[]

  @IsOptional()
  @IsIn([...LEGAL_BASES])
  legalBasis?: LegalBasis

  @IsOptional()
  @IsInt()
  @Min(1)
  requiresRenewalAfterDays?: number | null
}

export class PublishConsentTermDto {
  @IsOptional()
  @IsBoolean()
  requiresReconsent?: boolean
}

export class ListConsentTermsQueryDto {
  @IsOptional()
  @IsIn([...CONSENT_TERM_TYPES])
  type?: ConsentTermType

  @IsOptional()
  @IsIn([...CONSENT_TERM_STATUSES])
  status?: ConsentTermStatus
}

export class ConsentEvidenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  witnessUserId?: string
}

export class GrantConsentDto {
  @IsIn([...CONSENT_SUBJECT_TYPES])
  subjectType!: ConsentSubjectType

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  subjectId!: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  termId!: string

  @IsIn([...CONSENT_SOURCES])
  source!: ConsentSource

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentEvidenceDto)
  evidence?: ConsentEvidenceDto

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}

export class RevokeConsentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

export class ListConsentsQueryDto {
  @IsIn([...CONSENT_SUBJECT_TYPES])
  subjectType!: ConsentSubjectType

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  subjectId!: string
}

export class ConsentStatusQueryDto {
  @IsIn([...CONSENT_SUBJECT_TYPES])
  subjectType!: ConsentSubjectType

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  subjectId!: string
}
