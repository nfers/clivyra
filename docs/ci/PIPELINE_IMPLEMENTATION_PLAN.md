# Plano de implementação — Esteira CI Clivyra

**Objetivo:** padronizar a validação automática em GitHub Actions com:

1. **Lint + boas práticas de código**
2. **Testes unitários**
3. **Testes de integração**
4. **Testes E2E (Playwright)** — já previstos no bootstrap
5. **Security guardrails**
6. **Gate agregado** para merge

**Escopo de ambientes de deploy (fora deste doc, mas na esteira):** `dev` e `prod` na OCI — ver `infra/oci/README.md` (PR de deploy).

**Pré-requisito:** merge do bootstrap monorepo (`package.json` + lockfile + workspaces). Sem isso, o gate atual continua no modo “pré-bootstrap”.

---

## 1. Estado atual

| Peça | Hoje | Gap |
| --- | --- | --- |
| PR Quality Gate | `pr-check.yml` — lint, typecheck, `npm test`, audit (quando Node existe) | Jobs misturados; sem integração explícita; sem E2E no PR gate |
| Bootstrap CI | `ci.yml` no PR CLI-5 — lint, typecheck, test, build, e2e | Ainda não está em `master` |
| Unitários | Jest no API (`*.spec.ts`) via `npm test` | Precisa script/naming estável e cobertura mínima |
| Integração | Não padronizado | Falta `test:integration` + Postgres de serviço no Actions |
| Lint / boas práticas | ESLint root | Falta format check, regras de arquitetura/tenant, report no CI |
| Deploy | Scaffold OCI | Só sobe depois de CI verde (ainda a amarrar) |

Alinhamento com `AGENTS.md` (validação mandatória):

```text
npm run lint
npm run typecheck
npm test
npm run test:e2e
(+ integration quando aplicável)
```

---

## 2. Arquitetura-alvo da esteira

```text
                    ┌─────────────────────┐
                    │ Repository Readiness│
                    │ (package.json+lock) │
                    └─────────┬───────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │ node_ready=false   │                    │ node_ready=true
         ▼                    │                    ▼
┌─────────────────┐           │     ┌──────────────────────────────┐
│ Bootstrap Status│           │     │ parallel quality jobs        │
│ (skip explicado)│           │     │                              │
└────────┬────────┘           │     │ 1. lint-and-standards        │
         │                    │     │ 2. typecheck                 │
         │                    │     │ 3. unit-tests                │
         │                    │     │ 4. integration-tests (+PG)   │
         │                    │     │ 5. e2e-playwright            │
         │                    │     │ 6. security                  │
         │                    │     └──────────────┬───────────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ Quality Gate Result │  ← required check
                    └─────────────────────┘
                              │
                    (só em develop/master)
                              ▼
                    ┌─────────────────────┐
                    │ Deploy OCI (dev/prod)│
                    │ needs: gate success │
                    └─────────────────────┘
```

### Princípios

- **Jobs separados** para falha diagnóstica clara (lint ≠ unit ≠ integration ≠ e2e).
- **Fail-fast em lint/typecheck** antes de gastar minutos em E2E (E2E `needs` lint+typecheck+unit).
- **Integração com Postgres real** via `services:` do Actions (não mockar o banco na integração).
- **Sem PII/clínico** em logs, traces ou artefatos (LGPD).
- **Um único check obrigatório** no ruleset: `Quality Gate Result`.

---

## 3. Scripts npm a padronizar (root)

Após o bootstrap, o `package.json` root deve expor:

| Script | Responsabilidade |
| --- | --- |
| `lint` | ESLint em apps/packages |
| `lint:fix` | ESLint `--fix` (local; CI não auto-fix) |
| `format:check` | Prettier check (ou ESLint stylistic) |
| `typecheck` | `tsc --noEmit` nos workspaces |
| `test` / `test:unit` | Unitários (Jest/Vitest) **sem** I/O externo |
| `test:integration` | API + Postgres (Prisma migrate + supertest/nest testing) |
| `test:e2e` | Playwright |
| `test:ci` | Atalho local: unit + integration |
| `build` | Build de produção dos apps |
| `audit:ci` | `npm audit --audit-level=high` |

### Convenção de arquivos

