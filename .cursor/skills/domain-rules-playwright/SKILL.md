---
name: domain-rules-playwright
description: >-
  Valida implementações de regras de negócio e domínio com Playwright no formato
  Given/When/Then (Gherkin). Use ao revisar ou testar features de domínio
  (pacientes, agendamentos, contratos, clínico, financeiro, multi-tenant),
  ao pedir BDD/E2E de regras de negócio, aceite de Linear cards, ou quando o
  Playwright Agent precisa cobrir happy path, erros, autorização e isolamento
  de tenant.
---

# Domain Rules Playwright (Given / When / Then)

Especialista em **revisar e testar** se as regras de negócio e domínio estão
realmente implementadas no comportamento observável do sistema — não apenas no
código estático.

Ferramenta principal: **Playwright** (E2E / UI + fluxos críticos).
Formato obrigatório dos cenários: **Given / When / Then** (Gherkin).

Leia e aplique `AGENTS.md` (multi-tenancy, authz, LGPD, Playwright Agent).
Não altere regras de negócio só para fazer testes passarem.

## When to use

Use esta skill quando o usuário pedir para:

- validar regras de negócio / domínio
- revisar implementação com foco em aceite
- criar ou atualizar testes Playwright E2E
- escrever cenários Given/When/Then / Gherkin / BDD
- cobrir Linear card acceptance criteria via E2E
- verificar happy path, validação, autorização, persistência, tenant isolation

Não use para unit tests de serviços NestJS puros (prefira o fluxo QA/unitário),
salvo quando a regra só é comprovável pelo comportamento de ponta a ponta.

## Role boundaries

Esta skill combina:

| Papel | Foco |
| --- | --- |
| **Reviewer de domínio** | A regra existe? Está no lugar certo? Há gaps vs aceite? |
| **Playwright Agent** | O comportamento é observável e automatizado em E2E? |
| **QA Agent** | Happy/error/authz/tenant/regressão cobertos? |

Não aprovar a própria implementação como final se também foi o autor do código
sob teste. Reportar findings; deixar merge/aprovação para o fluxo multi-agent.

---

## Workflow (obrigatório)

### 1. Entender o escopo da regra

Coletar, nesta ordem:

1. Linear card / PRD / acceptance criteria (se houver)
2. Diff / arquivos alterados relevantes ao domínio
3. Contratos em `packages/shared` ou `packages/types`
4. Serviços de domínio/aplicação em `apps/api` (regras de negócio)
5. Fluxos UI em `apps/web` (comportamento observável)

Extrair uma lista explícita de **regras de domínio** testáveis, por exemplo:

- “Paciente só pode ser criado no tenant autenticado”
- “OWNER/ADMIN pode X; PROFESSIONAL não pode Y”
- “Contrato inativo não permite agendar aula”

Se a regra não for observável na UI, documentar e sugerir teste de API/integração
em vez de forçar E2E frágil.

### 2. Revisar a implementação (antes de codar testes)

Verificar:

- [ ] Regra vive em serviço/domínio — não só no controller ou frontend
- [ ] `tenantId` vem da sessão autenticada — nunca do body/query/route do cliente
- [ ] Queries tenant-owned filtram por `tenantId`
- [ ] Autorização server-side (papel/permissão) — não só hide de botão
- [ ] Validação de input no backend
- [ ] Erros não vazam stack/SQL/PII clínico
- [ ] Minimização LGPD (sem dados de saúde desnecessários em logs/artefatos)

Classificar gaps:

| Severidade | Significado |
| --- | --- |
| **BLOCKER** | Cross-tenant leak, IDOR, regra crítica ausente |
| **HIGH** | Authz quebrada, regra de negócio incorreta em fluxo principal |
| **MEDIUM** | Gap de cobertura, validação incompleta, UX inconsistente com regra |
| **LOW** | Naming, flakiness potencial, melhoria de assertividade |

**BLOCKER/HIGH** impedem “validação OK”.

### 3. Modelar cenários Given / When / Then

Para cada regra de domínio, escrever cenários em Gherkin. Preferir linguagem de
negócio (português do domínio Clivyra), não jargão de UI.

Estrutura:

```gherkin
Feature: <capacidade de domínio>
  Como <papel>
  Quero <objetivo>
  Para <valor de negócio>

  Scenario: <resultado observável da regra>
    Given <pré-condição de domínio / contexto autenticado / tenant>
    And <dados ou permissões necessárias>
    When <ação do usuário ou evento do sistema>
    Then <efeito de negócio esperado>
    And <efeito colateral observável / persistência / mensagem>
```

Cobrir, quando aplicável:

1. **Happy path** — regra aplicada com sucesso
2. **Validação** — input inválido / estado inválido
3. **Autorização** — papel sem permissão é bloqueado
4. **Tenant isolation** — recurso de outro tenant inacessível (mesmo ID)
5. **Persistência** — reload/navegação mantém efeito
6. **Regressão** — regra vizinha não quebrou

Anti-padrões:

- Given/When/Then que descrevem cliques sem regra (“clico no botão azul”)
- Then só de CSS/layout sem efeito de domínio
- Um Scenario gigante cobrindo várias regras
- Hardcode de `tenantId` vindo do teste como se fosse input do usuário

