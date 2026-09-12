# Spec — CLI-13 RBAC e permissões por perfil profissional

| Campo | Valor |
| --- | --- |
| Linear | [CLI-13](https://linear.app/clivyra/issue/CLI-13/sprint-1-rbac-e-permissoes-por-perfil-profissional) — Urgent — In Progress |
| Pai | CLI-66 |
| Branch | `feat/CLI-13-rbac-permissions` (a partir de `feat/CLI-12-auth-session`; cherry-pick de `69bb8ef`) |
| Depende de | CLI-11 (Membership/role, contexto), CLI-12 (AuthGuard, sessões, mailer) |
| Bloqueia | CLI-14, CLI-15, CLI-16, CLI-48 |
| Decisões em aberto | D4 (ADMIN e prontuário) |

## 1. Objetivo

Controle de acesso por papel, server-side, com negação por padrão, permissões independentes para módulos sensíveis (prontuário, financeiro, usuários) e guards reutilizáveis para todos os módulos futuros. Inclui a gestão de usuários do tenant (convite, papel, desativação) para que o OWNER consiga operar o studio.

## 2. Escopo

### Dentro

- Catálogo de permissões e mapa papel→permissões em `packages/types` (compartilhado com a web).
- `RbacGuard` global (junto com `AuthGuard` e `TenantContextGuard`), `@RequirePermissions()`, `@Public()`, deny by default.
- Helper de autorização em serviços (`Authorization.assert(ctx, permission)`) para regras que não cabem no controller (ex.: campo sensível em DTO de resposta).
- Gestão de usuários do tenant: listar, convidar por e-mail, reenviar/cancelar convite, alterar papel, desativar/reativar.
- Aceite de convite (público, por token) criando usuário novo ou vinculando usuário existente ao tenant.
- Invariantes: ≥ 1 OWNER ativo; ADMIN não concede OWNER; ninguém altera o próprio papel.
- `GET /auth/permissions` para a web esconder navegação (cosmético).
- Web: tela de usuários e hook `usePermissions()`.

### Fora

- Papéis customizados ou permissões por usuário (pós-piloto; modelo permite evoluir para tabela `RolePermission`).
- Permissões por recurso/linha (ex.: profissional só vê seus pacientes) — pertence aos cards de domínio, usando o helper deste card.
- Auditoria persistente das mudanças de papel — CLI-14 consome os eventos emitidos aqui.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Acesso é negado por padrão quando não autorizado | Rota sem `@Public()` e sem `@RequirePermissions()` → `403` (teste iterando o router); papel sem permissão → `403` |
| Prontuário e financeiro possuem permissões independentes | `PROFESSIONAL` tem `clinical-record:*` e não `finance:*`; `RECEPTION` não tem nenhum dos dois; teste de matriz completa |
| Owner pode gerenciar usuários e papéis | Integração: OWNER convida, altera papel, desativa; RECEPTION recebe `403`; E2E de convite |
| Guards são reutilizáveis na API | Guards globais + decorators; exemplo de uso em `docs/rbac.md`; controller de teste com 3 linhas de anotação |

## 4. Estado atual e gaps

Referência: commit `69bb8ef` (`permissions.ts`, `RbacGuard`, `@RequirePermissions`, `docs/rbac.md`).

| Gap | Ação |
| --- | --- |
| Guards opt-in via `@UseGuards` | Global `APP_GUARD` em ordem fixa |
| Catálogo só na API | `packages/types/src/rbac.ts` |
| Sem gestão de usuários | `UsersModule` + `Invitation` |
| Sem teste de matriz completa | `permissions.matrix.spec.ts` tabela papel×permissão |
| Sem invariantes de OWNER | `MembershipPolicy` |

## 5. Modelo de dados

```prisma
enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

model Invitation {
  id              String           @id @default(cuid())
  tenantId        String
  email           String                       // normalizado
  role            MembershipRole
  tokenHash       String           @unique
  status          InvitationStatus @default(PENDING)
  expiresAt       DateTime
  invitedByUserId String
  acceptedAt      DateTime?
  acceptedUserId  String?
  revokedAt       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  tenant          Tenant           @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, email, status])          // um convite PENDING por e-mail por tenant
  @@index([tenantId, status])
  @@index([expiresAt])
}

model Membership {
  // ... CLI-11
  deactivatedAt    DateTime?
  deactivatedById  String?
  roleChangedAt    DateTime?
}
```

`Invitation` entra em `TENANT_OWNED_MODELS`. Migration aditiva. Observação: `@@unique([tenantId, email, status])` impede dois `PENDING`; convites `REVOKED`/`EXPIRED` não colidem porque o status difere — ao expirar/revogar, o status muda antes de emitir novo convite.

## 6. Design

### 6.1 Catálogo compartilhado

```ts
// packages/types/src/rbac.ts
export const PERMISSIONS = [
  'agenda:read', 'agenda:write',
  'clients:read', 'clients:write',
  'finance:read', 'finance:write',
  'clinical-record:read', 'clinical-record:write',
  'settings:read', 'settings:write',
  'users:read', 'users:write',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: [/* tudo exceto tenant:manage (CLI-16); clinical-record conforme D4 */],
  PROFESSIONAL: ['agenda:read', 'agenda:write', 'clients:read', 'clients:write',
                 'clinical-record:read', 'clinical-record:write', 'settings:read'],
  RECEPTION: ['agenda:read', 'agenda:write', 'clients:read', 'clients:write', 'settings:read'],
}

export const ROLE_RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, PROFESSIONAL: 1, RECEPTION: 1 }
export function hasPermission(role: Role, p: Permission): boolean
export function hasEveryPermission(role: Role, ps: readonly Permission[]): boolean
export function canAssignRole(actor: Role, target: Role): boolean // OWNER: qualquer; ADMIN: != OWNER; demais: nunca
```

Regras do catálogo:

- Formato `<módulo>:<ação>`; ações `read` | `write` | `manage` | `self`.
- Cards posteriores **adicionam** entradas (CLI-14 `audit:read`, CLI-15 `consent:*`/`lgpd:manage`, CLI-16 `tenant:manage`/`professionals:*`) e atualizam `ROLE_PERMISSIONS` no mesmo PR, com teste de matriz atualizado.
- `finance:*` e `clinical-record:*` nunca são inferidos um do outro nem de `settings`.
- Matriz completa no plano §5.

### 6.2 Guards globais e ordem

```ts
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },     // CLI-12
  { provide: APP_GUARD, useClass: AuthGuard },          // CLI-12 — respeita @Public()
  { provide: APP_GUARD, useClass: TenantContextGuard }, // CLI-11 — respeita @Public() e @NoTenant()
  { provide: APP_GUARD, useClass: RbacGuard },          // CLI-13
]
```

- `@Public()`: pula Auth, Tenant e Rbac (health, login, refresh, reset, aceite de convite).
- `@NoTenant()`: rota autenticada que não exige tenant ativo (ex.: `GET /auth/me` para usuário sem membership ativa, `POST /auth/switch-tenant`). Rbac também pula, porque não há papel.
- `RbacGuard`: lê `@RequirePermissions(...)` do handler ou da classe (handler sobrescreve). Sem metadados e sem `@Public()`/`@NoTenant()` → `403 ROUTE_PERMISSIONS_UNDECLARED` e log `error` (é bug de configuração, não caso de uso). Papel sem todas as permissões → `403 FORBIDDEN` genérico.
- `@RequireAnyPermission(...)` para rotas legítimas de "ou" (ex.: profissional editando o próprio perfil em CLI-16).

### 6.3 Autorização dentro de serviços

```ts
// apps/api/src/rbac/authorization.service.ts
assert(ctx: TenantContext, permission: Permission): void          // lança ForbiddenException
can(ctx: TenantContext, permission: Permission): boolean
project<T>(ctx, dto: T, sensitiveFields: Partial<Record<keyof T, Permission>>): Partial<T>
```

`project` remove campos de resposta cuja permissão o papel não tem (usado por CLI-16 para CREFITO/documento e por cards financeiros/clínicos). Mantém a regra fora do controller.

### 6.4 Gestão de usuários — endpoints

Prefixo `/users`. Permissões indicadas por rota.

| Método/rota | Permissão | Request | Resposta |
| --- | --- | --- | --- |
| `GET /users` | `users:read` | `?status=active\|inactive&cursor&limit` | `[{ membershipId, userId, name, email, role, isActive, lastLoginAt, createdAt }]` — só memberships do tenant |
| `GET /users/invitations` | `users:read` | `?status` | `[{ id, email, role, status, expiresAt, invitedBy: { name } }]` |
| `POST /users/invitations` | `users:write` | `{ email, role }` | `201 { id, email, role, expiresAt }` — token só no e-mail |
| `POST /users/invitations/:id/resend` | `users:write` | – | `204` (gera token novo, invalida anterior) |
| `DELETE /users/invitations/:id` | `users:write` | – | `204` (status `REVOKED`) |
| `PATCH /users/:membershipId/role` | `users:write` | `{ role }` | `200 { membershipId, role }` |
| `POST /users/:membershipId/deactivate` | `users:write` | – | `204` (revoga sessões desse usuário no tenant) |
| `POST /users/:membershipId/activate` | `users:write` | – | `204` |
| `GET /auth/permissions` | autenticado (`@RequirePermissions` não; `@NoTenant` não) | – | `{ role, permissions: Permission[] }` |
| `GET /auth/invitations/:token` | público | – | `{ tenantName, email(mascarado), role, expiresAt, existingUser: boolean }` |
| `POST /auth/invitations/accept` | público | `{ token, name?, password? }` | `201 AuthSessionResponse` |

### 6.5 Regras de gestão de usuários (`MembershipPolicy`)

- `canAssignRole(actor.role, target.role)`: OWNER concede qualquer papel; ADMIN concede `ADMIN`, `PROFESSIONAL`, `RECEPTION`; outros não gerenciam.
- Alterar papel de uma membership cujo papel atual é `OWNER` exige ator `OWNER`.
- Ator não pode alterar o próprio papel nem se desativar (evita perder o último acesso; `logout-all` cobre "sair de tudo").
- Tenant deve manter ≥ 1 `OWNER` ativo: rebaixar/desativar o último OWNER → `409 LAST_OWNER`.
- Desativar membership: `isActive=false`, `deactivatedAt/ById`, revoga `RefreshSession` do usuário **naquele tenant**; se o usuário não tem mais memberships ativas, nada mais acontece com o `User` (continua existindo, pode ser reconvidado).
- Convite: e-mail normalizado; se já existe membership ativa para esse e-mail no tenant → `409 ALREADY_MEMBER`; se existe `PENDING` → `409 INVITATION_PENDING` (usar `resend`); TTL `INVITATION_TTL_HOURS` (72 h); token opaco 32 bytes, só hash persistido; e-mail com link `${WEB_ORIGIN}/convite/${token}`.
- Aceite: token válido e `PENDING` e não expirado; transação: se `User` com esse e-mail existe → só cria `Membership` (exige `password` correto? **Não**: usuário existente precisa estar autenticado **ou** informar a senha atual; escolha: fluxo público exige `password` da conta existente para provar posse); se não existe → cria `User` com `name`/`password`; marca convite `ACCEPTED`; cria sessão no tenant do convite. O `role` aplicado é o do convite, nunca do body.
- Convite expirado ao consultar/aceitar → status `EXPIRED`, `410`.
- Eventos emitidos para `AuthEventsPort`/auditoria: `users.invitation.created|resent|revoked|accepted`, `users.role.changed`, `users.membership.deactivated|activated`.

### 6.6 Web

- `usePermissions()` lê `/auth/permissions` no `SessionProvider`; `<Can permission="users:write">` para esconder botões. Sempre acompanhado de tratamento de `403` vindo da API (toast + refetch), porque a UI não é controle de segurança.
- `/app/configuracoes/usuarios`: lista, filtro ativo/inativo, convidar (e-mail + papel restrito ao que `canAssignRole` permite), reenviar/cancelar convite, alterar papel, desativar/reativar com confirmação.
- `/convite/[token]`: página pública que mostra studio/papel, formulário de nome+senha (novo) ou senha atual (existente), e entra direto no app.

## 7. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Rota nova esquecida sem guard | Guards globais + `ROUTE_PERMISSIONS_UNDECLARED` + teste iterando o router |
| Escalação via convite | Papel vem do convite persistido; ADMIN não cria convite OWNER; aceite não aceita `role` |
| Tomada de conta por convite a e-mail de usuário existente | Aceite exige senha da conta existente |
| Perda de controle do tenant | Invariante ≥ 1 OWNER |
| Cross-tenant em `/users/:membershipId` | Extension de tenant → `404` para membership de outro tenant |
| Enumeração de e-mails via convite | Mensagens genéricas na consulta pública; e-mail mascarado (`n***@dominio`) |
| Token de convite em log/URL de analytics | Só no e-mail; página não envia token para terceiros; redaction |
| Desativação sem efeito imediato | Revogação de refresh + `TenantContextGuard` revalida membership a cada request |
| Dados pessoais em listagem | Só nome, e-mail, papel, status, último login (necessários para administrar) |

## 8. Observabilidade

- `rbac.denied{permission, role, route}` (sem PII).
- `rbac.undeclared_route{route}` em `error`.
- Eventos de gestão de usuários para auditoria (CLI-14).

## 9. Testes

### Unit

- `permissions.matrix.spec.ts`: tabela papel × permissão com valor esperado explícito para cada célula (falha se o catálogo mudar sem atualizar o teste).
- `canAssignRole`, `MembershipPolicy` (último owner, auto-alteração, hierarquia).
- `RbacGuard`: sem metadata → 403 undeclared; `@Public` pula; `@NoTenant` pula; handler sobrescreve classe; `RequireAnyPermission`.
- `AuthorizationService.project` remove campos sensíveis por papel.
- `InvitationService`: e-mail normalizado, pending duplicado, expiração, token único.

### Integração (`rbac.integration.spec.ts`, `users.integration.spec.ts`, `router-coverage.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| Iteração sobre todas as rotas registradas: cada uma tem `@Public`, `@NoTenant` ou `@RequirePermissions` | Falha lista rotas sem declaração |
| Cada papel × rota de exemplo por módulo (`finance`, `clinical-record`, `users`, `settings`) | Matriz de 200/403 conforme catálogo |
| RECEPTION chama `GET /users` | 403 |
| OWNER convida `PROFESSIONAL`; aceite cria usuário e sessão no tenant | 201; membership com papel do convite |
| ADMIN tenta convidar `OWNER` | 403 |
| Aceite com `role: 'OWNER'` no body | 400 (`forbidNonWhitelisted`) |
| Aceite para e-mail de usuário existente sem senha correta | 401; com senha correta → membership criada |
| OWNER único tenta rebaixar-se / desativar-se | 409 |
| OWNER de `studio-a` altera papel de membership de `studio-b` | 404 |
| Desativar membership → usuário faz request com access token válido | 401 na próxima request; refresh → 401 |
| Convite expirado | 410 e status `EXPIRED` |
| Usuário com membership em A e B: permissões diferentes por tenant após `switch-tenant` | `GET /auth/permissions` reflete o papel do tenant ativo |

### E2E

```gherkin
Funcionalidade: Gestão de usuários do studio
  Cenário: convite e primeiro acesso
    Dado um OWNER autenticado em "studio-a"
    Quando convida "recepcao@studio-a.test" como RECEPTION
    E a pessoa abre o link do convite recebido na mailbox de teste
    E define nome e senha
    Então entra no app do "studio-a"
    E não vê o menu "Financeiro"

  Cenário: papel sem permissão tenta acessar módulo sensível
    Dado uma RECEPTION autenticada
    Quando acessa /app/configuracoes/usuarios diretamente pela URL
    Então vê a mensagem de acesso negado
    E a API respondeu 403

  Cenário: último owner não pode ser rebaixado
    Dado um OWNER único autenticado
    Quando tenta alterar o próprio papel
    Então a ação não está disponível
```

## 10. Plano de execução

1. [ ] Branch a partir de CLI-12; `git cherry-pick 69bb8ef`.
2. [ ] Mover catálogo para `packages/types/src/rbac.ts`; API/web consomem; decidir D4 e refletir na matriz.
3. [ ] Guards globais em ordem; `@Public`, `@NoTenant`, `@RequirePermissions`, `@RequireAnyPermission`; anotar rotas existentes (`/health*`, `/auth/*`).
4. [ ] `AuthorizationService` (`assert`, `can`, `project`).
5. [ ] Schema §5 + migration; `Invitation` no registro tenant-owned.
6. [ ] `UsersModule`: `MembershipPolicy`, `InvitationService`, `UsersService`, controller, DTOs; template de e-mail de convite.
7. [ ] `AuthController`: `GET /auth/permissions`, `GET /auth/invitations/:token`, `POST /auth/invitations/accept`.
8. [ ] Remover rota `__test__/memberships` de CLI-11 (substituída por `/users`).
9. [ ] Eventos para `AuthEventsPort`.
10. [ ] Web: `usePermissions`, `<Can>`, tela de usuários, página de convite.
11. [ ] Testes §9 (incluindo `router-coverage`).
12. [ ] Docs: `docs/rbac.md` (reescrever com ordem de guards, catálogo, como adicionar permissão), `README.md`.
13. [ ] Validação mandatória completa.
14. [ ] PR `CLI-13 — RBAC e permissões por perfil profissional` (base CLI-12 até merge).

## 11. Definition of Done

- [ ] Nenhuma rota sem declaração de acesso (teste `router-coverage` no gate).
- [ ] Matriz papel×permissão testada célula a célula.
- [ ] Gestão de usuários com invariantes (último OWNER, hierarquia) provadas em integração.
- [ ] Convite E2E verde; e-mails só via mailbox de teste.
- [ ] `docs/rbac.md` explica como um card novo adiciona permissão (catálogo + matriz + teste).
- [ ] Security review sem BLOCKER/HIGH.

## 12. Riscos e decisões

| Item | Nota |
| --- | --- |
| D4 — ADMIN e prontuário | Default: mantém (Linear agrupa owner/admin). Se negado, remover de `ROLE_PERMISSIONS.ADMIN` e atualizar matriz/teste |
| Papéis customizados no futuro | Catálogo estático hoje; migrar para `RolePermission` no banco sem mudar decorators |
| `@NoTenant` abrindo brecha | Só em rotas do `AuthController` explicitamente listadas; teste `router-coverage` lista todas as rotas `@NoTenant` e compara com allowlist |
| Aceite de convite para usuário existente exigir senha | Alternativa: exigir login prévio e aceitar autenticado. A escolha por senha no fluxo público simplifica a UX do piloto |