| Tipo | Padrão | Onde |
| --- | --- | --- |
| Unit | `*.spec.ts` / `*.test.ts` | junto do código (`apps/api/src/...`) |
| Integration | `*.integration.spec.ts` | `apps/api/test/integration/` |
| E2E | `*.spec.ts` | `tests/e2e/` (Playwright) |

**Regra:** `npm test` / `test:unit` **não** sobe Postgres. Integração só em `test:integration`.

---

## 4. Job 1 — Lint e boas práticas (`lint-and-standards`)

### O que valida

1. **ESLint** (`npm run lint`) — erros = falha.
2. **Format check** (`npm run format:check`) — Prettier ou equivalente.
3. **Type-aware rules** já cobertas em parte pelo typecheck separado; manter ESLint sem duplicar custo demais.
4. **Boas práticas Clivyra** (regras/custom checks progressivos):
   - banir `console.log` em `apps/api` (permitir logger estruturado)
   - impedir import de SDK LLM fora do AI Gateway
   - flagrar `tenantId` vindo de `body`/`query`/`params` em controllers (heuristic lint ou script `scripts/check-tenant-boundaries.mjs`)
   - `no-floating-promises`, `eqeqeq`, unused imports, etc.

### Implementação sugerida (fases)

| Fase | Entrega |
| --- | --- |
| A | ESLint flat config + `lint` no CI (já no bootstrap) |
| B | Prettier + `format:check` |
| C | Script `check:standards` com denylist de imports/padrões perigosos |
| D | (Opcional) Sonar/CodeQL depois — não bloquear Sprint 0 |

### Step no Actions

```yaml
- run: npm ci
- run: npm run lint
- run: npm run format:check
- run: npm run check:standards   # quando existir
```

Artefato: upload do ESLint JSON só se falhar (opcional).

---

## 5. Job 2 — Typecheck

```yaml
- run: npm ci
- run: npm run typecheck
```

Job próprio para não misturar falha de tipo com falha de estilo.

---

## 6. Job 3 — Testes unitários (`unit-tests`)

### Escopo

- Domínio / application services
- Guards, pipes, mappers
- Utilitários shared
- **Sem** banco, Redis, HTTP real, LLM

### CI

```yaml
- run: npm ci
- run: npm run test:unit -- --coverage --ci
```

### Critérios

- Exit code ≠ 0 falha o gate
- Cobertura: começar **informativa**; meta inicial sugerida após CLI-5:
  - statements ≥ 60% em `packages/*` e services de domínio críticos
  - **não** falhar CI por coverage até estabilizar (fase 2: `--coverageThreshold`)
- Relatório JUnit/HTML como artifact em falha

### Exemplos prioritários pós-bootstrap

1. Tenant context resolver (nunca confiar em input)
2. RBAC permission checks
3. Validação de DTOs / pipes
4. Regras de domínio puras (sem Nest module)

---

## 7. Job 4 — Testes de integração (`integration-tests`)

### Escopo

- HTTP real da API (Nest) + **Postgres** + Prisma
- Multi-tenant isolation (IDOR / cross-tenant)
- Auth session flows quando CLI-12 existir
- Migrations aplicáveis (`prisma migrate deploy`)

### Serviço no Actions

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: clivyra
      POSTGRES_PASSWORD: clivyra
      POSTGRES_DB: clivyra_test
    ports: ["5432:5432"]
    options: >-
      --health-cmd "pg_isready -U clivyra -d clivyra_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
```

### Steps

```yaml
- run: npm ci
- run: npm run db:generate
- env:
    DATABASE_URL: postgresql://clivyra:clivyra@localhost:5432/clivyra_test?schema=public
  run: npm run db:migrate:deploy   # script a criar
- env:
    DATABASE_URL: ...
  run: npm run test:integration -- --ci
```

### Casos mínimos (Definition of Done da esteira)

| Caso | Por quê |
| --- | --- |
| Health/ready com DB up | Smoke |
| Criar recurso no tenant A e negar leitura no tenant B | BLOCKER multi-tenant |
| Request sem auth em rota protegida → 401 | Authz |
| Validação de payload inválido → 400 | Contrato API |

### LGPD

- Fixtures sintéticas apenas
- Sem dumps de response com dados clínicos em logs do Actions

---

## 8. Job 5 — E2E Playwright (`e2e`)

### Quando rodar

- Em **todo PR** que toque `apps/web`, `apps/api`, ou contratos shared (path filters opcionais depois)
- Em **push** `develop` / `master` sempre
- `needs: [lint-and-standards, typecheck, unit-tests]` para economizar

### Steps

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm run test:e2e
```

