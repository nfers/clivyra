import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'

const OUTCOMES = ['SUCCESS', 'DENIED', 'FAILURE'] as const

export class AuditQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorUserId?: string

  @IsOptional()
  @IsIn(OUTCOMES)
  outcome?: (typeof OUTCOMES)[number]

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