Carregar detalhes em `references/gherkin-patterns.md`.

### 4. Mapear Gherkin → Playwright

Convenção sugerida no monorepo:

```text
apps/web/e2e/
  features/                 # opcional: .feature se usar cucumber
  domain/
    <modulo>/
      <regra>.spec.ts       # cenários Given/When/Then como testes
  support/
    fixtures/
    steps/                  # helpers reutilizáveis (Given/When/Then)
    auth.ts
    tenant.ts
```

Se o projeto já tiver pasta Playwright diferente, seguir a existente.

Padrão de teste (comentários Given/When/Then obrigatórios):

```ts
import { test, expect } from '@playwright/test';

test.describe('Feature: Cadastro de paciente', () => {
  test('Scenario: profissional autorizado cria paciente no próprio tenant', async ({ page }) => {
    // Given: sessão autenticada como PROFESSIONAL do tenant A
    await loginAs(page, { role: 'PROFESSIONAL', tenant: 'A' });

    // When: submete cadastro válido de paciente
    await page.goto('/patients/new');
    await fillPatientForm(page, validPatient());
    await page.getByRole('button', { name: /salvar/i }).click();

    // Then: paciente aparece na listagem do tenant A
    await expect(page.getByRole('heading', { name: /pacientes/i })).toBeVisible();
    await expect(page.getByText(validPatient().name)).toBeVisible();
  });
});
```

Regras de implementação dos testes:

- Preferir `getByRole` / `getByLabel` / `getByText` estável
- Isolar dados por teste (factories + cleanup ou tenant de teste)
- Nunca commitar PII real / dados clínicos reais
- Em falha: trace + screenshot + logs seguros (sem saúde/PII)
- Assertar **efeito de domínio**, não só navegação
- Para isolamento de tenant: tentar acessar ID de outro tenant e esperar 404/403

Carregar detalhes em `references/playwright-mapping.md`.

### 5. Executar e diagnosticar

Antes de considerar a validação concluída:

```bash
# ajustar ao package do monorepo quando existir
npm run test:e2e
# ou escopo do domínio
npx playwright test apps/web/e2e/domain/<modulo> --reporter=line
```

Em falha:

1. Abrir trace/screenshot
2. Separar: bug de produto vs teste frágil vs ambiente
3. Não “enfraquecer” o Then para passar
4. Se a regra estiver errada no código, reportar finding — não reescrever regra sem escopo

### 6. Relatório final (formato obrigatório)

```markdown
## Domain validation (Playwright BDD)

### Escopo
- Linear / feature: <id ou nome>
- Regras avaliadas: <lista>

### Review de domínio
- BLOCKER: ...
- HIGH: ...
- MEDIUM: ...
- LOW: ...

### Cenários Given/When/Then
| Regra | Scenario | Resultado |
| --- | --- | --- |
| ... | ... | PASS/FAIL/SKIP |

### Testes
- Criados/atualizados: <paths>
- Comando: <comando> → <pass/fail>

### Segurança / LGPD / tenant
- Isolamento de tenant: coberto / gap
- Authz: coberto / gap
- Artefatos sem PII clínico: ok / gap

### Veredito
- VALIDADO | BLOQUEADO | PARCIAL
- Motivo: ...
```

---

## Clivyra domain checklist (rápido)

Sempre considerar no domínio Clivyra:

- Multi-tenant: Patient, Lead, Appointment, PilatesClass, Contract, Payment,
  Expense, ClinicalRecord, Evaluation, Evolution, Document
- Papéis: OWNER, ADMIN, PROFESSIONAL, RECEPTION/OPERATIONS
- Módulos sensíveis: clínico, financeiro, administração de usuários
- Dados de saúde = sensíveis (LGPD) — minimizar em asserts/logs/traces

Checklist expandido: `references/clivyra-domain-checklist.md`.

---

## Decision tree

```text
Regra é observável na UI/API E2E?
  ├─ Não → documentar; sugerir unit/integration; não inventar E2E frágil
  └─ Sim
       ├─ Falta implementação? → BLOCKER/HIGH + cenário falhando que prova o gap
       ├─ Implementada mas sem teste? → escrever Gherkin + Playwright
       └─ Implementada e coberta? → rodar e reportar VALIDADO
```

## Do / Don't

**Do**

- Traduzir acceptance criteria em Given/When/Then antes de codar
- Provar isolamento de tenant com IDs cruzados
- Provar authz negativa (papel sem permissão)
- Manter um Scenario = uma regra observável
- Usar fixtures de auth/tenant reutilizáveis

**Don't**

- Confiar só em guard de frontend
- Logar/anexar conteúdo clínico em falhas
- Aceitar teste que passa com selector flaky e Then vazio
- Expandir escopo para Linear cards não pedidas
- Alterar regra de negócio só para verde no CI

## Supporting files

- `references/gherkin-patterns.md` — padrões Given/When/Then e exemplos Clivyra
- `references/playwright-mapping.md` — mapeamento Gherkin → Playwright
- `references/clivyra-domain-checklist.md` — checklist de domínio / segurança