### Artefatos em falha

- trace, screenshot, video (`retain-on-failure`)
- **redigir** conteúdo clínico se aparecer

Usar skill `domain-rules-playwright` para cenários Given/When/Then de domínio.

---

## 9. Job 6 — Security

Manter paralelo:

- `npm audit --audit-level=high`
- Secret scan (TruffleHog) no `ci.yml` de push/PR
- (Depois) CodeQL / Dependabot já previsto no bootstrap

---

## 10. Desenho dos workflows

### A. `.github/workflows/pr-check.yml` (PR Quality Gate)

Responsável pelo **merge gate** em pull_request.

Jobs:

1. `readiness`
2. `lint-and-standards` (if node_ready)
3. `typecheck`
4. `unit-tests`
5. `integration-tests` (+ Postgres service)
6. `e2e` (needs 2–4; opcionalmente 5)
7. `security`
8. `bootstrap-status` (if !node_ready)
9. `gate-result` (`if: always()`, agrega tudo) ← **required check**

### B. `.github/workflows/ci.yml` (push + PR)

Espelho/completo para `develop`/`master` (build + e2e + secret-scan). Evitar duplicar custo: PR pode usar só `pr-check.yml`; `ci.yml` em push nas branches principais.

### C. `.github/workflows/deploy-oci.yml`

```yaml
needs: []  # disparado só em push develop/master
# Condição: somente após CI daquele commit verde
# Usar `workflow_run` OU exigir checks verdes via environment protection
```

Recomendação: **Environment protection rules** em `dev`/`prod` exigindo check `Quality Gate Result` ou `CI / quality` antes do deploy job.

---

## 11. Fases de implementação

### Fase 0 — Pré-requisito (bloqueante)

- [ ] Merge CLI-5 bootstrap monorepo
- [ ] Confirmar scripts `lint`, `typecheck`, `test`, `test:e2e`
- [ ] Actions billing desbloqueado (já feito)

### Fase 1 — Separar jobs no PR gate (rápido)

- [ ] Quebrar job único “Lint, Typecheck and Tests” em:
  - `lint-and-standards`
  - `typecheck`
  - `unit-tests`
- [ ] Manter `security` + `gate-result`
- [ ] Atualizar `.github/CI.md`
- [ ] Alias `test:unit` → mesmo que `test` inicialmente

**Aceite:** PR com monorepo mostra 3 checks distintos; falha de lint não aparece como “test failed”.

### Fase 2 — Boas práticas

- [ ] Adicionar Prettier + `format:check`
- [ ] Endurecer ESLint (`@typescript-eslint`, import boundaries apps/packages)
- [ ] Script `check:standards` (tenant input / LLM SDK denylist)
- [ ] Step no job lint

**Aceite:** PR com `tenantId` no body de controller falha `check:standards` (quando regra ativa).

### Fase 3 — Integração no Actions

- [ ] Pasta `apps/api/test/integration/`
- [ ] Script `test:integration` + `db:migrate:deploy`
- [ ] Job `integration-tests` com service Postgres
- [ ] Casos tenant isolation + 401 + validation
- [ ] Incluir no `gate-result`

**Aceite:** teste de cross-tenant vermelho se remover filtro `tenantId`.

### Fase 4 — E2E no gate

- [ ] Job `e2e` no `pr-check.yml` (ou só em `ci.yml` de push se minutos forem preocupação — repo público = ok no PR)
- [ ] Artefatos Playwright em falha
- [ ] Smoke health + 1 fluxo domínio (Given/When/Then)

**Aceite:** Playwright falha bloqueia `Quality Gate Result`.

### Fase 5 — Amarração deploy

- [ ] Environment `dev`/`prod` com required reviewers (prod)
- [ ] Deploy só com gate verde
- [ ] Dockerfile de produção alinhado ao exemplo OCI

### Fase 6 — Endurecimento

- [ ] Coverage thresholds em pacotes críticos
- [ ] Path filters (E2E só quando UI/API muda) — opcional
- [ ] Cache npm + Playwright browsers
- [ ] CodeQL / Dependabot

---

## 12. Matriz de responsabilidade (multi-agent)

