# Spec — CLI-14 Auditoria de ações e trilha de alterações

| Campo | Valor |
| --- | --- |
| Linear | [CLI-14](https://linear.app/clivyra/issue/CLI-14/sprint-1-auditoria-de-acoes-e-trilha-de-alteracoes) — High — In Progress |
| Pai | CLI-66 |
| Branch | `feat/CLI-14-audit-trail` (a partir de `master` após merge de CLI-13) |
| Depende de | CLI-11 (tenant, requestId), CLI-12 (ator, eventos de auth), CLI-13 (`audit:read`, eventos de usuários) |
| Bloqueia | CLI-15, CLI-16, CLI-49 |
| Decisões em aberto | D7 (retenção) |

## 1. Objetivo

Registrar operações sensíveis (criação, edição, exclusão e **acesso** a dados sensíveis) com ator, tenant, ação, entidade, timestamp e metadados seguros, em uma trilha **append-only** consultável por tenant, sem jamais armazenar senha, token ou conteúdo clínico.

## 2. Escopo

### Dentro

- Modelo `AuditLog` tenant-owned, imutável (trigger no Postgres + bloqueio na camada Prisma).
- `AuditService.record()` com API explícita e transacional; `AuditContext` (ator, requestId, ipHash, userAgent) derivado do `RequestContext`/`TenantContext`.
- Catálogo de ações tipado em `packages/types/src/audit.ts`.
- Sanitizador de metadados (denylist + allowlist por ação + truncamento) e diff de campos não sensíveis.
- Decorator/interceptor `@Audited()` para mutações padrão de controllers e chamada explícita para acessos sensíveis.
- Integração retroativa: eventos de auth (CLI-12) e de usuários (CLI-13) passam a persistir; `bypassTenant` (CLI-11) auditado.
- Consulta: `GET /audit-logs` com filtros e paginação, permissão `audit:read`.
- Web: `/app/configuracoes/auditoria` somente leitura.
- Retenção: sem purge no P0; documentação e ponto de extensão.

### Fora

- Exportação da trilha para SIEM/objeto externo (follow-up; a estrutura JSON já permite).
- Auditoria de leituras em massa/telemetria de produto.
- Versionamento completo de entidades (snapshots) — apenas diff de campos allowlisted.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Alterações em prontuário, financeiro, usuários e consentimentos são auditadas | Nesta sprint: usuários (CLI-13) e consentimentos (CLI-15) integrados; prontuário/financeiro ainda não existem — o card entrega o mecanismo e um teste de contrato que obriga módulos futuros marcados como sensíveis a registrar auditoria (lint `check:standards`: controller sob `clinical-record`/`finance` sem `@Audited`/`AuditService` falha) |
| Logs não armazenam senha/token | Sanitizador com denylist; teste de propriedade: qualquer metadata com chave sensível é removida; teste de integração grava login/reset e verifica ausência no banco |
| Auditoria é consultável por tenant | `GET /audit-logs` com extension de tenant; cross-tenant → vazio/404 |
| Registros não podem ser alterados por usuários comuns | Nenhum endpoint de escrita; trigger `audit_log_immutable` rejeita `UPDATE`/`DELETE` para qualquer papel do banco da aplicação; extension Prisma bloqueia `update*`/`delete*` em `AuditLog` |

## 4. Modelo de dados

```prisma
enum AuditOutcome {
  SUCCESS
  DENIED
  FAILURE
}

model AuditLog {
  id           String       @id @default(cuid())
  tenantId     String
  occurredAt   DateTime     @default(now())
  actorUserId  String?                 // null = sistema/job
  actorMembershipId String?
  actorRole    MembershipRole?
  actorType    String       @default("USER")  // USER | SYSTEM | API_KEY (futuro)
  action       String                  // catálogo: "users.role.changed"
  entityType   String                  // "Membership", "ConsentRecord", "Professional"...
  entityId     String?
  outcome      AuditOutcome @default(SUCCESS)
  requestId    String?
  ipHash       String?                 // sha256(ip + AUDIT_IP_HASH_SALT); nunca IP em claro
  userAgent    String?                 // truncado 256
  metadata     Json?                   // sanitizado; allowlist por ação
  changes      Json?                   // [{ field, from, to }] só campos allowlisted
  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@index([tenantId, occurredAt(sort: Desc)])
  @@index([tenantId, entityType, entityId, occurredAt(sort: Desc)])
  @@index([tenantId, actorUserId, occurredAt(sort: Desc)])
  @@index([tenantId, action, occurredAt(sort: Desc)])
}
```

Migration (SQL adicional além do gerado pelo Prisma):

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

Notas:

- `tenantId` obrigatório. Eventos sem tenant (falha de login para e-mail desconhecido) **não** entram em `AuditLog`; ficam no log estruturado (`auth.login.failed` com `ipHash`), pois não pertencem a um tenant e teriam risco de enumeração. Login falho para usuário **existente** com membership única é auditado no tenant dessa membership.
- `actorUserId` sem FK para `User` (histórico deve sobreviver a exclusão/anonimização futura do usuário; o nome não é gravado — a UI resolve por join opcional e mostra "usuário removido" quando não existir).
- `metadata`/`changes` são `Json` já sanitizados; tamanho máximo 8 kB por registro (truncado com marcador `"_truncated": true`).
- `AuditLog` em `TENANT_OWNED_MODELS`; a extension adiciona regra especial: `update`, `updateMany`, `delete`, `deleteMany`, `upsert` → `AuditImmutableError`.
- Retenção: sem `deletedAt`; purge futuro só por job com permissão de banco distinta (D7).

## 5. Design

### 5.1 Módulos e arquivos

```text
apps/api/src/audit/
  audit.module.ts                 # @Global()
  audit.service.ts                # record(), recordAccess(), withTx()
  audit-context.ts                # monta ator/request a partir de ALS
  audit-sanitizer.ts              # denylist, allowlist por ação, truncamento, diff
  audit-actions.ts                # re-export de @clivyra/types/audit + allowlist de metadata por ação
  audited.decorator.ts            # @Audited({ action, entityType, entityIdFrom })
  audit.interceptor.ts            # aplica @Audited em mutações de controller
  audit-query.service.ts          # listagem/filtros
  audit.controller.ts             # GET /audit-logs, GET /audit-logs/:id
  dto/audit-query.dto.ts, dto/audit-log.response.ts
  auth-events.audit-adapter.ts    # implementa AuthEventsPort (CLI-12/13) persistindo em AuditLog
packages/types/src/audit.ts       # AuditAction union, AuditLogView
apps/web/app/(app)/app/configuracoes/auditoria/page.tsx
scripts/check-audited-modules.mjs # parte de check:standards
```

### 5.2 Catálogo de ações

```ts
// packages/types/src/audit.ts
export const AUDIT_ACTIONS = [
  // auth (CLI-12)
  'auth.login.succeeded', 'auth.login.failed', 'auth.login.locked',
  'auth.logout', 'auth.logout_all', 'auth.session.revoked', 'auth.tenant.switched',
  'auth.refresh.reuse_detected',
  'auth.password.reset_requested', 'auth.password.changed',
  // users (CLI-13)
  'users.invitation.created', 'users.invitation.resent', 'users.invitation.revoked', 'users.invitation.accepted',
  'users.role.changed', 'users.membership.deactivated', 'users.membership.activated',
  // sistema (CLI-11)
  'system.tenant_bypass',
  // auditoria
  'audit.queried',
  // reservados para cards seguintes (adicionados nos respectivos PRs)
  // 'consent.*' (CLI-15), 'tenant.settings.*', 'professional.*' (CLI-16), 'clinical-record.*', 'finance.*'
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
```

Convenção: `<módulo>.<entidade|fluxo>.<evento no passado>`. Acesso sensível usa sufixo `.viewed` / `.exported` (ex.: `clinical-record.viewed`).

### 5.3 API do serviço

```ts
interface RecordInput {
  action: AuditAction
  entityType: string
  entityId?: string
  outcome?: AuditOutcome            // default SUCCESS
  metadata?: Record<string, unknown> // passa pelo sanitizador
  changes?: { before?: object; after?: object; fields: string[] } // diff só dos fields
  actor?: { type: 'SYSTEM'; reason: string }  // sobrescreve ator quando fora de request
  tenantId?: string                 // OBRIGATÓRIO apenas fora de request (jobs); em request vem do contexto
}

class AuditService {
  record(input: RecordInput, tx?: PrismaTx): Promise<void>       // mutações: chamar dentro da mesma transação
  recordAccess(input: RecordInput): Promise<void>                // leituras sensíveis: best-effort, nunca lança para o caller
}
```

Regras:

- **Mutações**: `record` é chamado dentro da transação da operação (`prisma.$transaction(async (tx) => { ...; await audit.record({...}, tx) })`). Se a auditoria falhar, a operação falha (consistência > disponibilidade para dados regulados).
- **Acessos sensíveis**: `recordAccess` grava fora da transação de leitura; erro é logado em `error` com `requestId` e um contador `audit.write_failed` — a leitura não falha, mas o alerta é obrigatório.
- Ator e request vêm do ALS; nunca do body. Fora de request (`SYSTEM`), `tenantId` e `reason` são obrigatórios e o registro usa `bypassTenant('audit-system')`.
- `@Audited({ action, entityType, entityIdFrom: 'params.id' | 'result.id' })` cobre o caso comum em controllers de mutação: o interceptor grava após sucesso (`SUCCESS`) ou após `ForbiddenException` (`DENIED`), com `metadata` mínima (`route`, `method`). Serviços que precisam de `changes` chamam `record` explicitamente.

### 5.4 Sanitizador

1. **Denylist de chaves** (case-insensitive, em qualquer profundidade): `password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `secret`, `authorization`, `cookie`, `pepper`, `hash`, `otp`, `cpf`, `rg`, `cardNumber`, `cvv`. Valores viram `"[REDACTED]"`.
2. **Allowlist por ação**: cada `AuditAction` declara quais chaves de `metadata` podem ser persistidas (`AUDIT_METADATA_ALLOWLIST[action]`). Chaves fora da allowlist são descartadas (não só redigidas). Ações sem allowlist declarada só aceitam `metadata` vazio (teste unitário garante).
3. **Conteúdo clínico**: ações `clinical-record.*` (futuras) só permitem identificadores e nomes de seção, nunca texto livre — regra codificada como allowlist vazia para campos de texto.
4. **Diff (`changes`)**: calculado apenas para `fields` explicitamente passados; valores de campos sensíveis (e-mail é permitido; documento/CREFITO só mascarados) passam por `mask()` quando marcados.
5. **Tamanho**: strings > 512 chars truncadas; total > 8 kB → mantém as primeiras chaves e adiciona `_truncated`.
6. **PII de request**: IP nunca em claro (`ipHash` com salt), `userAgent` truncado.

### 5.5 Consulta

`GET /audit-logs` — `audit:read` — `@Audited('audit.queried')` (consultar auditoria também é auditado, com filtros como metadata).

| Filtro | Tipo |
| --- | --- |
| `from`, `to` | ISO, janela máx. 90 dias por consulta |
| `action` | `AuditAction` ou prefixo `users.` |
| `entityType`, `entityId` | string |
| `actorUserId` | string |
| `outcome` | enum |
| `cursor`, `limit` (≤ 100) | paginação por `(occurredAt, id)` |

Resposta `AuditLogView`: `{ id, occurredAt, action, entityType, entityId, outcome, actor: { userId, name? , role }, requestId, metadata, changes }`. Nunca `ipHash`/`userAgent` na API (só banco, para investigação com acesso direto controlado).

`GET /audit-logs/:id` — mesmo DTO; id de outro tenant → `404`.

### 5.6 Web

`/app/configuracoes/auditoria`: tabela mobile-friendly (cards em telas pequenas) com data, ator, ação legível (mapa `AuditAction` → rótulo pt-BR), entidade, resultado; filtros de período/ação/ator; detalhe em drawer com `metadata`/`changes` formatados. Sem exportação neste card.

### 5.7 Integração com cards anteriores

- CLI-12/13 emitem eventos via `AuthEventsPort`; este card registra `AuthEventsAuditAdapter` como implementação, com allowlists (`auth.login.succeeded`: `{ tenantSlug }`; `users.role.changed`: `changes` de `role`; `users.invitation.created`: `{ email(mascarado), role }`).
- CLI-11 `bypassTenant(reason)` passa a chamar `audit.record({ action: 'system.tenant_bypass', actor: SYSTEM, metadata: { reason } })` quando houver `tenantId` disponível; sem tenant, só log.
- Fluxo `auth.refresh.reuse_detected` grava `DENIED` com `metadata: { familyId }`.

### 5.8 Guardrail para módulos futuros

`scripts/check-audited-modules.mjs`: para diretórios listados em `SENSITIVE_MODULES = ['clinical-record', 'finance', 'users', 'consent', 'professionals']`, todo controller com handlers `POST|PATCH|PUT|DELETE` deve usar `@Audited` ou o serviço correspondente deve importar `AuditService`. Falha no `check:standards` com lista dos arquivos. Allowlist por comentário `// audit: not-required <motivo>`.

## 6. Regras e invariantes

- Todo registro tem `tenantId`, `action` do catálogo, `entityType`, `occurredAt`.
- Nenhuma escrita além de `INSERT`; nenhum endpoint de escrita; trigger no banco.
- Metadados só via sanitizador; `record` recusa (`AuditValidationError`) `metadata` com chave fora da allowlist em `NODE_ENV=test` (falha rápido) e descarta silenciosamente em produção (com log `warn`).
- Consulta limitada a 90 dias por request para conter custo.

## 7. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Segredo/PII em metadata | Denylist + allowlist por ação + testes de propriedade |
| Conteúdo clínico na trilha | Allowlist vazia para texto em ações clínicas; regra documentada para cards futuros |
| Adulteração/apagamento | Trigger `append-only`; sem endpoint; extension bloqueia; usuário do banco da app sem `TRUNCATE` (documentar em `infra`) |
| Cross-tenant | Extension de tenant; testes |
| Enumeração via login falho | Eventos sem tenant não persistem |
| IP como dado pessoal | Apenas hash com salt; não exposto na API |
| Ator falsificado | Ator vem do ALS/token; `SYSTEM` só com `reason` e fora de request |
| Volume/DoS por auditoria de leitura | `recordAccess` só em rotas marcadas como sensíveis; sem auditoria de listagens comuns |

## 8. Observabilidade

- `audit.recorded{action}` (contagem), `audit.write_failed{action}` (alerta), `audit.sanitizer.dropped_keys{action}` (indica allowlist incompleta).
- `requestId` liga logs operacionais a `AuditLog.requestId`.

## 9. Testes

### Unit

- `AuditSanitizer`: denylist em profundidade; allowlist por ação descarta chave; truncamento; diff só de `fields`; máscara de e-mail/documento; propriedade (fast-check ou tabela) — nenhum valor de chave sensível sobrevive.
- `AuditService.record`: usa `tx` quando fornecido; sem contexto e sem `actor SYSTEM` → erro; `SYSTEM` sem `tenantId` → erro.
- `AuditInterceptor`: grava `SUCCESS` após handler, `DENIED` em `ForbiddenException`, não grava em `400`.
- Catálogo: toda ação tem allowlist declarada; ações clínicas não permitem chaves de texto livre.
- `AuthEventsAuditAdapter`: mapeia eventos de CLI-12/13 para ações e metadata permitida.

### Integração (`audit.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| OWNER altera papel de membership | 1 registro `users.role.changed` com `changes=[{field:'role',from,to}]`, `actorUserId` do OWNER, `requestId` da resposta |
| Login com sucesso / reset de senha | registros existem; `SELECT` no banco não contém a senha nem tokens (busca por substrings do token real) |
| `UPDATE "AuditLog"` / `DELETE` via SQL direto | erro `restrict_violation` |
| `prisma.auditLog.update` | `AuditImmutableError` |
| `GET /audit-logs` como OWNER de A | só registros de A; registro de B por id → 404 |
| `GET /audit-logs` como RECEPTION | 403 |
| Consulta com janela > 90 dias | 400 |
| Falha simulada na escrita de auditoria dentro de mutação | operação faz rollback (nenhuma linha alterada) |
| Falha simulada em `recordAccess` | leitura responde 200; log `error` emitido |
| Reuso de refresh | `auth.refresh.reuse_detected` com `outcome=DENIED` |

### E2E

```gherkin
Funcionalidade: Trilha de auditoria
  Cenário: ação administrativa aparece na auditoria
    Dado um OWNER autenticado
    Quando altera o papel de um usuário para ADMIN
    E acessa /app/configuracoes/auditoria
    Então vê o evento "Papel alterado" com o nome do usuário e o horário

  Cenário: papel sem permissão
    Dado uma PROFESSIONAL autenticada
    Quando acessa /app/configuracoes/auditoria
    Então vê acesso negado
```

## 10. Plano de execução

1. [ ] Branch `feat/CLI-14-audit-trail` a partir de `master`.
2. [ ] `packages/types/src/audit.ts` (ações, view) e allowlists.
3. [ ] Schema + migration com triggers; `AuditLog` no registro tenant-owned; regra de imutabilidade na extension.
4. [ ] `AuditModule` global: contexto, sanitizador, `record`/`recordAccess`, interceptor/decorator.
5. [ ] `AuthEventsAuditAdapter`; ligar `bypassTenant`.
6. [ ] `audit:read` no catálogo + matriz + teste de matriz (OWNER, ADMIN).
7. [ ] `AuditQueryService` + controller + DTOs.
8. [ ] `check-audited-modules.mjs` no `check:standards`.
9. [ ] Web: página de auditoria + rótulos pt-BR.
10. [ ] Testes §9.
11. [ ] Docs: `docs/audit-trail.md` (como auditar um módulo novo, allowlists, o que nunca gravar), `infra/oci/README.md` (privilégios do usuário do banco), `README.md`.
12. [ ] Validação mandatória.
13. [ ] PR `CLI-14 — Auditoria de ações e trilha de alterações`.

## 11. Definition of Done

- [ ] Trigger de imutabilidade e bloqueio Prisma provados em integração.
- [ ] Eventos de auth e usuários persistidos com metadata allowlisted; teste de ausência de segredos no banco.
- [ ] Consulta por tenant com `audit:read`; cross-tenant 404.
- [ ] `check:standards` exige auditoria em módulos sensíveis.
- [ ] Docs explicam como cards futuros (prontuário, financeiro, consentimento) registram auditoria.
- [ ] Security review sem BLOCKER/HIGH.

## 12. Riscos e decisões

| Item | Nota |
| --- | --- |
| D7 retenção | Sem purge no P0. Prontuário exige 20 anos (CFM 1.821/2007; COFFITO); auditoria acompanha o dado que descreve. Decidir com jurídico antes de produção comercial |
| Volume | Índices por `(tenantId, occurredAt)`; particionamento por mês é follow-up se > 10 M linhas |
| Auditoria transacional aumentar latência | Um `INSERT` por mutação; aceitável |
| Nome do ator desatualizado | Não desnormalizar nome; join na leitura |
| Allowlist incompleta descartando dados úteis | Métrica `dropped_keys` + falha rápida em teste |
