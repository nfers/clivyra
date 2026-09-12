import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { accountLockoutPolicy } from './account-lockout.policy'
import { AUTH_EVENTS_PORT, type AuthEventsPort } from './auth-events.port'
import { AuthTokenService } from './auth-token.service'
import type { PasswordResetConfirmDto, PasswordResetRequestDto } from './dto/auth.dto'
import { normalizeEmail } from './password-policy'
import { PasswordHasherService } from './password-hasher.service'
import { MAILER_PORT, type MailerPort } from '../mailer/mailer.port'
import { buildPasswordChangedEmail, buildPasswordResetEmail } from '../mailer/templates/password-reset'

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: AuthTokenService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    @Inject(AUTH_EVENTS_PORT) private readonly events: AuthEventsPort,
  ) {}

  async request(dto: PasswordResetRequestDto): Promise<{ status: 'ok'; resetToken?: string }> {
    const email = normalizeEmail(dto.email)
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, isActive: true },
    })

    let resetToken: string | undefined

    if (user?.isActive) {
      resetToken = this.tokens.createOpaqueToken()
      const tokenHash = this.tokens.hashOpaqueToken(resetToken)
      const expiresAt = this.tokens.passwordResetExpiresAt()

      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        }),
      ])

      const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
      const resetUrl = `${webOrigin}/redefinir-senha/${resetToken}`
      const template = buildPasswordResetEmail({ name: user.name, resetUrl })
      await this.mailer.send({
        to: email,
        subject: template.subject,
        text: template.text,
      })

      this.events.emit('auth.password.reset_requested', { userId: user.id })
    }

    const expose =
      process.env.AUTH_EXPOSE_RESET_TOKEN === 'true' && process.env.NODE_ENV === 'development' && resetToken

    return expose ? { status: 'ok', resetToken } : { status: 'ok' }
  }

  async confirm(dto: PasswordResetConfirmDto): Promise<void> {
    const tokenHash = this.tokens.hashOpaqueToken(dto.token)
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
    })

    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || !reset.user.isActive) {
      throw new UnauthorizedException('Invalid reset token')
    }

    const passwordHash = await this.hasher.hash(dto.password)
    const now = new Date()
    const lockReset = accountLockoutPolicy.reset()

    await this.prisma.bypassTenant('auth-password-reset', async () => {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: reset.userId },
          data: {
            passwordHash,
            passwordChangedAt: now,
            sessionsInvalidatedAt: now,
            failedLoginCount: lockReset.failedLoginCount,
            lockedUntil: lockReset.lockedUntil,
          },
        }),
        this.prisma.passwordResetToken.update({
          where: { id: reset.id },
          data: { usedAt: now },
        }),
        this.prisma.refreshSession.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'password_reset' },
        }),
      ])
    })

    const notice = buildPasswordChangedEmail({ name: reset.user.name })
    await this.mailer.send({
      to: reset.user.email,
      subject: notice.subject,
      text: notice.text,
    })

    this.events.emit('auth.password.changed', { userId: reset.userId })
  }
}
