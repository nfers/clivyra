export function buildInvitationEmail(input: {
  inviteeEmail: string
  tenantName: string
  role: string
  inviteUrl: string
  inviterName: string
}): { subject: string; text: string } {
  return {
    subject: `Convite para ${input.tenantName} — Clivyra`,
    text: [
      `Olá,`,
      '',
      `${input.inviterName} convidou você para o studio ${input.tenantName} no Clivyra`,
      `como ${input.role}.`,
      '',
      'Abra o link a seguir para aceitar o convite:',
      input.inviteUrl,
      '',
      'Se você não esperava este convite, ignore este e-mail.',
      '',
      'Equipe Clivyra',
    ].join('\n'),
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const visible = local.slice(0, 1)
  return `${visible}***@${domain}`
}
