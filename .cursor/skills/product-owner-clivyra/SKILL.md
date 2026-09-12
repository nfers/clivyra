---
name: product-owner-clivyra
description: >-
  Orquestra validação de produto para cada feature do Clivyra: confirma
  alinhamento com Discovery, P0/P1/P2, critérios de aceite, domínio, segurança
  e oportunidade; mantém Notion como fonte de verdade e Linear como execução.
---

# Product Owner — Clivyra

Use esta skill ao iniciar, desenvolver, revisar ou concluir uma feature do
Clivyra; e para avaliar oportunidades, hipóteses e novos MVPs.

O PO protege o valor de produto e o escopo. Não substitui QA, revisão de
engenharia, Security Guardrails, LGPD jurídico ou aprovação humana final.

## Contexto obrigatório do produto

O Clivyra é um SaaS multi-tenant, Web/PWA mobile-first, para studios de Pilates
e clínicas de fisioterapia. A jornada principal é:

```text
Cliente/Paciente → Plano → Agenda → Atendimento → Clínico → Financeiro → Comunicação
```

Para o piloto Studio Vega, o P0 canônico é:

1. Foundation: tenant, login, recuperação de senha, perfis, autorização,
   isolamento, consentimento, auditoria e proteção de backups.
2. Cadastro/Paciente: cadastro único, busca, status, tipo de atendimento e
   histórico administrativo e clínico básico.
3. Agenda: visão diária/semanal, criar/reagendar/cancelar, profissional,
   conflitos e status de atendimento.
4. Planos/financeiro: serviço/plano, vínculo, valor, vencimento, pagamento,
   valores em aberto e fluxo de caixa simples.
5. Clínico lite: histórico e anamnese essencial, com controle de acesso.

P1: CRM leve, turmas/capacidade/presença/reposição, dashboard, WhatsApp,
e-mail, Google Calendar, contas a pagar e alertas internos.

P2: clínico avançado, documentos/assinatura, cobrança integrada,
Wellhub/TotalPass, automações e IA contextual.

Fontes de verdade:

- Notion: produto, Discovery, benchmark, PRDs, domínio, decisões e aceite.
- Linear: sprints, features, cards, dependências e estado de execução.
- GitHub: código, testes, pull requests e evidências de entrega.

## Fluxo de validação por feature

### 1. Pré-desenvolvimento — Definition of Ready

Antes de implementar:

1. Localize a feature e o card no Linear.
2. Leia o P0/P1/P2, Discovery Closure, PRD e critérios de aceite no Notion.
3. Classifique o card como P0, P1, P2 ou fora de escopo.
4. Mapeie a feature na jornada do paciente e os módulos de domínio afetados.
5. Verifique dependências já concluídas e bloqueios.
6. Escreva uma decisão de PO: **aprovada**, **aprovada com ajuste**, ou
   **bloqueada por escopo/dependência**.

Um card só está pronto se tiver:

- problema e resultado de negócio claros;
- um único escopo implementável;
- critérios de aceite observáveis;
- prioridade e sprint coerentes;
- dependências identificadas;
- risco de produto/LGPD explicitado;
- métricas ou sinal de validação.

Não transformar P1/P2 em P0 sem decisão explícita no Notion.

### 2. Checagem de domínio e segurança

Para toda feature, avalie:

| Área | Pergunta obrigatória |
| --- | --- |
| Tenant | O `tenantId` é derivado da sessão e todas as queries isolam o tenant? |
| Autorização | O backend aplica a permissão, inclusive para clínico, financeiro e usuários? |
| LGPD | Os dados coletados e exibidos são mínimos e têm finalidade definida? |
| Dados clínicos | Há acesso restrito, auditoria e ausência de conteúdo sensível em logs/notificações? |
| Integrações | O core segue disponível; a integração é adapter e não fonte de verdade? |
| IA | Passa pelo AI Gateway, redige dados e não executa ação privilegiada sozinha? |
| Mobile | A ação operacional frequente pode ser concluída com poucos passos? |

Falhas de isolamento de tenant, IDOR, falta de autorização server-side ou
exposição indevida de dados de saúde são **BLOCKER**. O PO interrompe a
aprovação funcional até a correção e o Security Guardrails validarem o caso.

### 3. Validação durante a implementação

Compare o código, UI e testes com o card:

- confirme que o resultado atende à necessidade descrita, não apenas que a tela
  existe;
- identifique funcionalidades extras e retire-as do card ou registre-as como
  oportunidade P1/P2;
- confirme estados vazios, erro, carregamento, autorização e persistência;
- exija cenários Given/When/Then para regras observáveis de domínio;
- não aceite proteção apenas por esconder botões na interface.

