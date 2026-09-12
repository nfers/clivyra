# language: pt
Funcionalidade: Consentimentos e direitos LGPD (CLI-15)
  Como OWNER/ADMIN do studio
  Quero versionar termos, registrar aceite/revogação e atender titulares
  Para cumprir LGPD sem apagar histórico obrigatório

  # UI completa vive em origin/cursor/cli-15-lgpd-a1bc (paralelo a CLI-16).
  # Neste branch (CLI-16 tip) as rotas /configuracoes/termos e /lgpd podem estar ausentes.

  Cenário: visitante não acessa termos LGPD
    Quando acessa /app/configuracoes/termos sem sessão
    Então é redirecionado para /login ou a rota não existe no shell atual

  Cenário: revogação preserva histórico
    # Integração: ConsentRecord REVOKED com supersedesId; original inalterado
    Dado um consentimento GRANTED
    Quando o OWNER revoga
    Então nasce registro REVOKED encadeado e o original permanece

  Cenário: erasure preserva auditoria e consentimento
    # Integração: RetentionPolicy RETAIN para AUDIT/CONSENT; anonymizer não apaga AuditLog
    Dado um pedido ERASURE de USER desativado
    Quando a execução anonimiza o perfil
    Então AuditLog e ConsentRecord permanecem

  Cenário: RECEPTION não abre ERASURE
    Dada uma RECEPTION autenticada
    Quando tenta POST /lgpd/requests tipo ERASURE
    Então recebe 403
