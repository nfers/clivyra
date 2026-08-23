import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { MembershipRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuthTokenService } from './auth-token.service'
import type { AuthenticatedSessionResponse } from './auth.types'
import {
  LoginDto,
  LogoutDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto'
import { PasswordHasherService } from './password-hasher.service'

const AUTH_FAILURE_MESSAGE = 'Invalid credentials'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthenticatedSessionResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
      select: { id: true, isActive: true },
    })

    if (!tenant?.isActive) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } })

    if (existing) {
      throw new ConflictException('User already exists')
    }

    const passwordHash = await this.hasher.hash(dto.password)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        memberships: {
          create: {
            tenantId: tenant.id,
            role: dto.role ?? 'PROFESSIONAL',
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          where: { tenantId: tenant.id, isActive: true },
          select: { id: true, tenantId: true, role: true },
        },
      },
    })
    const membership = user.memberships[0]

    if (!membership) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    return this.createSessionResponse({
      userId: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
      email: user.email,
      name: user.name,
    })
  }

  async login(dto: LoginDto): Promise<AuthenticatedSessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
        memberships: {
          where: {
            isActive: true,
            tenant: {
              isActive: true,
              ...(dto.tenantSlug ? { slug: dto.tenantSlug } : {}),
            },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            tenantId: true,
            role: true,
          },
        },
      },
    })

    if (!user?.isActive || !user.passwordHash) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    const validPassword = await this.hasher.verify(dto.password, user.passwordHash)

    if (!validPassword) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    const membership = user.memberships[0]

    if (!membership) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    return this.createSessionResponse({
      userId: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
      email: user.email,
      name: user.name,
    })
  }

  async refresh(dto: RefreshDto): Promise<AuthenticatedSessionResponse> {
    const tokenHash = this.tokens.hashOpaqueToken(dto.refreshToken)
    const now = new Date()
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tenantId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            memberships: {
              where: { isActive: true, tenant: { isActive: true } },
              select: { id: true, tenantId: true, role: true },
            },
          },
        },
      },
    })

    if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    const membership = session.user.memberships.find((item) => item.tenantId === session.tenantId)

    if (!membership) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    })

    return this.createSessionResponse({
      userId: session.user.id,
      tenantId: session.tenantId,
      membershipId: membership.id,
      role: membership.role,
      email: session.user.email,
      name: session.user.name,
    })
  }

  async logout(dto: LogoutDto): Promise<{ status: 'ok' }> {
    const tokenHash = this.tokens.hashOpaqueToken(dto.refreshToken)

    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return { status: 'ok' }
  }

  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{ status: 'ok'; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, isActive: true },
    })
    const resetToken = this.tokens.createOpaqueToken()

    if (user?.isActive) {
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.tokens.hashOpaqueToken(resetToken),
          expiresAt: this.tokens.passwordResetExpiresAt(),
        },
      })
    }

    if (process.env.NODE_ENV === 'production') {
      return { status: 'ok' }
    }

    return { status: 'ok', resetToken }
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<{ status: 'ok' }> {
    const tokenHash = this.tokens.hashOpaqueToken(dto.resetToken)
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    })

    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid reset token')
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await this.hasher.hash(dto.password) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    return { status: 'ok' }
  }

  private async createSessionResponse(input: {
    userId: string
    tenantId: string
    membershipId: string
    role: MembershipRole
    email: string
    name: string
  }): Promise<AuthenticatedSessionResponse> {
    const refreshToken = this.tokens.createOpaqueToken()
    const session = await this.prisma.refreshSession.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        tokenHash: this.tokens.hashOpaqueToken(refreshToken),
        expiresAt: this.tokens.refreshTokenExpiresAt(),
      },
      select: { id: true },
    })
    const accessToken = this.tokens.signAccessToken({
      userId: input.userId,
      tenantId: input.tenantId,
      sessionId: session.id,
    })

    return {
      accessToken,
      refreshToken,
      user: {
        id: input.userId,
        email: input.email,
        name: input.name,
      },
      tenantContext: {
        userId: input.userId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        role: input.role,
      },
    }
  }
}
