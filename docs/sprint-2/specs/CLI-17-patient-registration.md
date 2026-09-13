# Spec — CLI-17 Cadastro único de paciente/cliente

| Campo | Valor |
| --- | --- |
| Linear | [CLI-17](https://linear.app/clivyra/issue/CLI-17/sprint-2-cadastro-unico-de-pacientecliente) — Urgent — Backlog |
| Pai | CLI-67 |
| Branch | `feat/CLI-17-patient-registration` (a partir de `master` com Sprint 1 completa) |
| Depende de | CLI-11 (extension de tenant), CLI-12 (auth), CLI-13 (`clients:*`, guards globais), CLI-14 (`@Audited`, `changes` mascarados); **fase 2**: CLI-15 (`ConsentSubjectType.PATIENT`, ports LGPD), CLI-16 (`Professional`) |
| Bloqueia | CLI-18, CLI-19, CLI-20, CLI-21, CLI-50, CLI-51; Sprints 3–5 (toda entidade que referencia paciente) |
| Decisões em aberto | D10 (CPF opcional), D11 (telefone duplicado), D13 (revelar CPF), D17 (status vs. lead), D18 (nome social) |

## 1. Objetivo

Criar o cadastro central de pessoa (`Patient`) reutilizado por CRM, agenda, financeiro e prontuário: dados pessoais e de contato, CPF validado, idade calculada, contato de emergência, origem, tipo de atendimento, observações administrativas e um ciclo de vida de status com troca rápida — com deduplicação por tenant (CPF/telefone), mobile-first e auditoria das alterações relevantes.

## 2. Escopo

### Dentro

- Modelo `Patient` tenant-owned + `PatientStatusHistory` append-only.
- Validadores/normalizadores compartilhados em `packages/shared/src/br/` (CPF, telefone E.164, e-mail, nome normalizado) e máscaras de exibição.
- Deduplicação por tenant: unique parcial de CPF e de telefone; endpoint de checagem prévia para a UI; override auditado de telefone compartilhado (D11).
- Máquina de transições de status (`PatientStatusPolicy`) com os 10 estados do card; troca rápida; histórico com motivo.
- Arquivamento (soft-delete) e restauração.
- Projeção por permissão: CPF sempre mascarado nas respostas; revelação explícita auditada (D13).
- Evento interno `patient.status.changed` (`PatientStatusListenerPort`) para CLI-18/20.
- Extensões Postgres `unaccent`/`pg_trgm` e coluna `nameNormalized` (base para CLI-19).
- Registro dos ports LGPD para `PATIENT` (`SubjectResolverPort`, `DataExporterPort`, `DataAnonymizerPort`) e `ConsentCapture` no cadastro — **fase 2**, condicionada a CLI-15 na `master`.
- Web: lista simples, criar, editar, trocar status, arquivar.

### Fora

- Busca avançada e filtros combinados (CLI-19).
- Lead, funil, follow-up (CLI-18) — aqui só existe o status `LEAD` no ciclo de vida.
- Ficha 360 e timeline (CLI-20).
- Importação (CLI-21).
- Qualquer dado clínico (anamnese, queixa, diagnóstico, alergias) — Sprint 5. `notes` é administrativo e a UI avisa.
- Foto do paciente (storage; pós-piloto).
- Portal do paciente / auto-cadastro público.
- Responsável legal como entidade própria (menores): no P0, o contato de emergência cumpre o papel; entidade `Guardian` fica como follow-up.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| CPF/telefone evitam duplicidade dentro do tenant | Unique parciais `(tenantId, cpf)` e `(tenantId, phone)` `WHERE archivedAt IS NULL`; `POST /patients` com CPF já existente → `409 PATIENT_DUPLICATE_CPF` com `existingPatientId` e nome; mesmo CPF em `studio-b` → `201`; integração + E2E |
| Status pode ser alterado rapidamente | `POST /patients/:id/status { toStatus, reason? }` idempotente por transição; `PatientStatusChip` com bottom sheet; transição inválida → `409 PATIENT_INVALID_TRANSITION`; unit da policy + E2E |
| Cadastro é mobile-first | Formulário em uma coluna, seções colapsáveis, teclado numérico para CPF/telefone/data, máscaras; E2E em viewport mobile (Playwright `devices['Pixel 7']`) |
| Alterações relevantes são auditadas | `patient.created\|updated\|status_changed\|archived\|restored\|cpf.revealed\|duplicate_override` com `changes` mascarados; integração verifica que `cpf` aparece como `***.***.***-12` no `AuditLog` |
| (CLI-67) Nome, telefone e CPF respeitam deduplicação por tenant | Nome **não** é unique (homônimos); duplicidade provável por `nameNormalized + birthDate` é **aviso** em `check-duplicates`, não bloqueio |
| (CLI-67) Contexto administrativo acessado por papéis autorizados | `clients:read` para os 4 papéis; `clients:archive` só OWNER/ADMIN; teste por papel |

## 4. Modelo de dados

```prisma
enum PatientStatus {
  LEAD                  // contato inicial (funil detalhado em Lead.stage — CLI-18)
  EVALUATION_SCHEDULED  // avaliação agendada
  IN_TREATMENT          // em atendimento (fisioterapia/terapias)
  ACTIVE                // ativo (Pilates / plano vigente)
  INACTIVE              // sem atividade, sem desligamento formal
  DISCHARGED            // alta
  CANCELED              // cancelado
  PAUSED                // pausa
  FORMER_STUDENT        // ex-aluno
  NOT_CONVERTED         // lead não convertido
}

enum ServiceType {
  PILATES
  PHYSIOTHERAPY
  THERAPIES
}

enum PatientSource {
  INSTAGRAM
  GOOGLE
  REFERRAL      // indicação
  WALK_IN       // passou na porta
  WHATSAPP
  WEBSITE
  EVENT
  PARTNERSHIP   // convênio/parceria
  OTHER
}

model Patient {
  id                            String         @id @default(cuid())
  tenantId                      String
  fullName                      String                          // 2..120
  socialName                    String?                         // D18; exibido no lugar de fullName quando presente
  nameNormalized                String                          // unaccent(lower(fullName)) — mantido pela aplicação; índice GIN trgm (CLI-19)
  cpf                           String?                         // 11 dígitos, validado; sensível; mascarado por padrão
  birthDate                     DateTime?      @db.Date         // idade calculada na leitura, nunca persistida
  email                         String?                         // lower-case
  phone                         String?                         // E.164 (+5511...); principal / WhatsApp
  phoneIsWhatsapp               Boolean        @default(true)
  allowSharedPhone              Boolean        @default(false)  // D11: telefone de responsável; sai do unique parcial; só clients:archive
  secondaryPhone                String?                         // E.164
  addressLine1                  String?
  addressLine2                  String?
  city                          String?
  state                         String?                         // UF
  postalCode                    String?                         // 8 dígitos
  emergencyContactName          String?
  emergencyContactPhone         String?                         // E.164
  emergencyContactRelationship  String?                         // 40 chars
  source                        PatientSource?
  sourceDetail                  String?                         // 120 chars (ex.: nome de quem indicou)
  serviceType                   ServiceType
  status                        PatientStatus  @default(LEAD)
  statusChangedAt               DateTime       @default(now())
  notes                         String?                         // administrativo; máx. 2000; sem dado clínico
  responsibleProfessionalId     String?                         // FK → Professional (CLI-16) — fase 2
  importId                      String?                         // FK → PatientImport (CLI-21); rastreabilidade
  externalId                    String?                         // id do sistema/planilha de origem
  archivedAt                    DateTime?
  archivedByUserId              String?
  createdByUserId               String
  createdAt                     DateTime       @default(now())
  updatedAt                     DateTime       @updatedAt
  tenant                        Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  statusHistory                 PatientStatusHistory[]

  @@index([tenantId, status, archivedAt])
  @@index([tenantId, serviceType, status])
  @@index([tenantId, nameNormalized])
  @@index([tenantId, birthDate])
  @@index([tenantId, updatedAt(sort: Desc)])
}

/// Append-only (trigger append_only_guard). Fonte da timeline do 360.
model PatientStatusHistory {
  id               String        @id @default(cuid())
  tenantId         String
  patientId        String
  fromStatus       PatientStatus?
  toStatus         PatientStatus
  reason           String?                        // máx. 200; obrigatório para CANCELED, PAUSED, NOT_CONVERTED
  origin           String        @default("MANUAL") // MANUAL | LEAD_CONVERSION | IMPORT | SYSTEM
  changedByUserId  String?
  occurredAt       DateTime      @default(now())
  tenant           Tenant        @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  patient          Patient       @relation(fields: [patientId], references: [id], onDelete: Restrict)

  @@index([tenantId, patientId, occurredAt(sort: Desc)])
}
```

SQL adicional na migration (Prisma não expressa):

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE UNIQUE INDEX "Patient_tenantId_cpf_active_key"
  ON "Patient" ("tenantId", "cpf") WHERE "cpf" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Patient_tenantId_phone_active_key"
  ON "Patient" ("tenantId", "phone") WHERE "phone" IS NOT NULL AND "archivedAt" IS NULL AND "allowSharedPhone" = false;
CREATE UNIQUE INDEX "Patient_tenantId_externalId_key"
  ON "Patient" ("tenantId", "externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX "Patient_tenantId_nameNormalized_trgm_idx"
  ON "Patient" USING GIN ("nameNormalized" gin_trgm_ops);

CREATE TRIGGER patient_status_history_append_only
  BEFORE UPDATE OR DELETE ON "PatientStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
```

Notas:

- `allowSharedPhone` materializa D11: quando `true`, a linha sai do índice parcial de telefone. Só pode ser setado por ator com `clients:archive`, sempre com auditoria `patient.duplicate_override`.
- Todos os modelos em `TENANT_OWNED_MODELS`. A extension já sobrescreve `data.tenantId` em `create`.
- Idade **não** é coluna: `age` é calculada no mapper a partir de `birthDate` e do fuso do tenant (`TenantSettings.timezone`, CLI-16; fallback `America/Sao_Paulo`).
- `cpf`, `phone`, `secondaryPhone`, `emergencyContactPhone`, `email`: sensíveis (§6). CPF nunca em índice de busca textual; busca por CPF é igualdade por dígitos (CLI-19).
- `onDelete: Restrict` em tudo: paciente não é apagado, é arquivado; eliminação só via anonimização LGPD.
- Migration aditiva. Se `CREATE EXTENSION` falhar por permissão, a migration registra em `SystemMetadata` (`search.trgm=false`) e o índice GIN é pulado (D19).

## 5. Design

### 5.1 Módulos e arquivos

```text
packages/shared/src/br/
  cpf.ts                      # isValidCpf, normalizeCpf, maskCpf
  phone.ts                    # normalizePhoneE164(country), isValidBrPhone, maskPhone
  email.ts                    # normalizeEmail
  name.ts                     # normalizeName (unaccent + lower + collapse spaces) — mesma regra do SQL
packages/shared/src/masking.ts
packages/types/src/patients.ts  # enums, PATIENT_STATUS_LABELS_PT, PatientListItemView, PatientDetailView, CreatePatientInput, PatientStatusTransition

apps/api/src/patients/
  patients.module.ts
  patients.controller.ts
  patients.service.ts
  patients.repository.ts               # única camada que fala com Prisma para Patient
  patient.mapper.ts                    # entidade → views com máscara e idade
  dto/create-patient.dto.ts, update-patient.dto.ts, change-status.dto.ts, check-duplicates.dto.ts
  domain/patient-status.policy.ts      # transições, motivos obrigatórios
  domain/patient-status.events.ts      # PatientStatusListenerPort + registry
  domain/patient-duplicates.service.ts # exato (cpf/phone) + provável (nameNormalized + birthDate)
  lgpd/patient-subject.resolver.ts     # fase 2 (CLI-15)
  lgpd/patient-data.exporter.ts        # fase 2
  lgpd/patient-data.anonymizer.ts      # fase 2

apps/web/app/(app)/app/pacientes/page.tsx                 # lista básica (CLI-19 substitui por busca)
apps/web/app/(app)/app/pacientes/novo/page.tsx
apps/web/app/(app)/app/pacientes/[id]/editar/page.tsx
apps/web/components/patients/patient-form.tsx
apps/web/components/patients/patient-status-chip.tsx      # troca rápida (bottom sheet)
apps/web/components/patients/duplicate-warning.tsx
apps/web/app/api/patients/**                               # BFF (mesmo padrão de app/api/users)
```

### 5.2 Permissões

| Permissão | OWNER | ADMIN | PROFESSIONAL | RECEPTION |
| --- | :-: | :-: | :-: | :-: |
| `clients:read` (existente) | ✓ | ✓ | ✓ | ✓ |
| `clients:write` (existente) | ✓ | ✓ | ✓ | ✓ |
| `clients:archive` (**nova**) | ✓ | ✓ | – | – |

### 5.3 Endpoints

| Método/rota | Permissão | Notas |
| --- | --- | --- |
| `GET /patients?status[]&serviceType[]&includeArchived&cursor&limit&sort` | `clients:read` | Lista básica (CLI-19 adiciona `q` e filtros ricos em `/patients/search`); `PatientListItemView` com `cpfMasked`, `phoneMasked`, `age`, `status`, `serviceType`, `updatedAt` |
| `POST /patients` | `clients:write` | Body §5.4; `201 PatientDetailView`; `409` em duplicidade; `origin=MANUAL` |
| `GET /patients/:id` | `clients:read` | `PatientDetailView` (CPF **mascarado**); `404` se de outro tenant ou arquivado sem `includeArchived` |
| `PATCH /patients/:id` | `clients:write` | Parcial; recalcula `nameNormalized`; não aceita `status` (usar rota própria), `archivedAt`, `importId`, `externalId` |
| `POST /patients/:id/status { toStatus, reason? }` | `clients:write` | Aplica `PatientStatusPolicy`; grava `PatientStatusHistory`; dispara listeners; `409` se inválida; `200` idempotente se já está no status (sem novo histórico) |
| `GET /patients/:id/status-history?cursor` | `clients:read` | Cronológico decrescente |
| `POST /patients/:id/archive { reason }` | `clients:archive` | `archivedAt=now`; libera CPF/telefone dos uniques; paciente sai das listas |
| `POST /patients/:id/restore` | `clients:archive` | Revalida duplicidade antes de restaurar (`409` se CPF/telefone foram reutilizados) |
| `GET /patients/:id/cpf` | `clients:write` | Retorna `{ cpf }` completo; `recordAccess('patient.cpf.revealed')`; rate limit 30/min por usuário |
| `POST /patients/check-duplicates { cpf?, phone?, fullName?, birthDate? }` | `clients:write` | `{ exact: [{ patientId, displayName, cpfMasked, matchedBy: 'CPF'\|'PHONE' }], probable: [{ patientId, displayName, matchedBy: 'NAME_BIRTHDATE', score }] }`; nunca CPF/telefone completos; ignora arquivados |
| `POST /patients/:id/allow-shared-phone { justification }` | `clients:archive` | D11; `patient.duplicate_override` com `matchedBy=PHONE`, `existingPatientId` |

Todas as mutações `@Audited`. `patients.controller.ts` só orquestra HTTP; regras em `PatientsService`/`domain`.

### 5.4 Contratos (packages/types)

```ts
export interface CreatePatientInput {
  fullName: string
  socialName?: string
  cpf?: string                 // aceita com máscara; normalizado para dígitos
  birthDate?: string           // YYYY-MM-DD
  email?: string
  phone?: string               // aceita formatos BR; normalizado E.164
  phoneIsWhatsapp?: boolean
  secondaryPhone?: string
  address?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string }
  emergencyContact?: { name?: string; phone?: string; relationship?: string }
  source?: PatientSource
  sourceDetail?: string
  serviceType: ServiceType
  status?: Extract<PatientStatus, 'LEAD' | 'EVALUATION_SCHEDULED' | 'IN_TREATMENT' | 'ACTIVE'>  // default LEAD
  notes?: string
  responsibleProfessionalId?: string   // fase 2
}

export interface PatientDetailView {
  id: string
  fullName: string
  socialName: string | null
  displayName: string          // socialName ?? fullName
  cpfMasked: string | null     // '***.***.***-12'
  birthDate: string | null
  age: number | null
  email: string | null
  phoneMasked: string | null
  phoneIsWhatsapp: boolean
  whatsappHref: string | null  // 'https://wa.me/5511...' (CLI-20) — só quando phoneIsWhatsapp
  // ... demais campos não sensíveis ...
  status: PatientStatus
  statusChangedAt: string
  availableTransitions: PatientStatus[]  // derivadas da policy para a UI
  isLead: boolean              // status ∈ LEAD_STATUSES
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Telefone: a view de detalhe devolve `phoneMasked` **e** `whatsappHref`; o href contém o número completo por necessidade funcional (abrir conversa) e só é emitido para `clients:write`. Listagens devolvem apenas máscaras.

### 5.5 Regras de negócio

**Validação e normalização (servidor é a fonte da verdade)**

- `fullName` 2..120, sem dígitos apenas; `nameNormalized = normalizeName(fullName)` (mesma função usada por CLI-19/21).
- `cpf`: remove não-dígitos; 11 dígitos; rejeita sequências repetidas; dígitos verificadores válidos → `400 PATIENT_INVALID_CPF`.
- `phone`/`secondaryPhone`/`emergencyContactPhone`: `normalizePhoneE164(value, PATIENT_DEFAULT_PHONE_COUNTRY)`; BR: 10 ou 11 dígitos nacionais, DDD válido (11–99), celular começa com 9 → `400 PATIENT_INVALID_PHONE`.
- `email`: lower-case, formato; opcional.
- `birthDate`: não futura; idade ≤ 120; `age` calculada com o fuso do tenant.
- `postalCode`: 8 dígitos; `state`: UF válida.
- `notes`: ≤ 2000; a UI exibe "Não registre informações clínicas aqui"; sem validação semântica no P0 (follow-up: heurística de termos clínicos como aviso).
- Strings passam por `trim` e remoção de caracteres de controle; nunca HTML (a web renderiza como texto).

**Deduplicação (`PatientDuplicatesService`)**

- Exata: mesmo `cpf` **ou** mesmo `phone` em paciente não arquivado do tenant → `409 PATIENT_DUPLICATE_CPF` / `PATIENT_DUPLICATE_PHONE` com `{ existingPatientId, displayName, cpfMasked }`. A constraint do banco é a garantia final (race condition); o serviço traduz `P2002` para o `409` correto.
- Telefone compartilhado legítimo (D11): `POST /patients` e `PATCH /patients/:id` aceitam `allowSharedPhone: true` **somente** quando o ator tem `clients:archive` — validado no serviço (não só no DTO); papel sem a permissão recebe `403 PATIENT_SHARED_PHONE_FORBIDDEN`. Sempre exige `sharedPhoneJustification` (≤ 200) e grava `patient.duplicate_override` com `matchedBy=PHONE` e `existingPatientId`. A UI apresenta como "usar telefone do responsável". A rota `POST /patients/:id/allow-shared-phone` cobre o caso de um paciente já existente que precisa passar a compartilhar telefone.
- Provável: `nameNormalized` igual (ou similaridade trgm ≥ 0.6 quando disponível) **e** mesma `birthDate` → aviso em `check-duplicates`; não bloqueia.
- Tenants diferentes nunca se enxergam: a extension já limita; teste cross-tenant obrigatório.

**Ciclo de vida (`PatientStatusPolicy`)**

- `LEAD_STATUSES = [LEAD, EVALUATION_SCHEDULED, NOT_CONVERTED]`; `CLIENT_STATUSES` = os demais.
- Transições permitidas:
  - De `LEAD` → `EVALUATION_SCHEDULED`, `NOT_CONVERTED`, `IN_TREATMENT`, `ACTIVE`
  - De `EVALUATION_SCHEDULED` → `LEAD`, `NOT_CONVERTED`, `IN_TREATMENT`, `ACTIVE`
  - De `NOT_CONVERTED` → `LEAD`, `IN_TREATMENT`, `ACTIVE`
  - De qualquer `CLIENT_STATUS` → qualquer outro `CLIENT_STATUS` (studio decide; ex.: `ACTIVE → PAUSED → ACTIVE`, `IN_TREATMENT → DISCHARGED → IN_TREATMENT` em retorno)
  - De `CLIENT_STATUS` → `LEAD_STATUS`: **proibido** (D17: conversão não volta)
- `reason` obrigatório (`400`) para `CANCELED`, `PAUSED`, `NOT_CONVERTED`; opcional nos demais.
- Transição `LEAD_STATUS → CLIENT_STATUS` é uma **conversão**: `origin` do histórico = `LEAD_CONVERSION` quando disparada por CLI-18, `MANUAL` quando pela tela do paciente; em ambos os casos os listeners (`PatientStatusListenerPort`) rodam **na mesma transação** (CLI-18 fecha o `Lead` como `CONVERTED`).
- `availableTransitions` na view alimenta o bottom sheet; a API valida de novo.
- Semântica por `serviceType` é orientativa (Pilates usa `ACTIVE`/`FORMER_STUDENT`; Fisioterapia usa `IN_TREATMENT`/`DISCHARGED`) — a UI ordena as opções por relevância, a API aceita todas.

**Arquivamento**

- `archive` exige `reason`; paciente arquivado não aparece em listas/busca/360 sem `includeArchived` (só `clients:archive` pode listar arquivados).
- Arquivar **não** apaga nada e não afeta `ConsentRecord`/`AuditLog`. Eliminação = `DataAnonymizerPort` (CLI-15) com `RetentionPolicy` (`LEAD: 2y`; paciente com prontuário: `RETAIN`).

**Eventos**

```ts
interface PatientStatusChangedEvent { tenantId: string; patientId: string; from: PatientStatus | null; to: PatientStatus; origin: string; actorUserId: string | null; tx: PrismaTx }
interface PatientStatusListenerPort { onStatusChanged(event: PatientStatusChangedEvent): Promise<void> }
```

Registro via `PatientStatusEvents.register(listener)` no `onModuleInit` do módulo interessado. Listener que lança aborta a transação (consistência > disponibilidade para este caso).

### 5.6 Fase 2 — LGPD (quando CLI-15 estiver na `master`)

- `PatientSubjectResolver`: `PATIENT` existe se `Patient` do tenant não arquivado; `LEAD` idem (mesma tabela).
- `PatientDataExporter` (`module='patients'`, `subjectTypes=['PATIENT','LEAD']`): seções `profile` (dados cadastrais completos), `statusHistory`, `consents` (delegado), sem auditoria de terceiros.
- `PatientDataAnonymizer` (`category=LEAD` quando `isLead`, senão `PATIENT_ADMIN`): substitui `fullName` por `"Paciente removido"`, zera `cpf`, `phone*`, `email`, endereço, contato de emergência, `notes`, `sourceDetail`; mantém `id`, `status`, `serviceType`, `statusHistory` (com `reason` apagado); `archivedAt=now`. Se existir prontuário (Sprint 5) → `RETAIN`.
- `ConsentCapture` no formulário de criação: termo `TREATMENT`/`PRIVACY` vigente, `IN_PERSON` com `signerName`; consentimento **não é obrigatório** para salvar (o paciente pode assinar na primeira visita), mas a ficha mostra `MISSING`.
- FK física `ConsentRecord.subjectId → Patient.id` **não** é adicionada (sujeito polimórfico); integridade via resolver.

### 5.7 Web

- `/app/pacientes/novo`: formulário em seções (Identificação, Contato, Endereço, Emergência, Atendimento, Observações); máscaras de CPF/telefone/CEP/data; `check-duplicates` com debounce ao sair do campo CPF/telefone → `DuplicateWarning` com link para o paciente existente; erro `409` do servidor tratado igual.
- `/app/pacientes/[id]/editar`: mesmo formulário; CPF exibido mascarado com ação "revelar" (chama `/cpf`, mostra por 30 s, avisa que a visualização é registrada).
- `PatientStatusChip`: toca → bottom sheet com `availableTransitions` ordenadas por `serviceType`; campo de motivo quando obrigatório; confirma → `POST /status`; toast e atualização otimista com rollback.
- Lista `/app/pacientes`: cards com `displayName`, `age`, `status`, `serviceType`, `phoneMasked`; botão flutuante "Novo paciente"; CLI-19 substitui a lista pela busca sem trocar a rota.
- Rotas BFF `apps/web/app/api/patients/**` seguem `app/api/users/route.ts` (`assertSameOrigin`, cookie de acesso, proxy).

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| IDOR / paciente de outro tenant | Extension `tenantScoped` em toda query; `404` (nunca `403`); teste com id de `studio-b` |
| Enumeração de CPF via `check-duplicates` | Rota exige `clients:write` (autenticado no tenant); resposta só com `displayName` + `cpfMasked`; rate limit 60/min por usuário; não distingue "CPF inválido" de "não encontrado" quando o CPF é inválido (`400` genérico) |
| CPF exposto em lista/detalhe/logs/auditoria | Mascarado por padrão; revelação auditada (`recordAccess`); `redaction.ts` ganha chaves `cpf`, `phone`, `emergencyContactPhone`; `changes` mascarados |
| Mass assignment | DTOs allowlist (`forbidNonWhitelisted`); `status`, `archivedAt`, `importId`, `externalId`, `allowSharedPhone` (sem permissão) rejeitados no `PATCH` |
| `tenantId` do cliente | `check-tenant-boundaries.mjs`; extension sobrescreve em `create` |
| Dado clínico em `notes` | Aviso na UI; `notes` fora de `metadata` de auditoria; exportação LGPD inclui `notes` como dado do titular |
| Override de telefone abusivo | `clients:archive` + justificativa + auditoria; visível na timeline |
| Race em duplicidade | Unique parcial no banco; `P2002` → `409` mapeado |
| PII em fixtures/E2E | CPFs sintéticos válidos por algoritmo; nomes `Paciente A1`; sem screenshot com CPF revelado |
| Menores | `birthDate` define `age`; UI sugere preencher contato de emergência quando `age < 18`; sem regra bloqueante no P0 |

## 7. Observabilidade

- Logs estruturados: `patient.created`, `patient.duplicate_rejected{matchedBy}`, `patient.status_changed{from,to}`, `patient.cpf_revealed`, sem PII (só `patientId`, `tenantId`, `requestId`).
- Métricas: contador de `409` por `matchedBy` (mede duplicidade evitada — hipótese do piloto "Patient 360 reduz retrabalho").

## 8. Testes

### Unit

- `cpf.ts`: válidos, inválidos, repetidos, com máscara, `maskCpf`.
- `phone.ts`: formatos BR (`(11) 91234-5678`, `11912345678`, `+5511912345678`), fixo 10 dígitos, DDD inválido, `maskPhone`.
- `name.ts`: acentos, espaços múltiplos, caixa; paridade com `unaccent(lower())` do Postgres (teste de integração garante).
- `PatientStatusPolicy`: matriz completa de transições; motivos obrigatórios; `CLIENT → LEAD` proibido; `availableTransitions`.
- `PatientDuplicatesService`: exato por CPF/telefone, provável por nome+nascimento, arquivados ignorados.
- `patient.mapper`: idade (aniversário hoje/ontem/amanhã, ano bissexto), máscaras, `whatsappHref` só com permissão e `phoneIsWhatsapp`.
- Listener registry: listener que lança aborta; ordem de registro.

### Integração (`patients.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| RECEPTION A cria paciente completo | `201`; `AuditLog patient.created` com `cpf` mascarado em `changes` |
| Mesmo CPF em A | `409 PATIENT_DUPLICATE_CPF` com `existingPatientId` |
| Mesmo CPF em B | `201` |
| Mesmo telefone em A sem override | `409 PATIENT_DUPLICATE_PHONE` |
| RECEPTION envia `allowSharedPhone: true` | `403`; OWNER envia → `201` + `patient.duplicate_override` |
| `GET /patients/:idDeB` autenticado em A | `404` |
| `GET /patients` em A | só pacientes de A; nenhum `cpf` em claro no body |
| `PATCH` com `status` no body | `400` (não whitelisted) |
| `POST /status LEAD → ACTIVE` | `200`; histórico com `fromStatus=LEAD`; listener de teste chamado na mesma transação |
| `POST /status ACTIVE → LEAD` | `409 PATIENT_INVALID_TRANSITION` |
| `POST /status → CANCELED` sem `reason` | `400` |
| `POST /status` para o status atual | `200`; sem novo histórico |
| PROFESSIONAL `POST /archive` | `403`; OWNER → `200`; paciente some de `GET /patients`; CPF pode ser reutilizado (`201`) |
| `POST /restore` após CPF reutilizado | `409` |
| `GET /patients/:id/cpf` | `200 { cpf }`; `AuditLog patient.cpf.revealed` com `actorUserId` |
| Paridade `normalizeName` × `unaccent(lower())` para amostra de nomes | iguais |
| `nameNormalized` recalculado no `PATCH fullName` | igual ao esperado |

### E2E

```gherkin
Funcionalidade: Cadastro único de paciente
  Cenário: recepção cadastra paciente pelo celular
    Dada uma RECEPTION autenticada em "studio-a" em viewport mobile
    Quando abre "Novo paciente", preenche nome, telefone, nascimento e tipo "Pilates"
    E salva
    Então vê a ficha do paciente com idade calculada e status "Lead"

  Cenário: duplicidade óbvia é impedida
    Dado um paciente com CPF sintético X em "studio-a"
    Quando a RECEPTION digita o CPF X em um novo cadastro
    Então vê o aviso de duplicidade com link para o paciente existente
    E ao tentar salvar recebe o erro de CPF já cadastrado

  Cenário: troca rápida de status
    Dado um paciente "Ativo"
    Quando toca no chip de status e escolhe "Pausa" com motivo
    Então o chip mostra "Pausa" e o histórico exibe a transição com o motivo

  Cenário: isolamento entre tenants
    Dado um paciente P em "studio-b"
    Quando um usuário de "studio-a" acessa a URL de edição de P
    Então vê "Paciente não encontrado"
```

Artefatos: fixtures sintéticas; CPF sempre mascarado nas telas gravadas; sem `notes` com conteúdo clínico.

## 9. Plano de execução

1. [ ] Confirmar Sprint 1 (CLI-12/13/14) na `master`; abrir `feat/CLI-17-patient-registration`. Confirmar D10, D11, D13, D17, D18.
2. [ ] `packages/shared/src/br/*`, `masking.ts` + testes; `packages/types/src/patients.ts` (enums, labels pt-BR, views, inputs).
3. [ ] `clients:archive` no catálogo + matriz + teste de matriz; ações de auditoria + allowlists + labels.
4. [ ] Schema §4 + migration (extensões, uniques parciais, GIN, trigger append-only, fallback D19); `TENANT_OWNED_MODELS`; `redaction.ts` com chaves novas.
5. [ ] `PatientsModule`: repository, policy, duplicates, events, service, mapper, controller, DTOs.
6. [ ] `SENSITIVE_MODULES += 'patients'`; `check:standards` verde.
7. [ ] Fixtures de integração com pacientes sintéticos em A/B (gerador de CPF válido em `test/support`).
8. [ ] Web: BFF, formulário, chip de status, aviso de duplicidade, lista básica; exclusões no `sw.js`.
9. [ ] Testes §8.
10. [ ] Fase 2 (se CLI-15/16 na `master`): ports LGPD, `ConsentCapture`, FK `responsibleProfessionalId`. Caso contrário, registrar dependência no PR.
11. [ ] Docs: `docs/patients.md` (modelo, ciclo de vida, deduplicação, contrato de eventos), `README.md`, `.env.example`.
12. [ ] Validação mandatória (`lint`, `typecheck`, `test`, `test:integration`, `test:e2e`).
13. [ ] PR `CLI-17 — Cadastro único de paciente/cliente`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Uniques parciais de CPF/telefone provados; `409` mapeados; override auditado.
- [ ] CPF nunca em claro em lista, detalhe, auditoria, logs; revelação auditada.
- [ ] `PatientStatusPolicy` coberta 100% por unit; listener transacional provado.
- [ ] Nenhuma rota sem permissão; `check-tenant-boundaries` e `check-audited-modules` verdes.
- [ ] Contrato `PatientStatusListenerPort` documentado para CLI-18/20.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| CLI-15/16 fora da `master` | Fase 2 separada; `responsibleProfessionalId` fica coluna sem FK até CLI-16 (nullable; FK adicionada em migration aditiva) |
| `unaccent` sem permissão para `CREATE EXTENSION` | Fallback D19; `normalizeName` na aplicação garante busca básica |
| Telefone compartilhado | D11 — recomendação: `allowSharedPhone` no `POST` restrito a `clients:archive` |
| Revelar CPF gerar volume de auditoria | Rate limit + UI mostra por 30 s; volume esperado baixo (uso administrativo) |
| `notes` virar prontuário informal | Aviso na UI; Sprint 5 oferece o lugar certo; considerar heurística de alerta |
| Paciente em múltiplas unidades (multi-unit pós-piloto) | Cadastro é por tenant; `unitId` opcional depois, sem quebra |
