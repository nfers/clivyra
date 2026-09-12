# Spec — CLI-16 Perfil do profissional e configuração inicial do studio

| Campo | Valor |
| --- | --- |
| Linear | [CLI-16](https://linear.app/clivyra/issue/CLI-16/sprint-1-perfil-do-profissional-e-configuracao-inicial-do) — High — Backlog |
| Pai | CLI-66 |
| Branch | `feat/CLI-16-studio-setup` (a partir de `master` após merge de CLI-14; paralelo a CLI-15) |
| Depende de | CLI-11, CLI-12, CLI-13 (`tenant:manage`, `professionals:*`, convites), CLI-14 (auditoria de dados sensíveis) |
| Bloqueia | CLI-48; cards de agenda (profissional, sala, serviço, horários) |
| Decisões em aberto | D8 (storage da assinatura), D9 (catálogo `Service`) |

## 1. Objetivo

Permitir que o OWNER configure o studio (dados do tenant) e que cada profissional tenha perfil próprio (nome, registro profissional/CREFITO, especialidades, serviços, assinatura), com horários padrão de atendimento, vínculo usuário↔profissional e preparação para múltiplos profissionais e salas — respeitando RBAC nos campos sensíveis e auditando alterações.

## 2. Escopo

### Dentro

- `TenantSettings` (1:1 com `Tenant`): nome fantasia, razão social, documento (CNPJ/CPF do responsável), contato, endereço, fuso horário, logo (metadado), horário padrão de funcionamento.
- `Professional` tenant-owned, opcionalmente vinculado a uma `Membership` (usuário do sistema) — permite cadastrar profissional que ainda não tem login e vincular depois.
- Registro profissional (`councilType`, `councilNumber`, `councilState`), especialidades (lista controlada + livre), bio curta, assinatura (imagem em storage privado via `FileStoragePort`).
- Catálogo mínimo de `Service` (nome, duração, ativo) e vínculo `ProfessionalService` (D9). Sem preço.
- `Room` (nome, capacidade, ativo).
- `WorkingHours` por tenant (padrão) e por profissional (override), com validações de sobreposição.
- Projeção de campos sensíveis por permissão (`AuthorizationService.project` de CLI-13).
- Auto-criação de perfil `Professional` em `DRAFT` quando um convite com papel `PROFESSIONAL` é aceito.
- Onboarding web pós-signup/primeiro login do OWNER (studio → seu perfil → horários) e telas de configuração.

### Fora

- Agenda, agendamentos, bloqueios de horário e feriados (cards de agenda usam `WorkingHours` como base).
- Preço de serviços, planos, pacotes (card financeiro).
- Múltiplas unidades/filiais (multi-unit é pós-piloto; `Room` já é por tenant e pode ganhar `unitId` depois).
- Validação online de CREFITO junto ao conselho.
- Upload de logo com processamento de imagem (só metadado + storage simples).

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Owner configura dados do tenant | `PATCH /tenant/settings` com `tenant:manage`; ADMIN recebe 403 nos campos legais (`legalName`, `document`) mas 200 nos operacionais (`settings:write`); integração + E2E onboarding |
| Cada profissional possui perfil próprio | `Professional` único por `membershipId` no tenant; `GET /professionals/me`; convite `PROFESSIONAL` cria rascunho; integração |
| Agenda futura pode referenciar profissional e sala | FKs estáveis `Professional.id`, `Room.id`, `Service.id`; `WorkingHours` consultável por profissional/dia; teste de contrato (`packages/types/src/studio.ts`) |
| Informações sensíveis respeitam RBAC | `councilNumber`, `document`, `phone` pessoal e `signature` só para `professionals:write` ou o próprio profissional; RECEPTION vê nome/especialidades/serviços; teste por papel |

## 4. Modelo de dados

```prisma
model TenantSettings {
  tenantId        String   @id
  displayName     String                    // nome fantasia (default = Tenant.name)
  legalName       String?
  documentType    String?                   // CNPJ | CPF
  documentNumber  String?                   // apenas dígitos; exibido mascarado fora de tenant:manage
  email           String?
  phone           String?
  whatsapp        String?
  addressLine1    String?
  addressLine2    String?
  city            String?
  state           String?                   // UF
  postalCode      String?
  timezone        String   @default("America/Sao_Paulo")
  logoStorageKey  String?
  onboardingCompletedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
}

enum ProfessionalStatus {
  DRAFT       // criado automaticamente, faltam dados obrigatórios
  ACTIVE
  INACTIVE
}

enum CouncilType {
  CREFITO
  CREF
  CRM
  CRN
  CRP
  OTHER
}

model Professional {
  id             String             @id @default(cuid())
  tenantId       String
  membershipId   String?            @unique  // vínculo com usuário do sistema (opcional)
  displayName    String
  fullName       String?
  councilType    CouncilType?
  councilNumber  String?                      // sensível
  councilState   String?                      // UF
  specialties    String[]                     // valores de SPECIALTIES + livres
  bio            String?                      // máx. 500
  phone          String?                      // sensível
  color          String?                      // cor na agenda futura (#hex)
  signatureStorageKey String?                 // sensível; storage privado
  status         ProfessionalStatus @default(DRAFT)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  tenant         Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  membership     Membership?        @relation(fields: [membershipId], references: [id], onDelete: SetNull)
  services       ProfessionalService[]
  workingHours   WorkingHours[]

  @@index([tenantId, status])
  @@index([tenantId, displayName])
}

model Service {
  id              String   @id @default(cuid())
  tenantId        String
  name            String
  description     String?
  durationMinutes Int                          // 5..480, múltiplo de 5
  category        String?                      // ex.: "fisioterapia", "pilates", "avaliacao"
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  professionals   ProfessionalService[]

  @@unique([tenantId, name])
  @@index([tenantId, isActive])
}

model ProfessionalService {
  tenantId       String
  professionalId String
  serviceId      String
  createdAt      DateTime     @default(now())
  professional   Professional @relation(fields: [professionalId], references: [id], onDelete: Cascade)
  service        Service      @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@id([professionalId, serviceId])
  @@index([tenantId, serviceId])
}

model Room {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  capacity  Int      @default(1)               // >1 para aulas em grupo (Pilates)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, name])
  @@index([tenantId, isActive])
}

/// professionalId null = horário padrão do studio; preenchido = override do profissional.
model WorkingHours {
  id             String        @id @default(cuid())
  tenantId       String
  professionalId String?
  weekday        Int                            // 0 (domingo) .. 6
  startTime      String                         // "HH:mm" local ao timezone do tenant
  endTime        String                         // "HH:mm", > startTime
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  tenant         Tenant        @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  professional   Professional? @relation(fields: [professionalId], references: [id], onDelete: Cascade)

  @@index([tenantId, professionalId, weekday])
}
```

Notas:

- Todos em `TENANT_OWNED_MODELS` (incl. `TenantSettings`, cuja PK é o `tenantId`; a extension trata `where.tenantId` como filtro normal). `ProfessionalService` e `WorkingHours` carregam `tenantId` redundante para manter a regra "índice começa por tenantId" e permitir filtro sem join.
- Relação `Membership ↔ Professional`: `membershipId` único garante um perfil por usuário no tenant; `SetNull` ao remover membership mantém o histórico do profissional (atendimentos futuros referenciam `Professional`, não `User`).
- Nested writes (`ProfessionalService`) são a primeira relação aninhada do projeto: a extension de tenant precisa validar que `serviceId` pertence ao tenant (teste obrigatório, ver CLI-11 §6.3).
- `documentNumber`, `councilNumber`, `phone`, `signatureStorageKey`: sensíveis (§7).
- Migration aditiva; backfill de `TenantSettings` para tenants existentes (`displayName = Tenant.name`) na própria migration/seed.

## 5. Design

### 5.1 Módulos e arquivos

```text
apps/api/src/studio/
  studio.module.ts
  tenant-settings/ (service, controller, dto, mapper)
  professionals/ (service, controller, dto, mapper, professional.policy.ts, specialties.ts)
  services/ (service, controller, dto)
  rooms/ (service, controller, dto)
  working-hours/ (service, controller, dto, working-hours.policy.ts)
  onboarding/ (onboarding.service.ts — estado do onboarding, controller GET /tenant/onboarding)
apps/api/src/storage/
  storage.module.ts, file-storage.port.ts, local.file-storage.ts, oci.file-storage.ts
  upload.validation.ts            # magic bytes, tamanho, extensão
packages/types/src/studio.ts      # views, enums, SPECIALTIES, WEEKDAYS, contratos usados pela agenda
apps/web/app/(app)/onboarding/**  # wizard
apps/web/app/(app)/app/configuracoes/studio/page.tsx
apps/web/app/(app)/app/configuracoes/profissionais/**
apps/web/app/(app)/app/configuracoes/salas/page.tsx
apps/web/app/(app)/app/configuracoes/servicos/page.tsx
apps/web/app/(app)/app/perfil/page.tsx      # /professionals/me
```

### 5.2 Permissões novas (catálogo + matriz + teste)

| Permissão | OWNER | ADMIN | PROFESSIONAL | RECEPTION |
| --- | :-: | :-: | :-: | :-: |
| `tenant:manage` | ✓ | – | – | – |
| `professionals:read` | ✓ | ✓ | ✓ | ✓ |
| `professionals:write` | ✓ | ✓ | – | – |
| `professionals:self` | ✓ | ✓ | ✓ | – |

`settings:write` (CLI-13) cobre `Service`, `Room`, `WorkingHours` padrão e campos operacionais de `TenantSettings`.

### 5.3 Endpoints

| Método/rota | Permissão | Notas |
| --- | --- | --- |
| `GET /tenant/settings` | `settings:read` | `documentNumber` mascarado sem `tenant:manage` |
| `PATCH /tenant/settings` | `settings:write`; campos `legalName`, `documentType`, `documentNumber` exigem `tenant:manage` | Validação de CNPJ/CPF (dígitos verificadores); `timezone` da lista IANA |
| `POST /tenant/settings/logo` | `settings:write` | multipart, PNG/JPEG/SVG ≤ 512 kB |
| `GET /tenant/onboarding` | `settings:read` | `{ steps: { studio, professional, workingHours }, completed }` |
| `POST /tenant/onboarding/complete` | `settings:write` | marca `onboardingCompletedAt` se pré-requisitos ok |
| `GET /professionals?status&serviceId&cursor` | `professionals:read` | projeção por papel |
| `GET /professionals/:id` | `professionals:read` | idem |
| `POST /professionals` | `professionals:write` | `{ displayName, fullName?, councilType?, councilNumber?, councilState?, specialties?, bio?, phone?, color?, membershipId?, serviceIds? }` |
| `PATCH /professionals/:id` | `professionals:write` | |
| `POST /professionals/:id/link-membership { membershipId }` | `professionals:write` | membership do tenant sem perfil; papel `PROFESSIONAL`, `ADMIN` ou `OWNER` |
| `POST /professionals/:id/unlink-membership` | `professionals:write` | |
| `POST /professionals/:id/deactivate` / `activate` | `professionals:write` | |
| `GET /professionals/me` | `professionals:self` | perfil vinculado à membership do ator; 404 se não houver |
| `PATCH /professionals/me` | `professionals:self` | allowlist: `displayName`, `fullName`, `councilType`, `councilNumber`, `councilState`, `specialties`, `bio`, `phone`, `color` — **não** `status`, `membershipId`, `serviceIds` |
| `POST /professionals/:id/signature` \| `/me/signature` | `professionals:write` \| `professionals:self` | multipart PNG/JPEG ≤ 1 MB, dimensões máx. 2000×800; armazena via `FileStoragePort` |
| `GET /professionals/:id/signature` | `professionals:write` ou próprio | URL assinada curta (≤ 5 min) ou stream; auditado (`professional.signature.viewed`) |
| `DELETE /professionals/:id/signature` | idem | |
| `GET/POST/PATCH /services`, `POST /services/:id/deactivate` | `settings:read` / `settings:write` | |
| `GET/POST/PATCH /rooms`, `POST /rooms/:id/deactivate` | `settings:read` / `settings:write` | |
| `GET /working-hours?professionalId?` | `settings:read` | sem `professionalId` = padrão do studio |
| `PUT /working-hours` | `settings:write` | substitui o conjunto padrão `{ entries: [{ weekday, startTime, endTime }] }` |
| `PUT /working-hours/professionals/:id` | `professionals:write` ou `professionals:self` (próprio) | substitui overrides do profissional |
| `GET /working-hours/effective?professionalId&date` | `professionals:read` | resolve override → padrão; contrato para a agenda |

Todas as mutações `@Audited`; ações novas: `tenant.settings.updated`, `tenant.logo.updated`, `tenant.onboarding.completed`, `professional.created|updated|linked|unlinked|deactivated|activated`, `professional.signature.uploaded|deleted|viewed`, `service.created|updated|deactivated`, `room.created|updated|deactivated`, `working_hours.updated`. Allowlists de metadata: nunca `councilNumber`/`documentNumber`/`phone` em claro (`changes` com máscara).

### 5.4 Regras de negócio (`ProfessionalPolicy`, `WorkingHoursPolicy`)

**Tenant settings**

- `displayName` obrigatório (2..80). `documentNumber` validado por tipo; armazenado só dígitos; mascarado como `**.***.***/0001-**` fora de `tenant:manage`.
- `timezone` válido (lista IANA embarcada); afeta a interpretação de `WorkingHours`.
- Onboarding completo exige: `displayName`, ≥ 1 `Professional ACTIVE`, ≥ 1 entrada de `WorkingHours` padrão.

**Professional**

- `displayName` obrigatório; `status=ACTIVE` exige `displayName` + (`councilType` + `councilNumber` + `councilState`) **ou** flag `councilNotApplicable` (instrutor de Pilates sem conselho — registrado como `councilType=OTHER` sem número? Não: campo booleano `councilNotApplicable` no DTO que valida a regra sem persistir; persistência fica `councilType = null`). Regra: `ACTIVE` ⇔ dados mínimos preenchidos; UI orienta.
- `councilNumber` normalizado (dígitos + letras, sem pontuação), único por `(tenantId, councilType, councilNumber)` quando informado (índice parcial via migration SQL).
- `membershipId` só de membership do tenant, ativa, sem outro perfil; papel `RECEPTION` não pode ser vinculado (não atende).
- Aceite de convite `PROFESSIONAL` (CLI-13): `ProfessionalsService.createDraftForMembership()` via evento `users.invitation.accepted` — cria `DRAFT` com `displayName = user.name`.
- Desativar profissional não desativa a membership (pode continuar acessando o sistema) — decisão explícita; a UI mostra ambos os estados.
- `PATCH /professionals/me` limitado à allowlist; qualquer outro campo → `400`.
- `specialties`: valores de `SPECIALTIES` (Pilates clínico, ortopedia, neurofuncional, RPG, pélvica, esportiva, respiratória, geriatria, pediatria, dermatofuncional, outro) + livres (máx. 10, 40 chars).

**Service / Room**

- Nome único por tenant (case-insensitive: unique em `lower(name)` via migration ou normalização).
- `durationMinutes` 5..480 múltiplo de 5. `capacity` 1..50.
- Desativar em vez de excluir (referências futuras da agenda).

**WorkingHours**

- Entradas por `weekday` não se sobrepõem; `startTime < endTime`; formato `HH:mm` em passos de 5 min; máximo 4 intervalos por dia.
- Override do profissional substitui o padrão inteiro daquele dia (não faz merge). `effective(professionalId, date)`: se existem overrides para o profissional (qualquer dia) → usa só overrides; senão padrão do studio. Documentado como contrato para a agenda.
- Override fora do horário do studio é permitido (atendimento externo/online) mas a UI alerta.

### 5.5 Upload e storage (`FileStoragePort`)

```ts
interface FileStoragePort {
  put(input: { key: string; body: Buffer; contentType: string; tenantId: string }): Promise<void>
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>   // ou stream() quando driver local
  delete(key: string): Promise<void>
}
```

- Chave: `tenants/<tenantId>/professionals/<professionalId>/signature.<ext>`; sempre prefixada pelo tenant do contexto (nunca do cliente).
- Validação: magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`), extensão coerente, tamanho, dimensões (via `sharp`? — evitar dependência nativa no P0; usar leitura de cabeçalho com `image-size`, verificar licença/score antes de adicionar). SVG **não** aceito para assinatura (XSS); aceito para logo apenas com sanitização ou também bloqueado — recomendação: bloquear SVG no P0.
- Drivers: `local` (dev/test: pasta fora do repo, `FILE_STORAGE_LOCAL_DIR`), `oci` (Object Storage privado, pre-authenticated request curto). Bucket privado; nenhum objeto público.
- Se D8 não estiver decidida até o PR: entregar a porta + driver `local`, e o driver `oci` em follow-up de infra; a API já funciona em dev/test.

### 5.6 Web

- **Onboarding** (`/onboarding`, exibido quando `GET /tenant/onboarding.completed=false` e o papel é OWNER/ADMIN): 3 passos — Studio (nome, contato, fuso), Seu perfil profissional (pré-preenchido; opção "não atendo pacientes" pula), Horários padrão (grade semanal mobile-first com presets "seg–sex 8h–18h"). Concluir chama `/tenant/onboarding/complete`. Pode ser retomado.
- `/app/configuracoes/studio`: formulário com seções; campos legais só visíveis/editáveis com `tenant:manage`; upload de logo.
- `/app/configuracoes/profissionais`: lista com status; criar/editar; vincular a usuário (select de memberships sem perfil); serviços; horários do profissional; assinatura (upload/preview/remover) — assinatura só carregada sob demanda.
- `/app/perfil`: o próprio profissional edita sua allowlist e assinatura.
- `/app/configuracoes/servicos` e `/salas`: CRUD simples com desativar.
- Formulários com máscara de CNPJ/CPF, validação client-side espelhando a server-side (fonte da verdade no servidor).

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Exposição de CREFITO/documento/telefone a papéis sem necessidade | Projeção por permissão em todos os DTOs de resposta; teste por papel; listagens nunca incluem campos sensíveis |
| ADMIN alterando dados legais do studio | `tenant:manage` só OWNER, validado por campo no serviço (não só no controller) |
| Mass assignment em `/professionals/me` | Allowlist estrita; `status`/`membershipId` rejeitados (`forbidNonWhitelisted`) |
| Upload malicioso (polyglot, SVG com script, tamanho) | Magic bytes, bloqueio de SVG, limites, `Content-Disposition: attachment`, storage privado, URL curta |
| Path traversal na chave de storage | Chave montada pelo servidor a partir de ids validados; nunca nome do arquivo do cliente |
| IDOR em `/professionals/:id/signature` | Extension de tenant + regra "próprio ou `professionals:write`"; acesso auditado |
| Vincular membership de outro tenant | Extension + validação explícita da membership no tenant |
| Nested write `serviceIds` de outro tenant | Validação prévia (`count where tenantId AND id in`) + teste |
| Dados pessoais do profissional em auditoria | `changes` com máscara; allowlist |
| Logo/assinatura em cache do SW | `sw.js` não cacheia `/storage/` nem URLs assinadas |

## 7. Observabilidade

- `studio.onboarding.{started,completed}`, `professional.{created,activated}`, `upload.rejected{reason}`, `storage.{put,get}.failed`.

## 8. Testes

### Unit

- `ProfessionalPolicy`: regras de `ACTIVE`, vínculo de membership (papel, tenant, duplicidade), allowlist de `me`.
- `WorkingHoursPolicy`: sobreposição, ordem, passos de 5 min, máx. 4 intervalos, `effective()` com/sem override.
- Validadores CNPJ/CPF, timezone, máscaras.
- `upload.validation`: magic bytes vs extensão, SVG bloqueado, tamanho.
- Mapper de projeção por papel (RECEPTION não recebe `councilNumber`).
- `FileStoragePort` local: chave sempre prefixada pelo tenant do contexto.

### Integração (`studio.integration.spec.ts`, `professionals.integration.spec.ts`, `working-hours.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| OWNER `PATCH /tenant/settings` com `legalName`+`documentNumber` | 200; `AuditLog` com documento mascarado |
| ADMIN mesmo payload | 403; ADMIN só campos operacionais → 200 |
| RECEPTION `GET /tenant/settings` | 200 sem `documentNumber` em claro |
| OWNER cria profissional com `membershipId` de `studio-b` | 404 |
| Vincular membership `RECEPTION` | 400 |
| Convite `PROFESSIONAL` aceito | `Professional DRAFT` criado e vinculado |
| PROFESSIONAL `PATCH /professionals/me { status: 'ACTIVE' }` | 400 |
| PROFESSIONAL `PATCH /professionals/:outroId` | 403 |
| RECEPTION `GET /professionals` | 200 sem `councilNumber`/`phone`/`signature` |
| `POST /professionals` com `serviceIds` contendo serviço de `studio-b` | 400/404, nada criado |
| Upload PNG válido / JPEG renomeado para .png / SVG / 2 MB | 201 / 400 / 400 / 413 |
| `GET signature` como RECEPTION | 403; como o próprio → 200 + `AuditLog professional.signature.viewed` |
| `PUT /working-hours` com sobreposição | 400 |
| `effective` com override apenas na segunda | segunda = override; terça = **vazio** (não padrão), conforme regra documentada |
| `POST /tenant/onboarding/complete` sem profissional ativo | 409 |
| Nome de serviço duplicado com caixa diferente | 409 |

### E2E

```gherkin
Funcionalidade: Configuração inicial do studio
  Cenário: onboarding do OWNER
    Dado um OWNER recém-criado em "studio-novo" sem onboarding
    Quando entra no app
    Então é levado ao onboarding
    Quando preenche nome do studio, telefone e fuso
    E preenche seu perfil profissional com CREFITO e especialidades
    E aplica o preset "seg–sex 8h–18h"
    E conclui
    Então vê o painel do studio com o nome configurado

  Cenário: dados legais só para OWNER
    Dado um ADMIN autenticado
    Quando acessa /app/configuracoes/studio
    Então não vê os campos de razão social e CNPJ

Funcionalidade: Perfil do profissional
  Cenário: profissional edita o próprio perfil
    Dada uma PROFESSIONAL autenticada com perfil vinculado
    Quando altera especialidades e bio em /app/perfil
    Então as alterações são salvas e aparecem na lista de profissionais

  Cenário: recepção não vê dados sensíveis
    Dada uma RECEPTION autenticada
    Quando acessa a lista de profissionais
    Então vê nomes e especialidades, mas não CREFITO nem telefone
```

Artefatos: fixtures com CREFITO fictício (`000000-F`), CNPJ de teste válido por dígito verificador mas não real; sem screenshots do campo documento preenchido.

## 9. Plano de execução

1. [ ] Branch `feat/CLI-16-studio-setup` a partir de `master` (pós CLI-14). Confirmar D8/D9.
2. [ ] `packages/types/src/studio.ts` (enums, `SPECIALTIES`, views, contrato `EffectiveWorkingHours`); permissões novas + matriz + teste; ações de auditoria + allowlists.
3. [ ] Schema §4 + migration (índice parcial de conselho, unique case-insensitive, backfill `TenantSettings`); registro tenant-owned; teste de nested write na extension.
4. [ ] `StorageModule` (`FileStoragePort`, driver `local`, validação de upload).
5. [ ] `StudioModule`: settings + onboarding; professionals (+ policy, projeção, `me`, link/unlink, assinatura); services; rooms; working-hours (+ `effective`).
6. [ ] Listener de `users.invitation.accepted` → `createDraftForMembership`.
7. [ ] Seed: `TenantSettings` do Studio Vega, 1 profissional vinculado ao OWNER, 2 serviços, 1 sala, horário padrão.
8. [ ] Web: onboarding, studio, profissionais, perfil, serviços, salas; exclusões no `sw.js`.
9. [ ] Testes §8.
10. [ ] Docs: `docs/studio-setup.md` (modelo, contrato `effective` para agenda, RBAC por campo, storage), `README.md`, `.env.example` (`FILE_STORAGE_*`), `infra/oci/README.md` (bucket privado).
11. [ ] Validação mandatória.
12. [ ] PR `CLI-16 — Perfil do profissional e configuração inicial do studio`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Projeção por papel em toda resposta com campos sensíveis; nenhum vazamento em listagem.
- [ ] Upload seguro (magic bytes, limites, storage privado, URL curta, auditoria de acesso).
- [ ] `effective working hours` documentado como contrato para os cards de agenda.
- [ ] Onboarding conclui apenas com pré-requisitos; retomável.
- [ ] Auditoria de todas as mutações com máscara de dados pessoais.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| D8 storage | Porta + `local` neste card; `oci` pode ser follow-up sem bloquear o P0 em dev; produção precisa do driver antes de habilitar upload |
| D9 `Service` sem preço | Evita colisão com o card financeiro; `Service` ganha `priceCents` lá |
| Semântica de override de horários | "Substitui, não faz merge" simplifica a agenda; documentar e testar |
| Dependência de leitura de imagem | Verificar `image-size` (MIT, sem nativo) antes de adicionar; alternativa: aceitar sem checar dimensões no P0 |
| Profissional sem conselho (instrutor) | `councilType` opcional; `ACTIVE` via `councilNotApplicable` no DTO |
| Multi-unidade futura | `Room`/`WorkingHours` por tenant hoje; `unitId` opcional depois, sem quebra |
