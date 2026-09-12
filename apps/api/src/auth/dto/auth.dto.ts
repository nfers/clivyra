import {
  IsEmail,
  IsString,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator'
import { isPasswordStrong, isValidTenantSlug, TENANT_SLUG_PATTERN } from '../password-policy'

@ValidatorConstraint({ name: 'strongPassword', async: false })
export class StrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: unknown, args: ValidationArguments): boolean {
    if (typeof password !== 'string') return false
    const object = args.object as { email?: string }
    return isPasswordStrong(password, object.email)
  }

  defaultMessage(): string {
    return 'password does not meet strength requirements'
  }
}

@ValidatorConstraint({ name: 'tenantSlug', async: false })
export class TenantSlugConstraint implements ValidatorConstraintInterface {
  validate(slug: unknown): boolean {
    return typeof slug === 'string' && isValidTenantSlug(slug)
  }

  defaultMessage(): string {
    return 'slug is invalid or reserved'
  }
}

export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  studioName!: string

  @IsString()
  @Matches(TENANT_SLUG_PATTERN)
  @Validate(TenantSlugConstraint)
  slug!: string

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string

  @IsEmail()
  email!: string

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Validate(StrongPasswordConstraint)
  password!: string
}

export class LoginDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string

  @IsOptional()
  @IsString()
  tenantSlug?: string
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string
}

export class SwitchTenantDto {
  @IsString()
  tenantId!: string // tenant-boundary: allow switch-tenant target — membership revalidated server-side
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string
}

export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(16)
  token!: string

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Validate(StrongPasswordConstraint)
  password!: string
}
