# Spec — CLI-52 Regressão E2E Playwright da Sprint 3

| Campo | Valor |
| --- | --- |
| Linear | [CLI-52](https://linear.app/clivyra/issue/CLI-52/sprint-3-testes-e2e-automatizados-com-playwright) — High — Backlog |
| Pai esperado | CLI-68 |
| Prioridade | Gate obrigatório da Sprint 3/P0 |
| Branch | `feat/CLI-52-sprint-3-e2e` |
| Depende de | CLI-22 e CLI-23 concluídas |
| Bloqueia | Encerramento da Sprint 3 |
| Plano | [`../PLANO_IMPLEMENTACAO.md`](../PLANO_IMPLEMENTACAO.md) |

> **Ajuste de escopo:** a descrição atual do Linear ainda pede turma,
> capacidade, matrícula, presença, reposição e lista de espera. Esses cenários
> são Sprint 6/P1 e não entram neste gate. CLI-52 valida somente a agenda
> operacional da CLI-68.

## 1. Objetivo

Provar, pelo comportamento observável no browser e por verificações HTTP
acopladas ao fluxo, que a agenda P0 funciona em mobile/desktop, persiste, aplica
as regras de recorrência e conflito no servidor e não vaza dados entre tenants
ou profissionais.

Esta issue cria/organiza testes e fixtures. Não muda regra de negócio para
obter verde; um defeito retorna ao card proprietário (CLI-22 ou CLI-23).

## 2. Escopo

### Dentro

- happy path de agenda dia/semana;
- criar, confirmar, reagendar, concluir, marcar não comparecimento e cancelar;
- persistência após reload/navegação;
- recorrência semanal;
- editar ocorrência e esta/futuras;
- bloqueios e disponibilidade;
- conflito de paciente/profissional/sala;
- autorização de PROFESSIONAL próprio/alheio;
- isolamento entre dois tenants;
- versão concorrente/erro recuperável;
- estados vazio, loading, erro de API e offline;
- viewport mobile e regressão desktop;
- trace, screenshot e vídeo somente em falha, com dados sintéticos.

### Fora

- turma, capacidade, matrícula, frequência, saldo, reposição e lista de espera;
- financeiro, clínico e integrações externas;
- teste de algoritmo interno que não é observável (fica em unit/integration);
- screenshots de dados pessoais reais;
- testes que escolhem `tenantId` no frontend.

## 3. Estrutura e convenções

Seguir o caminho já adotado no repositório:

```text
tests/e2e/
  domain/
    scheduling/
      agenda-crud.spec.ts
      appointment-status.spec.ts
      recurrence.spec.ts
      conflicts-availability.spec.ts
      authorization-tenant.spec.ts
      agenda-resilience.spec.ts
  support/
    auth.ts
    tenant.ts
    factories.ts
    api.ts
    steps/
      scheduling.ts
```

Cada teste:

- nomeia `Feature`/`Scenario`;
- contém comentários `Given`, `When`, `Then`;
- usa `getByRole`, `getByLabel` e `getByText`;
- não usa `waitForTimeout`;
- gera dados únicos por worker;
- faz cleanup tenant-scoped ou usa schema/tenant descartável;
- comprova efeito de domínio, não apenas toast/URL.

## 4. Fixtures

### 4.1 Tenants

```text
studio-a.test
  owner-a
  admin-a
  professional-a1
  professional-a2
  reception-a
  patient-a1
  patient-a2
  service-a (60 min)
  room-a1

studio-b.test
  owner-b
  professional-b1
  patient-b1
  service-b (60 min)
  room-b1
```

Dados:

- nomes explicitamente sintéticos (`Paciente E2E A-<uuid>`);
- e-mails em domínio `.test`;
- sem CPF real, diagnóstico, anamnese, CREFITO real ou telefone de pessoa;
- timezone `America/Sao_Paulo` no fluxo principal;
- uma fixture específica usa timezone com mudança de offset para teste de
  recorrência, sem depender do relógio local da máquina.

### 4.2 Tempo

- testes criam datas relativas a um relógio controlado ou datas futuras
  calculadas por helper;
- nenhum teste depende de “amanhã” sem timezone do tenant;
- execução paralela não reutiliza profissional/sala/paciente no mesmo slot;
- cenários de conflito criam sobreposição deliberada e isolada por worker.

### 4.3 Autenticação

`loginAs(page, { role, tenantAlias, professionalAlias? })` obtém sessão por
fixture autorizada. O fluxo nunca envia `tenantId` para uma API de domínio.
Cross-tenant usa um id conhecido de B enquanto a sessão continua em A.

## 5. Matriz Given/When/Then

| ID | Tipo | Regra | Resultado esperado |
| --- | --- | --- | --- |
| A1 | happy/mobile | recepção cria appointment único | aparece no dia e persiste |
| A2 | navigation | alternar dia/semana e filtros | intervalo/filtros corretos sem mensal |
| A3 | state | confirmar → reagendar | novo horário, status scheduled, audit observável |
| A4 | state | concluir após início | completed e terminal |
| A5 | state | marcar no-show após início | no-show e terminal, sem saldo/reposição |
| A6 | state | cancelar | preservado como cancelled e slot liberado |
| A7 | validation | criar com referência inativa | erro claro e sem persistência |
| R1 | recurrence | criar série semanal finita | todas as ocorrências aparecem |
| R2 | recurrence | editar uma ocorrência | irmãs intactas |
| R3 | recurrence | editar esta e futuras | passado intacto, futuro alterado |
| R4 | recurrence | cancelar uma ocorrência | série continua |
| R5 | validation | série além do limite | rejeitada sem criação parcial |
| C1 | conflict | mesmo profissional | 409 e formulário preservado |
| C2 | conflict | mesma sala | 409 |
| C3 | conflict | mesmo paciente | 409 |
| C4 | privacy | conflito com terceiro | nenhum nome/detalhe do terceiro |
| B1 | availability | criar block | slot desaparece e criação direta falha |
| B2 | authz | profissional bloqueia recurso alheio | 403 |
| P1 | authz | profissional vê colega como ocupado | sem patient id/nome/serviço |
| P2 | authz | profissional tenta reagendar colega | 403 e registro inalterado |
| T1 | tenant | tenant A abre id de B | 404 e nenhum dado de B |
| T2 | tenant | tenant A envia refs de B | 404 e nada criado |
| O1 | optimistic lock | duas telas editam mesma versão | segunda recebe versão desatualizada |
| E1 | resilience | API falha durante criação | dados do form preservados e retry |
| E2 | offline | agenda perde conexão | estado offline, sem cache tratado como atual |

## 6. Cenários canônicos

```gherkin
Feature: Criar e manter atendimento individual
  Como recepção do studio
  Quero organizar os atendimentos
  Para operar a agenda sem ferramenta paralela

  Scenario: atendimento criado no celular permanece após recarregar
    Given que estou autenticada como RECEPTION do tenant "studio-a"
    And existe uma pessoa, serviço, profissional e sala disponíveis
    When registro um atendimento futuro pela agenda diária
    Then o atendimento aparece no horário selecionado
    And permanece com os mesmos dados após recarregar

  Scenario: cancelamento preserva o registro e libera o horário
    Given um atendimento confirmado no tenant "studio-a"
    When cancelo o atendimento com motivo "Solicitação do paciente"
    Then o atendimento permanece identificado como cancelado
    And o intervalo volta a aparecer disponível
```

```gherkin
Feature: Estados do atendimento
  Scenario: não conclui atendimento antes do início
    Given um atendimento confirmado para um horário futuro
    When tento marcá-lo como concluído
    Then a operação é rejeitada com mensagem de estado inválido
    And o atendimento permanece confirmado

  Scenario: não comparecimento individual não gera reposição
    Given um atendimento cujo horário já iniciou
    When marco o desfecho como "Não compareceu"
    Then o status fica "Não compareceu"
    And nenhuma informação de saldo ou reposição é criada ou exibida
```

```gherkin
Feature: Recorrência semanal
  Scenario: alterar uma ocorrência não desloca a série
    Given uma série semanal com três ocorrências futuras
    When reprogramo somente a segunda ocorrência
    Then a primeira e a terceira mantêm o horário original
    And a segunda permanece no novo horário após recarregar

  Scenario: alterar esta e futuras preserva o passado
    Given uma série com ocorrências passadas e futuras
    When altero o horário desta ocorrência e das próximas
    Then ocorrências passadas mantêm seus dados
    And somente esta e as próximas usam o novo horário
```

```gherkin
Feature: Integridade de conflitos
  Scenario Outline: recurso ocupado impede uma nova reserva
    Given um atendimento existente que ocupa o mesmo <recurso>
    When tento criar outro atendimento no intervalo sobreposto
    Then a criação é rejeitada por conflito de <recurso>
    And nenhum segundo atendimento é persistido

    Examples:
      | recurso      |
      | profissional |
      | sala         |
      | pessoa       |

  Scenario: conflito não revela a identidade de terceiro
    Given que um profissional está ocupado com outra pessoa
    When tento reservar o mesmo horário
    Then vejo apenas que o profissional está indisponível
    And não vejo nome, contato ou serviço da outra pessoa
```

```gherkin
Feature: Autorização e isolamento
  Scenario: profissional não altera atendimento de colega
    Given que estou autenticado como PROFESSIONAL vinculado a "profissional-a1"
    And existe um atendimento de "profissional-a2"
    When tento reagendar esse atendimento pela API
    Then recebo acesso negado
    And o horário original permanece

  Scenario: tenant não acessa appointment de outro tenant por id
    Given que existe um appointment no tenant "studio-b"
    And estou autenticado como ADMIN do tenant "studio-a"
    When tento abrir o appointment do tenant "studio-b"
    Then recebo não encontrado
    And nenhum nome ou detalhe do tenant "studio-b" é exibido
```

## 7. Mapeamento para Playwright

Exemplo:

```ts
test('Scenario: atendimento criado no celular permanece após recarregar', async ({
  page,
}) => {
  // Given: sessão RECEPTION do tenant A e recursos sintéticos disponíveis
  const fixture = await schedulingFixture.createAvailableSlot();
  await loginAs(page, { role: 'RECEPTION', tenantAlias: 'studio-a' });

  // When: cria atendimento pela agenda diária
  await schedulingSteps.createAppointment(page, fixture);

  // Then: aparece e persiste após reload
  await expect(
    page.getByRole('button', { name: new RegExp(fixture.patientDisplayName) }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: new RegExp(fixture.patientDisplayName) }),
  ).toBeVisible();
});
```

Verificações que não cabem na UI, como resposta `404` cross-tenant ou payload
sanitizado, usam `page.request`/fixture API dentro do mesmo cenário. O teste não
deve criar rota de produção só para ser testável.

## 8. Projetos e viewports

No `playwright.config.ts`:

| Projeto | Uso |
| --- | --- |
| `chromium-mobile` 390×844 | gate principal de todos os fluxos operacionais |
| `chromium-desktop` 1440×900 | regressão de agenda semanal, teclado e layout |

WebKit/Firefox podem permanecer na regressão geral se já fizerem parte do CI,
mas não são adicionados por este card sem necessidade.

Configuração de diagnóstico:

```ts
use: {
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

Retries no CI: no máximo 1. Um teste que passa apenas no retry deve ser
investigado; retry não transforma flakiness em sucesso silencioso.

## 9. Segurança de artefatos

- fixtures sintéticas e isoladas;
- screenshots/vídeos nunca usam produção;
- não anexar body completo de API;
- logs de request redigem `authorization`, `cookie`, tokens, CPF, telefone e
  e-mail;
- traces ficam com retenção mínima definida pelo CI;
- `test-results/`, reports, auth states e vídeos permanecem no `.gitignore`;
- storage state não é compartilhado entre papéis/tenants;
- falha cross-tenant é **BLOCKER**, não pode ser marcada flaky/skipped.

## 10. Estabilidade

- waits orientados a estado/assertion;
- nenhum `waitForTimeout`;
- factories idempotentes e nomes únicos;
- clock/timezone controlados;
- cada scenario limpa apenas os próprios dados;
- execução `--workers=1` só é permitida se houver justificativa; o conjunto deve
  provar isolamento sob paralelismo;
- tags/anotações por `@happy`, `@validation`, `@authz`,
  `@tenant-isolation`, `@regression`;
- `test.skip` exige issue Linear vinculada e não pode cobrir gate crítico.

## 11. Comandos e CI

```bash
npx playwright test tests/e2e/domain/scheduling --project=chromium-mobile
npx playwright test tests/e2e/domain/scheduling --project=chromium-desktop
npm run test:e2e
```

O job do CI:

1. instala browsers da versão travada no lockfile;
2. sobe PostgreSQL/API/web de teste;
3. aplica migrations do zero;
4. cria fixtures;
5. roda scheduling mobile e desktop;
6. publica artefatos somente em falha;
7. encerra serviços mesmo em falha.

## 12. Plano de execução

1. [ ] Atualizar CLI-52 no Linear para o recorte CLI-68 e vinculá-la ao pai.
2. [ ] Revisar critérios e testes já entregues por CLI-22/23; não duplicar.
3. [ ] Criar fixtures/helpers tenant-aware e factories sintéticas.
4. [ ] Criar os seis arquivos de domínio do §3.
5. [ ] Implementar a matriz do §5 com comentários Given/When/Then.
6. [ ] Configurar projetos mobile/desktop e artefatos seguros.
7. [ ] Rodar testes isolados, paralelos e a regressão completa.
8. [ ] Corrigir flakiness sem enfraquecer assertions.
9. [ ] Documentar execução/diagnóstico.
10. [ ] Abrir PR `CLI-52 — Regressão E2E da Sprint 3`.

## 13. Definition of Done

- [ ] Todos os cenários críticos da matriz têm teste automatizado.
- [ ] Mobile é o gate principal; desktop passa.
- [ ] Happy, validation, authz, tenant, persistência e regressão cobertos.
- [ ] Nenhum cenário P1 de Pilates foi antecipado.
- [ ] Cross-tenant e policy de profissional exercitam a API server-side.
- [ ] Trace/screenshot/vídeo apenas em falha e sem PII real.
- [ ] Suite passa repetidamente com paralelismo configurado.
- [ ] `npm run test:e2e` passa no CI.
- [ ] Findings de produto voltaram ao card proprietário.

## 14. Riscos

| Risco | Mitigação |
| --- | --- |
| Flakiness por relógio | clock/data relativa e timezone explícito |
| Colisão entre workers | recursos únicos por worker e cleanup escopado |
| E2E provar só UI | assert de persistência e resposta HTTP quando necessário |
| Trace capturar PII | somente dados sintéticos, redaction e retenção mínima |
| Gate crescer para Sprint 6 | matriz fechada na CLI-68 |