| Camada | Agente | O que entrega na esteira |
| --- | --- | --- |
| Unit / Integration specs | QA Agent | Casos + asserts; não muda regra de negócio |
| E2E Gherkin/Playwright | Playwright Agent + skill `domain-rules-playwright` | Fluxos observáveis |
| Lint/standards rules | Developer + Reviewer | ESLint/standards scripts |
| Audit CI vermelho | Security Agent | Classificação BLOCKER/HIGH |
| Gate final | CI | `Quality Gate Result` |

---

## 13. Esqueleto YAML-alvo (referência)

> Implementar na Fase 1–4; não ativar jobs Node até existir lockfile.

```yaml
# trecho conceitual — jobs pós node_ready=true
lint-and-standards:
  needs: readiness
  if: needs.readiness.outputs.node_ready == 'true'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npm run lint
    - run: npm run format:check
    - run: npm run check:standards

typecheck:
  needs: readiness
  if: needs.readiness.outputs.node_ready == 'true'
  steps: [checkout, setup-node, npm ci, npm run typecheck]

unit-tests:
  needs: readiness
  if: needs.readiness.outputs.node_ready == 'true'
  steps: [checkout, setup-node, npm ci, npm run test:unit -- --ci]

integration-tests:
  needs: readiness
  if: needs.readiness.outputs.node_ready == 'true'
  services:
    postgres: { image: postgres:16-alpine, ... }
  steps:
    - [checkout, setup-node, npm ci]
    - run: npm run db:generate
    - run: npm run db:migrate:deploy
      env: { DATABASE_URL: postgresql://clivyra:clivyra@localhost:5432/clivyra_test?schema=public }
    - run: npm run test:integration -- --ci
      env: { DATABASE_URL: ... }

e2e:
  needs: [lint-and-standards, typecheck, unit-tests]
  if: needs.readiness.outputs.node_ready == 'true'
  steps:
    - [checkout, setup-node, npm ci]
    - run: npx playwright install --with-deps chromium
    - run: npm run build
    - run: npm run test:e2e

security:
  needs: readiness
  if: needs.readiness.outputs.node_ready == 'true'
  steps: [checkout, setup-node, npm ci, npm audit --audit-level=high]

gate-result:
  needs: [readiness, lint-and-standards, typecheck, unit-tests, integration-tests, e2e, security, bootstrap-status]
  if: always()
  # falha se qualquer needed job necessário falhou
```

---

## 14. Checklist de aceite da esteira completa

- [ ] PR sem `package.json` ainda passa no caminho bootstrap
- [ ] PR com monorepo executa lint, format/standards, typecheck, unit, integration, e2e, security
- [ ] Falha em **qualquer** um falha `Quality Gate Result`
- [ ] Integração sobe Postgres e prova isolamento de tenant
- [ ] Unitário não depende de rede/DB
- [ ] Artefatos E2E sem dado clínico real
- [ ] Docs `.github/CI.md` atualizados
- [ ] Ruleset recomenda required check apenas `Quality Gate Result`
- [ ] Deploy OCI não roda com gate vermelho

---

## 15. Ordem de PRs sugerida

1. **CLI-5** — bootstrap monorepo (base)
2. **Este plano** (doc) — alinhamento do time
3. **CI Fase 1** — split de jobs + `test:unit`
4. **CI Fase 2** — format + `check:standards`
5. **CI Fase 3** — `test:integration` + service Postgres
6. **CI Fase 4** — E2E no PR gate
7. **OCI deploy** — amarrar environments ao gate
8. **Fase 6** — coverage thresholds / CodeQL

---

## 16. Riscos

| Risco | Mitigação |
| --- | --- |
| Bootstrap ainda não mergeado | Manter `readiness` + skip |
| E2E flaky | `needs` unitários; retries Playwright; traces |
| Integração lenta | Job paralelo; DB só na integração |
| Duplicar `pr-check` e `ci.yml` | PR gate = merge; `ci.yml` = push branches |
| Falso positivo lint de tenant | Começar heuristic em `scripts/` com allowlist |

---

## Referências

- `AGENTS.md` — validação mandatória, Playwright, Security, multi-tenant
- `.github/CI.md` — operação atual do gate
- `.cursor/skills/domain-rules-playwright/` — BDD E2E domínio
- `infra/oci/README.md` — deploy dev/prod (quando mergeado)
- Bootstrap: `feat/CLI-5-bootstrap-monorepo`
