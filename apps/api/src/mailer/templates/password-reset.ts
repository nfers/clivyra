export function buildPasswordResetEmail(input: {
  name: string
  resetUrl: string
}): { subject: string; text: string } {
  return {
    subject: 'Redefinição de senha — Clivyra',
    text: [
      `Olá ${input.name},`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta Clivyra.',
      `Abra o link a seguir para escolher uma nova senha:`,
      input.resetUrl,
      '',
      'Se você não solicitou esta alteração, ignore este e-mail.',
      '',
      'Equipe Clivyra',
    ].join('\n'),
  }
}

export function buildPasswordChangedEmail(input: { name: string }): { subject: string; text: string } {
  return {
    subject: 'Sua senha foi alterada — Clivyra',
    text: [
      `Olá ${input.name},`,
      '',
      'A senha da sua conta Clivyra foi alterada com sucesso.',
      'Se você não reconhece esta alteração, entre em contato com o suporte do seu studio.',
      '',
      'Equipe Clivyra',
    ].join('\n'),
  }
}
