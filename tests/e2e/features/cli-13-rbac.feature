# language: pt
Funcionalidade: RBAC e convites (CLI-13)
  Como OWNER do studio
  Quero gerenciar usuários por papel com negação por padrão
  Para que módulos sensíveis fiquem protegidos

  Cenário: visitante não acessa gestão de usuários
    Quando acessa /app/configuracoes/usuarios sem sessão
    Então é redirecionado para /login

  Cenário: página pública de convite inválido
    Quando abre /convite com token inválido
    Então vê o formulário de aceite e alerta genérico

  Cenário: RECEPTION não administra usuários
    Dada uma RECEPTION autenticada com fixtures E2E
    Quando acessa /app/configuracoes/usuarios
    Então vê acesso negado ou não lista usuários administrativos

  Cenário: papel do convite não vem do body
    # Prova de domínio via API/integração (forbidNonWhitelisted + role do convite)
    Dado um token de convite PENDING
    Quando o aceite envia role no body
    Então a API rejeita (400) e o papel aplicado continua o do convite

  # Matriz papel×permissão e LAST_OWNER → unit/integração
