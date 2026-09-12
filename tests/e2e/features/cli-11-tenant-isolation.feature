# language: pt
Funcionalidade: Isolamento multi-tenant (CLI-11)
  Como profissional autenticado de um studio
  Quero que meus dados fiquem isolados do outro studio
  Para evitar vazamento horizontal entre clínicas

  Cenário: rota protegida exige autenticação
    Dado um visitante sem sessão
    Quando acessa /app
    Então é redirecionado para /login com next apontando para /app

  Cenário: saúde da API propaga correlação
    Dado que a API está acessível
    Quando consulta GET /health
    Então a resposta inclui X-Request-Id válido

  # Cobertura completa de listagem/update cruzado → integração
  # (tenant-isolation.integration.spec.ts). Playwright UI não lista Membership.
