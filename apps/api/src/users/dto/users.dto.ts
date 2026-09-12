import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { ROLES, type Role } from '@clivyra/types'

export class CreateInvitationDto {
  @IsEmail()
  email!: string

  @IsIn([...ROLES])
  role!: Role
}

export class ChangeRoleDto {
  @IsIn([...ROLES])
  role!: Role
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(16)
  token!: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  /** Existing users: current password. New users: new password (strength checked in service). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive'

  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @IsString()
  limit?: string
}

export class ListInvitationsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'])
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
}
