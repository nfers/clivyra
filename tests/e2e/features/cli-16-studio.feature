# language: pt
Funcionalidade: Perfil profissional e configuração do studio (CLI-16)
  Como OWNER do studio
  Quero configurar dados do tenant, profissionais e horários
  Para operar o piloto com RBAC nos campos sensíveis

  Cenário: visitante não acessa configuração do studio
    Quando acessa /app/configuracoes/studio sem sessão
    Então é redirecionado para /login

  Cenário: dados legais só para OWNER
    Dado um ADMIN autenticado com fixtures E2E
    Quando acessa /app/configuracoes/studio
    Então não vê campos de razão social e CNPJ editáveis

  Cenário: onboarding do OWNER incompleto
    Dado um OWNER autenticado sem onboarding completo
    Quando entra no app
    Então pode ser levado ao fluxo de onboarding

  Cenário: profissional edita o próprio perfil
    Dada uma PROFESSIONAL autenticada com perfil vinculado
    Quando altera especialidades em /app/perfil
    Então as alterações são salvas

  Cenário: recepção não vê CREFITO/telefone
    Dada uma RECEPTION autenticada
    Quando acessa a lista de profissionais
    Então vê nomes e especialidades sem CREFITO nem telefone em claro

  # WorkingHours effective (override substitui, sem merge) → unit/integração