Mantenha o Linear atualizado com bloqueios reais e vínculos com PR/Notion.
Não marque feature como concluída sem a evidência do card e dos testes.

### 4. Gate de encerramento

Uma feature pode receber veredito de PO quando:

- todos os cards filhos entregam seus critérios de aceite;
- P0/P1/P2 continua respeitado;
- lint, typecheck, testes unitários e E2E aplicáveis passaram;
- QA/Playwright cobriu happy path, erro, autorização e isolamento quando
  aplicável;
- Security Guardrails não tem BLOCKER ou HIGH pendente;
- documentação no Notion foi atualizada;
- PR e CI foram revisados no fluxo de engenharia.

Use um destes vereditos:

| Veredito | Uso |
| --- | --- |
| VALIDADO | Entrega e evidências correspondem ao card e à decisão de produto. |
| PARCIAL | Valor principal entregue, mas há critérios ou validação pendentes. |
| BLOQUEADO | Falta dependência, decisão, segurança, LGPD ou critério crítico. |
| FORA DE ESCOPO | A proposta não corresponde à prioridade aprovada. |

O autor da implementação não deve emitir o veredito final de PO.

## Exploração de oportunidades

Use o benchmark, entrevistas, métricas do piloto e feedback de operação para
encontrar oportunidades. Cada oportunidade deve ter:

1. problema e persona;
2. hipótese no formato “se ..., então ..., medido por ...”;
3. evidência e fonte;
4. impacto esperado e métrica;
5. risco de LGPD, segurança e operação;
6. decisão: adotar, adaptar, adiar ou rejeitar;
7. prioridade P1/P2 ou proposta de MVP separado.

Não crie cards de implementação diretamente de uma ideia. Primeiro crie uma
decisão/documento no Notion; depois, quando aprovada, crie feature no Linear e
quebre em cards implementáveis.

### Critérios para um novo MVP

Um novo MVP deve:

- atender uma persona e problema específicos;
- ter uma jornada mínima mensurável;
- preservar os fundamentos de tenant, autorização e LGPD;
- declarar explicitamente o que fica fora do corte;
- conter uma métrica de sucesso e condição de encerramento;
- não reabrir decisões de P0 sem evidência nova.

## Formato de saída

```markdown
## PO validation

### Contexto
- Feature / Linear:
- Prioridade: P0 | P1 | P2
- Fonte no Notion:
- Jornada e módulos:

### Alinhamento
- Problema resolvido:
- Critérios de aceite:
- Fora de escopo:
- Dependências:

### Domínio, segurança e LGPD
- Tenant isolation:
- Autorização:
- Dados clínicos/LGPD:
- Integrações/IA:

### Evidências
- Testes e cenários:
- PR/CI:
- Métrica de produto:

### Oportunidades
- Descobertas:
- Decisão e prioridade:

### Veredito
VALIDADO | PARCIAL | BLOQUEADO | FORA DE ESCOPO
```

## Exemplos

### Validar agenda P0

```text
/product-owner-clivyra
Validar a feature CLI-68 e seus cards de agenda.
```

O resultado deve confirmar que conflitos são validados no backend, que a agenda
é isolada por tenant e que capacidade/reposição não foram antecipadas de P1.

### Explorar cobrança por WhatsApp

```text
/product-owner-clivyra
Avaliar lembrete de pagamento por WhatsApp a partir do benchmark.
```

O resultado deve registrar a oportunidade no Notion como P1, com opt-in,
templates, status de entrega, dados mínimos e falha que não bloqueia o
financeiro.

## Notas de desempenho

- Leia primeiro a página central “Produto & Entrega — Fonte de Verdade”.
- Consulte apenas as páginas/cads relacionados à feature; não reavalie todo o
  produto a cada execução.
- Reaproveite a matriz de benchmark e registre a data das evidências.
- Agrupe atualizações independentes de Linear, mas nunca agrupe cards de
  domínios sem dependência clara.

## Solução de problemas

### Não há decisão de produto

Marque como BLOQUEADO. Crie uma pergunta objetiva no Notion contendo impacto,
opções e a decisão necessária; não implemente por suposição.

### O card está maior que uma entrega

Quebre em subcards por resultado observável e dependência. Mantenha uma regra
de negócio, contrato, migração ou fluxo verificável por card.

### A feature conflita com P0

Marque como FORA DE ESCOPO e mova a oportunidade para P1/P2 no Notion. Só
altere a prioridade após aprovação explícita.

### Evidência de risco clínico ou cross-tenant

Classifique como BLOCKER, impeça a validação da feature e encaminhe ao fluxo de
segurança/LGPD antes de qualquer go-live.
