import { MembershipRole } from '@prisma/client'
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator'

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export class RegisterDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(2)
  name!: string

  @IsString()
  @MinLength(12)
  @Matches(PASSWORD_PATTERN, { message: 'password must include lowercase, uppercase and number' })
  password!: string

  @IsString()
  tenantSlug!: string

  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole
}

export class LoginDto {
  @IsEmail()
  email!: string

  @IsString()
  password!: string

  @IsOptional()
  @IsString()
  tenantSlug?: string
}

export class RefreshDto {
  @IsString()
  refreshToken!: string
}

export class LogoutDto {
  @IsString()
  refreshToken!: string
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string
}

export class PasswordResetConfirmDto {
  @IsString()
  resetToken!: string

  @IsString()
  @MinLength(12)
  @Matches(PASSWORD_PATTERN, { message: 'password must include lowercase, uppercase and number' })
  password!: string
}
