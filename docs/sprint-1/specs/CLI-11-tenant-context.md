# Spec — CLI-11 Contexto de tenant e isolamento multi-tenant

| Campo | Valor |
| --- | --- |
| Linear | [CLI-11](https://linear.app/clivyra/issue/CLI-11/sprint-1-implementar-contexto-de-tenant-e-isolamento-multi-tenant) — Urgent — In Progress |
| Pai | CLI-66 |
| Branch | `feat/CLI-11-tenant-context` (nova, a partir de `master`; cherry-pick de `2b86e38`) |
| Depende de | Bootstrap (mergeado), CI Fase 3 (`test:integration`) ou job incluído neste PR |
| Bloqueia | CLI-12, CLI-13, CLI-14, CLI-15, CLI-16 |
| Plano geral | [`../PLANO_IMPLEMENTACAO.md`](../PLANO_IMPLEMENTACAO.md) |

## 1. Objetivo

Garantir isolamento lógico de dados por clínica/studio desde a primeira entidade de negócio: todo dado tenant-owned carrega `tenantId`, o tenant ativo é resolvido **exclusivamente** da sessão autenticada, é propagado por request e imposto na camada Prisma, e há testes que provam a ausência de vazamento horizontal.

## 2. Escopo

### Dentro

- Entidades `Tenant`, `User` (global), `Membership` (vínculo usuário↔tenant com papel).
- `TenantContext` resolvido de um principal autenticado e revalidado a cada request (membership, usuário e tenant ativos).
- Propagação do contexto por request via `request.tenantContext` **e** `AsyncLocalStorage`.
- Prisma Client Extension `tenantScoped`: injeta e exige `tenantId` em modelos registrados como tenant-owned.
- Fundações transversais: `RequestContext` (requestId/ip/userAgent), logger estruturado com redaction, harness de integração com Postgres, contratos em `packages/types`, script `check:standards`.
- Seed idempotente de tenant demo + OWNER (já existe na pilha; manter sem senha em texto puro).
- Testes unitários e de integração de isolamento.

### Fora

- Login/tokens (CLI-12). Neste card o principal é injetado por um guard de teste/fake; a API não expõe login.
- Permissões por papel (CLI-13). Aqui o `role` é apenas carregado no contexto.
- Row-Level Security no Postgres (decisão D6 — follow-up).
- Qualquer entidade de negócio (paciente, agenda).

## 3. Critérios de aceite (Linear) → verificação

| Critério | Como será provado |
| --- | --- |
| Usuário de um tenant não lê nem altera dados de outro | Integração: usuário de `studio-a` lista/atualiza `Membership` e `RefreshSession` e nunca vê registros de `studio-b`; update/delete por id de outro tenant → `404` e 0 linhas afetadas |
| Queries de domínio sempre aplicam `tenantId` | Extension Prisma injeta filtro em todo modelo tenant-owned; unit test remove o contexto e a query falha com `TenantContextMissingError`; `check:standards` denuncia `tenantId` vindo de input |
| Testes automatizados cobrem vazamento horizontal | Suite `tenant-isolation.integration.spec.ts` obrigatória no gate |
| Tenant ativo é propagado por request | `TenantContextGuard` grava `request.tenantContext` e `TenantContextStorage.run()`; serviço sem acesso ao request lê o contexto do ALS; teste concorrente prova que dois requests paralelos não se misturam |

## 4. Estado atual e gaps

Código de referência em `origin/feat/CLI-11-tenant-context` (commit `2b86e38`): schema `Tenant`/`User`/`Membership`, `TenantContextGuard`, `TenantMembershipRepository`, `TenantPrismaService` (helper `where`/`createData`/`assertTenantOwnership`), `@CurrentTenant()`, seed, `docs/tenant-context.md`.

| Gap | Ação |
| --- | --- |
| Filtro de tenant é opt-in (helper) | Adicionar extension que torna o filtro obrigatório; manter o helper como açúcar para casos explícitos |
| Contexto só via `request` | Adicionar ALS (`TenantContextStorage`) |
| Só testes unitários | Harness de integração + cenários cross-tenant |
| Sem `requestId`/logger | Fundações transversais (§6) |
| Tipos só na API | Mover `Role`, `TenantContext` para `packages/types` |

## 5. Modelo de dados

```prisma
enum MembershipRole {
  OWNER
  ADMIN
  PROFESSIONAL
  RECEPTION
}

model Tenant {
  id          String       @id @default(cuid())
  slug        String       @unique
  name        String
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  memberships Membership[]

  @@index([isActive])
}

/// Entidade GLOBAL (não tenant-owned). Uma pessoa pode pertencer a vários tenants via Membership.
model User {
  id           String       @id @default(cuid())
  email        String       @unique          // normalizado lower-case na aplicação
  name         String
  passwordHash String?                        // preenchido em CLI-12
  isActive     Boolean      @default(true)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  memberships  Membership[]

  @@index([isActive])
}

model Membership {
  id        String         @id @default(cuid())
  tenantId  String
  userId    String
  role      MembershipRole
  isActive  Boolean        @default(true)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])
  @@index([tenantId, role])
  @@index([tenantId, isActive])
  @@index([userId, isActive])
}
```

Diferenças em relação à pilha antiga: `onDelete: Restrict` em `Tenant` (não apagar tenant com vínculos; desativação via `isActive`); unique reordenado para `[tenantId, userId]` (padrão "tenant primeiro").

Migration: `prisma/migrations/<ts>_tenant_context/` — aditiva, sem dados existentes além de `SystemMetadata`.

### Registro de modelos tenant-owned

```ts
// apps/api/src/prisma/tenant-owned-models.ts
export const TENANT_OWNED_MODELS = ['Membership'] as const // cada card acrescenta os seus
export const GLOBAL_MODELS = ['SystemMetadata', 'User', 'Tenant'] as const
```

Regra de revisão: todo `model` novo no schema deve aparecer em uma das duas listas; um teste unitário compara o DMMF do Prisma com as listas e falha se houver modelo não classificado.

## 6. Design

### 6.1 Módulos e arquivos

```text
apps/api/src/
  common/
    request-context/
      request-context.middleware.ts   # gera/propaga X-Request-Id, captura ip e user-agent truncado
      request-context.storage.ts      # AsyncLocalStorage<RequestContext>
    logging/
      app-logger.service.ts           # JSON, campos requestId/tenantId/userId, redaction
      redaction.ts                    # denylist: password, token, secret, authorization, cookie, hash
  prisma/
    prisma.module.ts
    prisma.service.ts                 # PrismaClient base + $extends(tenantScoped)
    tenant-owned-models.ts
    tenant-scoped.extension.ts        # extension descrita em 6.3
    tenant-scope.errors.ts            # TenantContextMissingError, TenantScopeViolationError
  tenant/
    tenant.module.ts
    tenant-context.types.ts           # re-export de @clivyra/types
    tenant-context.storage.ts         # AsyncLocalStorage<TenantContext>
    tenant-context.guard.ts
    tenant-context.decorator.ts       # @CurrentTenant()
    tenant-membership.repository.ts
    tenant-prisma.service.ts          # mantém where/createData/assertTenantOwnership (açúcar explícito)
  health.controller.ts                # + /health/ready com SELECT 1
packages/types/src/
  tenant.ts                           # Role, TenantContext, AuthenticatedPrincipal
scripts/
  check-tenant-boundaries.mjs
apps/api/test/
  integration/
    setup/ (global-setup.ts, fixtures.ts, test-app.ts)
    tenant-isolation.integration.spec.ts
```

### 6.2 Contexto por request

```ts
// packages/types/src/tenant.ts
export type Role = 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'RECEPTION'

export interface AuthenticatedPrincipal {
  readonly userId: string
  readonly currentTenantId: string
  readonly sessionId?: string
}

export interface TenantContext {
  readonly userId: string
  readonly tenantId: string
  readonly membershipId: string
  readonly role: Role
}
```

Fluxo:

```mermaid
sequenceDiagram
  participant C as Cliente
  participant M as RequestContextMiddleware
  participant A as AuthGuard (CLI-12)
  participant T as TenantContextGuard
  participant S as Service
  participant P as Prisma (tenantScoped)

  C->>M: HTTP + X-Request-Id?
  M->>M: requestId = header válido || uuid; ALS(RequestContext).run
  M->>A: next()
  A->>A: request.user = { userId, currentTenantId, sessionId }
  A->>T: canActivate
  T->>P: findActiveMembership(userId, tenantId) [modelo Membership, bypass explícito]
  P-->>T: membership | null
  T->>T: request.tenantContext = ctx; TenantContextStorage.enter(ctx)
  T->>S: handler
  S->>P: prisma.membership.findMany({ where: {...} })
  P->>P: where = AND(where, { tenantId: ctx.tenantId })
  P-->>S: rows só do tenant
```

Pontos de atenção:

- O `TenantContextGuard` **nunca** lê `tenantId` de body/query/params/headers arbitrários. A única fonte é `request.user.currentTenantId`, que em CLI-12 vem do token assinado.
- Falha de membership retorna `401` com mensagem genérica (`Authenticated tenant context is required`), não revela se o tenant existe.
- O guard grava o contexto no ALS com `TenantContextStorage.enterWith(ctx)` dentro do escopo já criado pelo middleware (Nest não permite `run()` envolvendo o handler a partir de um guard; usar `enterWith` no store já iniciado pelo middleware ou um interceptor `TenantContextInterceptor` que faz `run()`). Escolha recomendada: middleware cria o store do request; guard preenche `tenantContext` nesse store.

### 6.3 Prisma Client Extension `tenantScoped`

Responsabilidades:

1. Para operações em modelos de `TENANT_OWNED_MODELS`:
   - `findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`, `groupBy`, `updateMany`, `deleteMany`: `args.where = { AND: [args.where ?? {}, { tenantId }] }`.
   - `findUnique`/`findUniqueOrThrow`: reescrever para `findFirst` com `AND tenantId` (o where único não aceita filtro extra em todos os casos).
   - `update`, `delete`, `upsert`: exigir que a linha pertença ao tenant — implementar como `updateMany`/`deleteMany` com `tenantId` + `id` e converter `count === 0` em `NotFoundError` (mapeada para `404`), ou `findFirst` + operação em transação.
   - `create`, `createMany`: sobrescrever `data.tenantId = tenantId`; se `data.tenantId` vier diferente do contexto → `TenantScopeViolationError` (nunca confiar em input).
   - `connect`/nested writes: fora do P0 exigir que relações aninhadas só apontem para modelos tenant-owned do mesmo tenant; documentar e cobrir por teste ao surgir a primeira relação aninhada (CLI-16).
2. Se não houver `TenantContext` no ALS e o modelo for tenant-owned → lançar `TenantContextMissingError` (`500` interno, logado como bug), **exceto** dentro de `prisma.bypassTenant(reason, fn)`.
3. `bypassTenant(reason, fn)`: usado por seed, jobs de sistema, `TenantMembershipRepository` (que roda antes do contexto existir) e o guard. Cada uso é logado (`level=warn`, `reason`, `requestId`) e, a partir de CLI-14, auditado como `system.tenant_bypass`.
4. Modelos em `GLOBAL_MODELS` passam sem alteração.

A extension não substitui `TenantPrismaService`; este continua disponível para deixar a intenção explícita e para `assertTenantOwnership` em entidades já carregadas.

### 6.4 Fundações transversais

**RequestContextMiddleware**: aceita `X-Request-Id` apenas se casar `^[A-Za-z0-9._-]{8,128}$`; caso contrário gera UUIDv4. Devolve o header na resposta. Captura `ip` (respeitando `trust proxy` configurado para OCI) e `user-agent` truncado em 256 chars. Nada disso é logado com PII além do IP (que em CLI-14 será hasheado ao persistir).

**AppLogger**: implementa `LoggerService` do Nest; saída JSON `{ ts, level, msg, requestId, tenantId, userId, context, ...meta }`; `redact(meta)` remove valores de chaves que casem `/(password|token|secret|authorization|cookie|hash|pepper)/i` e trunca strings > 2 kB. Substitui o logger default em `main.ts`. Proíbe `console.log` em `apps/api` via ESLint (`no-console`).

**Health**: `GET /health` mantém; `GET /health/ready` faz `SELECT 1` com timeout 2 s e retorna `503` se falhar. Sem tenant (rota pública).

**Harness de integração**:

- `apps/api/test/integration/setup/global-setup.ts`: aplica `prisma migrate deploy` em `DATABASE_URL` de teste (schema isolado por worker: `?schema=it_<worker>`), trunca tabelas entre suites.
- `fixtures.ts`: cria `studio-a`, `studio-b`, usuários `owner@a`, `pro@a`, `owner@b` com memberships. Sem senha neste card (`passwordHash` null); autenticação simulada por `TestPrincipalGuard` que lê `x-test-principal` **apenas** quando `NODE_ENV=test` (o guard não é registrado fora de teste; unit test garante isso).
- `test-app.ts`: sobe `AppModule` com `TestPrincipalGuard` no lugar do `AuthGuard`.
- Script raiz `test:integration` → `jest --config apps/api/jest.integration.config.cjs --runInBand`; `db:migrate:deploy` → `prisma migrate deploy`.
- CI: job `integration-tests` com service Postgres (ver plano da esteira §7). Se o PR de CI não estiver mergeado, este PR adiciona o job em `pr-check.yml`.

**`scripts/check-tenant-boundaries.mjs`** (parte de `check:standards`):

- Falha se encontrar `tenantId` em arquivos `*.dto.ts`, em `@Query(`/`@Param(`/`@Body(` de controllers, ou em `@Headers('x-tenant`.
- Falha se encontrar `prisma.<modelo tenant-owned>.` em `apps/api/src/**` fora de `prisma/`, `tenant/` e `**/*.repository.ts`? — **não** neste card (muito restritivo); apenas a heurística de input. Allowlist por comentário `// tenant-boundary: allow <motivo>`.

### 6.5 Contratos compartilhados

`packages/types/src/index.ts` passa a exportar `tenant.ts`. `apps/api` e `apps/web` importam `Role`/`TenantContext` daí. Nenhuma dependência de `@prisma/client` em `packages/*`.

## 7. Regras de negócio e invariantes

- `Tenant.slug` é imutável após criação, `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$`, reservados: `admin`, `api`, `www`, `app`, `clivyra`.
- `User.email` único global, normalizado (`trim().toLowerCase()`) antes de persistir/consultar.
- Um `Membership` por `(tenantId, userId)`; papel único por vínculo.
- Contexto válido exige `Tenant.isActive && User.isActive && Membership.isActive`.
- Desativar tenant não apaga dados; toda query passa a falhar no guard.
- Nunca existe query em modelo tenant-owned sem `tenantId` fora de `bypassTenant`.

## 8. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Tenant vindo do cliente (mass assignment, header forjado) | Guard ignora input; extension sobrescreve `data.tenantId`; `check:standards` |
| IDOR por id de outro tenant | Extension força `tenantId` em update/delete → `404`; `assertTenantOwnership` para entidades carregadas |
| Vazamento em listagens | Filtro injetado em `findMany/count/aggregate/groupBy` |
| Bypass silencioso | `bypassTenant` exige `reason`, é logado e (CLI-14) auditado |
| Enumeração de tenants/usuários por mensagens de erro | Mensagens genéricas em 401/404 |
| Logs com PII | Redaction + sem body em logs; IP só em memória neste card |
| Contexto vazando entre requests concorrentes | ALS por request; teste de concorrência |

Classificação: falha em qualquer item das três primeiras linhas = **BLOCKER**.

## 9. Observabilidade

- Todo log carrega `requestId`; após o guard, também `tenantId` e `userId`.
- Métrica/contador (log estruturado no P0): `tenant_context.denied` (motivo: `no_principal`, `inactive_membership`), `tenant_scope.bypass` (reason).
- `X-Request-Id` devolvido em todas as respostas, inclusive erros.

## 10. Testes

### Unit (`apps/api/src/**/*.spec.ts`)

- `TenantContextGuard`: sem principal → 401; membership inativa → 401; sucesso preenche request e ALS; nunca lê `req.body.tenantId`.
- `tenantScoped` extension (Prisma mockado via `$extends` sobre client fake ou `prisma-mock`): injeta `tenantId` em cada operação; `create` com `tenantId` divergente → `TenantScopeViolationError`; sem contexto → `TenantContextMissingError`; `bypassTenant` libera e registra log; modelo global intacto.
- `tenant-owned-models.spec.ts`: todo modelo do DMMF está classificado.
- `RequestContextMiddleware`: valida/gera `X-Request-Id`; trunca user-agent.
- `AppLogger.redact`: remove `password`, `refreshToken`, `authorization`, aninhados.
- `TestPrincipalGuard` não é registrado quando `NODE_ENV !== 'test'`.

### Integração (`apps/api/test/integration/tenant-isolation.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| `owner@a` lista memberships | só `studio-a` |
| `owner@a` faz `update` em membership de `studio-b` por id | `404`, linha inalterada |
| `owner@a` faz `delete` em membership de `studio-b` | `404`, linha existe |
| `create` via serviço com `tenantId` de `studio-b` no payload | `TenantScopeViolationError` → `400`, nada criado |
| Request sem principal em rota protegida | `401` |
| Membership desativada | `401` |
| 50 requests paralelos alternando A/B | cada resposta só contém dados do seu tenant |
| `GET /health/ready` com DB up | `200`; com `DATABASE_URL` inválido → `503` |

Rota de teste para exercitar as operações: `GET/PATCH/DELETE /__test__/memberships` registrada **somente** em `NODE_ENV=test` (removida em CLI-13 quando `/users` existir).

### E2E

Nenhum fluxo visível neste card. `tests/e2e/technical-health.spec.ts` ganha verificação de `X-Request-Id` na resposta de `/health`.

## 11. Plano de execução

1. [ ] Criar `feat/CLI-11-tenant-context` a partir de `master`; `git cherry-pick 2b86e38`; resolver `package-lock.json`.
2. [ ] Ajustar schema (§5): `onDelete: Restrict`, unique `[tenantId, userId]`; gerar migration nova (descartar a antiga do cherry-pick).
3. [ ] Mover tipos para `packages/types/src/tenant.ts`; API e web consomem.
4. [ ] `RequestContextMiddleware` + `AppLogger` + `no-console` no ESLint da API; ligar em `main.ts`.
5. [ ] `TenantContextStorage` (ALS) e preencher no guard.
6. [ ] `TENANT_OWNED_MODELS` + `tenantScoped` extension + `bypassTenant`; `PrismaService` expõe o client estendido; `TenantMembershipRepository` usa bypass com `reason='resolve-membership'`.
7. [ ] `GET /health/ready`.
8. [ ] Harness de integração (`jest.integration.config.cjs`, setup, fixtures, `TestPrincipalGuard`, rota `__test__`).
9. [ ] Scripts raiz: `test:integration`, `db:migrate:deploy`, `check:standards` (+ `check-tenant-boundaries.mjs`).
10. [ ] Job `integration-tests` no CI (se ausente).
11. [ ] Testes unitários e de integração da §10.
12. [ ] Atualizar `docs/tenant-context.md`, `README.md` (scripts novos), `.env.example` (sem novas variáveis obrigatórias).
13. [ ] Rodar `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run test:e2e`.
14. [ ] Abrir PR `CLI-11 — Tenant context e isolamento multi-tenant` contra `master` com relatório §20 do `AGENTS.md`.

## 12. Definition of Done

- [ ] Critérios de aceite da §3 provados por teste automatizado no CI.
- [ ] Nenhum modelo tenant-owned sem `tenantId`/FK/índice; teste de classificação de modelos verde.
- [ ] `bypassTenant` usado apenas em seed, guard/membership repository e jobs; todos com `reason`.
- [ ] `check:standards` no gate e verde.
- [ ] Security review sem BLOCKER/HIGH.
- [ ] Docs atualizadas; nenhuma senha/segredo em seed ou fixtures.

## 13. Riscos e decisões

| Item | Nota |
| --- | --- |
| Prisma extension e tipagem de `findUnique → findFirst` | Manter tipos de retorno iguais; cobrir com testes de tipo (`tsd` ou `expectTypeOf`) se necessário |
| Performance do filtro extra | Índices `[tenantId, …]` cobrem; sem impacto mensurável no P0 |
| `bypassTenant` virar hábito | Revisão obrigatória: grep no PR; auditoria em CLI-14 |
| D6 — RLS | Fora do P0; registrar issue de follow-up após a sprint |
| Nomes de tenant/slug no P0 | Studio Vega via seed; slug não é exposto em URL pública nesta sprint |
