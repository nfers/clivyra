# language: pt
Funcionalidade: Autenticação e sessão (CLI-12)
  Como profissional do studio
  Quero autenticar com segurança e recuperar senha sem enumeração
  Para proteger o acesso ao tenant

  Cenário: rota protegida sem sessão
    Quando um visitante acessa /app
    Então é redirecionado para /login?next=

  Cenário: recuperação com e-mail inexistente é genérica
    Quando solicita recuperação para um e-mail desconhecido
    Então vê a mesma mensagem genérica de confirmação

  Cenário: login com sucesso
    Dado um usuário OWNER do studio com fixtures E2E
    Quando acessa /login e informa e-mail e senha válidos
    Então é redirecionado para /app ou /onboarding

  Cenário: sair encerra a sessão web
    Dado um usuário autenticado
    Quando clica em Sair
    Então volta para /login e /app redireciona novamente

  # Refresh reuse / family revoke → integração (auth.integration.spec.ts)
