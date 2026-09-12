import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import {
  CONSENT_SOURCES,
  CONSENT_SUBJECT_TYPES,
  DATA_SUBJECT_REQUEST_STATUSES,
  DATA_SUBJECT_REQUEST_TYPES,
  type ConsentSource,
  type ConsentSubjectType,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from '@clivyra/types'

export class CreateDataSubjectRequestDto {
  @IsIn([...CONSENT_SUBJECT_TYPES])
  subjectType!: ConsentSubjectType

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  subjectId!: string

  @IsIn([...DATA_SUBJECT_REQUEST_TYPES])
  type!: DataSubjectRequestType

  @IsIn([...CONSENT_SOURCES])
  channel!: ConsentSource
}

export class ListDataSubjectRequestsQueryDto {
  @IsOptional()
  @IsIn([...DATA_SUBJECT_REQUEST_STATUSES])
  status?: DataSubjectRequestStatus

  @IsOptional()
  @IsIn([...DATA_SUBJECT_REQUEST_TYPES])
  type?: DataSubjectRequestType
}

export class UpdateDataSubjectRequestDto {
  @IsOptional()
  @IsIn([...DATA_SUBJECT_REQUEST_STATUSES])
  status?: DataSubjectRequestStatus

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToUserId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionNotes?: string
}
