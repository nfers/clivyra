# language: pt
Funcionalidade: Trilha de auditoria (CLI-14)
  Como OWNER ou ADMIN
  Quero consultar eventos sensíveis do meu tenant sem segredos
  Para accountability e LGPD

  Cenário: visitante não acessa auditoria
    Quando acessa /app/configuracoes/auditoria sem sessão
    Então é redirecionado para /login

  Cenário: PROFESSIONAL sem audit:read é bloqueado
    Dada uma PROFESSIONAL autenticada com fixtures E2E
    Quando acessa /app/configuracoes/auditoria
    Então vê acesso negado

  Cenário: ação administrativa aparece na auditoria
    Dado um OWNER autenticado
    Quando altera o papel de um usuário
    E acessa /app/configuracoes/auditoria
    Então vê evento de alteração de papel

  # Append-only / sanitizer de secrets → integração (audit.integration.spec.ts)
