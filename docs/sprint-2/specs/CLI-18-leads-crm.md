# Spec — CLI-18 CRM de leads e funil de conversão

| Campo | Valor |
| --- | --- |
| Linear | [CLI-18](https://linear.app/clivyra/issue/CLI-18/sprint-2-crm-de-leads-e-funil-de-conversao) — High — Backlog |
| Pai | — (milestone Sprint 2; **não-P0**, ver plano §1.2) |
| Branch | `feat/CLI-18-leads-crm` (a partir de `master` após merge de CLI-17; paralelo a CLI-19) |
| Depende de | CLI-17 (`Patient`, `PatientStatusPolicy`, `PatientStatusListenerPort`), CLI-13/14; **fase 2**: CLI-16 (`Service` para serviço de interesse), CLI-15 (`LEAD` como sujeito LGPD) |
| Bloqueia | CLI-20 (seção `lead` do 360), CLI-50, CLI-51 |
| Decisões em aberto | D15 (PROFESSIONAL escreve em leads), D17 (fonte da verdade), D20 (estágios fixos) |

## 1. Objetivo

Registrar e acompanhar contatos antes de se tornarem pacientes/alunos — serviço de interesse, origem e data do primeiro contato, estágio no funil, motivo de não conversão, histórico de observações, próximo follow-up — e converter o lead em cliente **sem recadastro**, preservando todo o histórico, com visão de funil e identificação de follow-ups vencidos.

## 2. Escopo

### Dentro

- `Lead` 1:1 com `Patient` (o lead **é** a pessoa do cadastro único com `status ∈ LEAD_STATUSES`) e `LeadActivity` append-only.
- Seis estágios fixos (D20): novos, em contato, interessados, avaliação agendada, convertidos, não convertidos.
- Criação de lead: cria a pessoa (via `PatientsService`) **e** o lead em uma transação; ou anexa lead a paciente existente em `LEAD` sem lead (ex.: importado).
- Follow-up: `nextFollowUpAt`, responsável (`ownerMembershipId`), lista de vencidos/hoje/semana.
- Conversão: transição de `Patient.status` para um `CLIENT_STATUS` + `Lead.stage=CONVERTED`, na mesma transação, com histórico preservado; também disparada quando a conversão acontece pela tela do paciente (listener).
- Não conversão com motivo controlado + detalhe; reabertura.
- Funil: contagem por estágio e taxa de conversão do período; filtros de origem/serviço/período.
- Filtros para CLI-19 (`leadStage`, `followUpOverdue`) e seção `lead` + fonte de timeline para CLI-20.
- Web: funil (kanban rolável no mobile), lista de follow-ups vencidos, novo lead, ações no card.

### Fora

- Automação de mensagens (WhatsApp/e-mail) — Sprint 6.
- Captura de lead por formulário público/site/Instagram — pós-piloto (requer superfície pública).
- Tarefas genéricas/lembretes push — só `nextFollowUpAt` + lista.
- Múltiplos leads simultâneos por pessoa (um lead por paciente; reabertura reutiliza o mesmo).
- Estágios configuráveis, pontuação de lead, metas comerciais.
- Dashboard geral (pós-piloto); aqui só o funil do módulo.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Lead usa o mesmo cadastro de pessoa | `Lead.patientId` unique e obrigatório; `POST /leads` cria `Patient` com `status=LEAD`; não existe tabela de "pessoa do lead"; integração: após converter, `GET /patients/:id` é o mesmo id |
| Conversão preserva histórico | `LeadActivity` e `Lead` permanecem após `convert`; `PatientStatusHistory` ganha entrada `origin=LEAD_CONVERSION`; timeline do 360 mostra tudo; integração conta atividades antes/depois |
| Follow-ups vencidos são identificáveis | `GET /leads/follow-ups?due=overdue` = `nextFollowUpAt < now` e estágio aberto; badge na navegação; E2E |
| Funil mostra novos, em contato, interessados, avaliação agendada, convertidos e não convertidos | `GET /leads/funnel` retorna as seis contagens + taxa; web em colunas; integração com fixtures |
| (CLI-50) Cadastrar lead e converter em cliente sem recadastro | E2E: criar lead → converter → paciente "Ativo" com mesmos dados, sem formulário de cadastro |

## 4. Modelo de dados

```prisma
enum LeadStage {
  NEW
  CONTACTED
  INTERESTED
  EVALUATION_SCHEDULED
  CONVERTED
  NOT_CONVERTED
}

enum LeadLostReason {
  PRICE
  SCHEDULE          // horário incompatível
  DISTANCE
  NO_RESPONSE       // sumiu
  CHOSE_COMPETITOR
  NO_NEED           // resolveu / desistiu
  HEALTH            // contraindicação/encaminhado (sem detalhe clínico)
  OTHER
}

enum LeadActivityType {
  NOTE
  CALL
  WHATSAPP
  EMAIL
  VISIT
  STAGE_CHANGE
  FOLLOW_UP_SCHEDULED
  CONVERSION
  LOST
  REOPENED
}

model Lead {
  id                   String          @id @default(cuid())
  tenantId             String
  patientId            String          @unique
  stage                LeadStage       @default(NEW)
  stageChangedAt       DateTime        @default(now())
  interestServiceType  ServiceType                        // espelha Patient.serviceType na criação; editável
  interestServiceId    String?                            // FK → Service (CLI-16) — fase 2
  firstContactAt       DateTime        @default(now())    // data/hora do primeiro contato (editável; não futura)
  nextFollowUpAt       DateTime?
  ownerMembershipId    String?                            // responsável pelo follow-up (Membership do tenant)
  lostReason           LeadLostReason?
  lostReasonDetail     String?                            // máx. 200; sem dado clínico
  convertedAt          DateTime?
  convertedToStatus    PatientStatus?
  lostAt               DateTime?
  reopenedCount        Int             @default(0)
  createdByUserId      String
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  tenant               Tenant          @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  patient              Patient         @relation(fields: [patientId], references: [id], onDelete: Restrict)
  activities           LeadActivity[]

  @@index([tenantId, stage, nextFollowUpAt])
  @@index([tenantId, ownerMembershipId, nextFollowUpAt])
  @@index([tenantId, firstContactAt(sort: Desc)])
  @@index([tenantId, interestServiceType, stage])
}

/// Append-only (trigger append_only_guard). Histórico de observações e eventos do lead.
model LeadActivity {
  id               String            @id @default(cuid())
  tenantId         String
  leadId           String
  type             LeadActivityType
  content          String?                         // máx. 1000; observação livre (sem dado clínico)
  fromStage        LeadStage?
  toStage          LeadStage?
  scheduledFor     DateTime?                       // em FOLLOW_UP_SCHEDULED
  occurredAt       DateTime          @default(now())
  createdByUserId  String?
  tenant           Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  lead             Lead              @relation(fields: [leadId], references: [id], onDelete: Restrict)

  @@index([tenantId, leadId, occurredAt(sort: Desc)])
}
```

Notas:

- `Lead` e `LeadActivity` em `TENANT_OWNED_MODELS`; `LeadActivity` com `tenantId` redundante e trigger append-only.
- `patientId @unique` garante um lead por pessoa (reabertura reutiliza). `onDelete: Restrict`: paciente não é apagado; anonimização LGPD trata `Lead` junto (§5.6).
- Mapeamento `Lead.stage ↔ Patient.status` (D17):

| `Lead.stage` | `Patient.status` |
| --- | --- |
| `NEW`, `CONTACTED`, `INTERESTED` | `LEAD` |
| `EVALUATION_SCHEDULED` | `EVALUATION_SCHEDULED` |
| `CONVERTED` | qualquer `CLIENT_STATUS` (`convertedToStatus`) |
| `NOT_CONVERTED` | `NOT_CONVERTED` |

- Migration aditiva. `interestServiceId` fica coluna nullable sem FK até CLI-16 estar na `master`.

## 5. Design

### 5.1 Módulos e arquivos

```text
packages/types/src/leads.ts             # enums, LEAD_STAGE_LABELS_PT, LEAD_LOST_REASON_LABELS_PT, LeadListItemView, LeadDetailView, FunnelView

apps/api/src/leads/
  leads.module.ts
  leads.controller.ts
  leads.service.ts
  leads.repository.ts
  lead.mapper.ts
  dto/create-lead.dto.ts, update-lead.dto.ts, add-activity.dto.ts, convert-lead.dto.ts, lose-lead.dto.ts, leads-query.dto.ts
  domain/lead-stage.policy.ts           # transições de estágio e mapeamento para PatientStatus
  domain/lead-patient-status.listener.ts # PatientStatusListenerPort: mantém Lead.stage coerente
  funnel/funnel.service.ts
  search/lead-filter.providers.ts       # PatientFilterProviderPort: leadStage, followUpOverdue (CLI-19)
  summary/lead-summary.section.ts       # PatientSummarySectionPort 'lead' (CLI-20)
  summary/lead-timeline.source.ts       # PatientTimelineSourcePort (CLI-20)
  lgpd/lead-data.exporter.ts, lead-data.anonymizer.ts  # fase 2 (CLI-15)

apps/web/app/(app)/app/leads/page.tsx            # funil + follow-ups
apps/web/app/(app)/app/leads/novo/page.tsx
apps/web/components/leads/funnel-board.tsx
apps/web/components/leads/lead-card.tsx           # ações rápidas
apps/web/components/leads/follow-up-list.tsx
apps/web/components/leads/lead-activity-form.tsx
apps/web/app/api/leads/**                          # BFF
```

### 5.2 Permissões novas (catálogo + matriz + teste)

| Permissão | OWNER | ADMIN | PROFESSIONAL | RECEPTION |
| --- | :-: | :-: | :-: | :-: |
| `leads:read` | ✓ | ✓ | ✓ | ✓ |
| `leads:write` | ✓ | ✓ | – (D15) | ✓ |

`POST /leads` cria também um `Patient`: exige `leads:write` **e** `clients:write` (`@RequirePermissions('leads:write', 'clients:write')`). Conversão altera `Patient.status`: exige `leads:write` e `clients:write`.

### 5.3 Endpoints

| Método/rota | Permissão | Notas |
| --- | --- | --- |
| `GET /leads?stage[]&ownerMembershipId&serviceType&source&from&to&followUp=overdue\|today\|week\|none&sort&cursor&limit` | `leads:read` | `LeadListItemView` (dados do paciente mascarados: `displayName`, `phoneMasked`, `age`) |
| `POST /leads` | `leads:write`, `clients:write` | `{ patient: CreatePatientInput (status forçado LEAD), interestServiceType?, firstContactAt?, nextFollowUpAt?, ownerMembershipId?, note? }` **ou** `{ patientId }` para paciente existente em `LEAD` sem lead; `201 LeadDetailView`; `409` se paciente já tem lead ou não está em `LEAD_STATUSES`; duplicidade de CPF/telefone → `409` de CLI-17 (mesma pessoa: a UI oferece "abrir cadastro existente") |
| `GET /leads/:id` | `leads:read` | Detalhe + últimas 20 atividades |
| `PATCH /leads/:id` | `leads:write` | `interestServiceType`, `interestServiceId`, `firstContactAt`, `nextFollowUpAt`, `ownerMembershipId`; **não** `stage` (rotas próprias); `nextFollowUpAt` gera `FOLLOW_UP_SCHEDULED` |
| `POST /leads/:id/stage { toStage: NEW\|CONTACTED\|INTERESTED\|EVALUATION_SCHEDULED, note? }` | `leads:write` | Só estágios abertos; `EVALUATION_SCHEDULED` sincroniza `Patient.status`; `409` se lead fechado |
| `POST /leads/:id/activities { type: NOTE\|CALL\|WHATSAPP\|EMAIL\|VISIT, content, occurredAt? }` | `leads:write` | Registra contato; `occurredAt` não futura; opcionalmente `nextFollowUpAt` no mesmo body |
| `GET /leads/:id/activities?cursor` | `leads:read` | Cronológico |
| `POST /leads/:id/convert { toStatus: IN_TREATMENT\|ACTIVE\|EVALUATION_SCHEDULED?, note? }` | `leads:write`, `clients:write` | `toStatus` default `ACTIVE` (Pilates) / `IN_TREATMENT` (Fisio/Terapias) por `interestServiceType`; transação: `PatientsService.changeStatus(origin=LEAD_CONVERSION)` → listener fecha lead → `LeadActivity CONVERSION`; `409` se já convertido |
| `POST /leads/:id/lose { lostReason, lostReasonDetail?, note? }` | `leads:write` | `Patient.status=NOT_CONVERTED` (reason = label do motivo); `LeadActivity LOST`; `409` se já fechado |
| `POST /leads/:id/reopen { note? }` | `leads:write` | Só de `NOT_CONVERTED`; volta para `CONTACTED`; `Patient.status=LEAD`; `reopenedCount++`; `LeadActivity REOPENED` |
| `GET /leads/funnel?from&to&serviceType&source` | `leads:read` | `{ stages: { NEW, CONTACTED, INTERESTED, EVALUATION_SCHEDULED, CONVERTED, NOT_CONVERTED }, conversionRate, avgDaysToConvert, lostReasons: [{ reason, count }] }`; período por `firstContactAt`; default últimos 90 dias |
| `GET /leads/follow-ups?due=overdue\|today\|week&ownerMembershipId=me` | `leads:read` | Ordenado por `nextFollowUpAt`; `me` resolve pela membership do ator |

Todas as mutações `@Audited` (ações no plano §6.3). `content`/`note`/`lostReasonDetail` nunca em `metadata`.

### 5.4 Regras de negócio (`LeadStagePolicy`, `LeadsService`)

**Criação**

- Pessoa nova: delega a `PatientsService.create` com `status=LEAD` forçado (ignora `status` do body); `interestServiceType` default = `patient.serviceType`; `firstContactAt` default `now` (não futura; até 2 anos no passado para migração).
- Pessoa existente: só se `Patient.status ∈ LEAD_STATUSES` e sem `Lead`; `stage` inicial derivado do status (`EVALUATION_SCHEDULED` → `EVALUATION_SCHEDULED`, `NOT_CONVERTED` → `NOT_CONVERTED` fechado, senão `NEW`).
- `ownerMembershipId` deve ser membership ativa do tenant (`404` se não for).
- Primeira `LeadActivity` = `NOTE` com `note` (se houver) ou `STAGE_CHANGE null → NEW`.

**Estágios abertos**

- `NEW → CONTACTED → INTERESTED → EVALUATION_SCHEDULED` em qualquer ordem entre abertos (volta permitida; ex.: avaliação desmarcada → `INTERESTED`). Cada mudança gera `LeadActivity STAGE_CHANGE` e atualiza `stageChangedAt`.
- `EVALUATION_SCHEDULED` ↔ `Patient.status`: entrar sincroniza `Patient.status=EVALUATION_SCHEDULED`; sair para outro aberto volta `Patient.status=LEAD`. Sempre via `PatientsService.changeStatus` na mesma transação (o histórico do paciente registra `origin=SYSTEM`).
- Registrar atividade de contato (`CALL`/`WHATSAPP`/`EMAIL`/`VISIT`) em lead `NEW` promove automaticamente para `CONTACTED` (configurável por flag no DTO `autoAdvance=false`).

**Follow-up**

- `nextFollowUpAt` opcional; futura (ou até 1 h no passado para registro tardio). Definir gera `FOLLOW_UP_SCHEDULED` com `scheduledFor`. Registrar qualquer atividade **limpa** `nextFollowUpAt` (a UI pergunta o próximo). Vencido = `nextFollowUpAt < now()` e estágio aberto.
- Lead fechado (`CONVERTED`/`NOT_CONVERTED`) tem `nextFollowUpAt=null`.

**Conversão**

- Só de estágio aberto. `toStatus` deve ser `CLIENT_STATUS` (`PatientStatusPolicy` valida `LEAD → toStatus`); `EVALUATION_SCHEDULED` como destino não é conversão (`400`).
- Transação única: `PatientsService.changeStatus(patientId, toStatus, { origin: 'LEAD_CONVERSION', reason: note?, tx })` → `PatientStatusListenerPort` do módulo (`LeadPatientStatusListener`) recebe o evento e fecha o lead (`stage=CONVERTED`, `convertedAt`, `convertedToStatus`, `nextFollowUpAt=null`) → `LeadActivity CONVERSION`. Se a conversão for iniciada pela tela do paciente (CLI-17 `POST /patients/:id/status`), o **mesmo listener** fecha o lead — não há dois caminhos.
- Sem recadastro: nenhum campo do paciente é copiado; a UI abre o Patient 360 do mesmo `patientId` após converter.

**Não conversão / reabertura**

- `lose` exige `lostReason`; `HEALTH` sem detalhe clínico (UI orienta; `lostReasonDetail` ≤ 200). `Patient.status=NOT_CONVERTED` com `reason=LEAD_LOST_REASON_LABELS_PT[lostReason]`.
- `reopen` só de `NOT_CONVERTED`; `NOT_CONVERTED → LEAD` é transição válida em CLI-17. `CONVERTED` nunca reabre (D17): se o cliente sair, é `INACTIVE`/`CANCELED` do paciente, não lead.

**Listener (`LeadPatientStatusListener implements PatientStatusListenerPort`)**

| Evento `Patient.status` | Efeito no `Lead` (se existir) |
| --- | --- |
| `LEAD_STATUS → CLIENT_STATUS` | `stage=CONVERTED`, `convertedAt`, `convertedToStatus`; atividade `CONVERSION` (se origin ≠ `LEAD_CONVERSION`, para não duplicar) |
| `→ EVALUATION_SCHEDULED` | `stage=EVALUATION_SCHEDULED` (se aberto) |
| `EVALUATION_SCHEDULED → LEAD` | `stage=INTERESTED` (se estava `EVALUATION_SCHEDULED`) |
| `→ NOT_CONVERTED` (pela tela do paciente) | `stage=NOT_CONVERTED`, `lostReason=OTHER`, `lostReasonDetail=reason` do histórico |
| `NOT_CONVERTED → LEAD` | `stage=CONTACTED`, `reopenedCount++` |

Idempotente: se o lead já está no estágio-alvo, não faz nada.

### 5.5 Funil

- Contagem por `stage` de leads com `firstContactAt` no período; `conversionRate = CONVERTED / (total − abertos)` (só fechados) e `CONVERTED / total` (bruta) — ambas retornadas com nome explícito.
- `avgDaysToConvert = avg(convertedAt − firstContactAt)`.
- `lostReasons` agregados. Filtros `serviceType`, `source` (do `Patient`).
- Uma query agregada por chamada (`groupBy`), sem N+1; limite de período 24 meses.

### 5.6 Fase 2 — LGPD (CLI-15)

- `LeadDataExporter` (`module='leads'`, `subjectTypes=['LEAD','PATIENT']`): `lead` + `activities` (conteúdo incluído — é dado do titular).
- `LeadDataAnonymizer` (`category=LEAD`, retenção 2 anos): apaga `content`, `lostReasonDetail`, `ownerMembershipId`; mantém estágios/datas para métrica agregada.
- `SubjectResolver` de `LEAD` é o de `PATIENT` (mesma tabela) — registrado em CLI-17.

### 5.7 Web

- `/app/leads`: abas "Funil" e "Follow-ups". Funil = colunas roláveis horizontalmente (mobile) com contagem no cabeçalho e `LeadCard` (nome, serviço, origem, dias desde o 1.º contato, próximo follow-up com destaque se vencido, responsável). Arrastar entre colunas no desktop; no mobile, menu no card. Colunas `CONVERTED`/`NOT_CONVERTED` colapsadas por padrão.
- `LeadCard` ações: "Registrar contato" (tipo + observação + próximo follow-up), "Avaliação agendada", "Converter" (escolhe status destino; abre o 360 ao concluir), "Não convertido" (motivo), "WhatsApp" (`wa.me`, só com `clients:write`).
- "Follow-ups": listas Vencidos / Hoje / Esta semana, filtro "meus".
- `/app/leads/novo`: reutiliza `PatientForm` (CLI-17) em modo compacto (nome, telefone, serviço de interesse, origem, primeiro contato, observação, follow-up); aviso de duplicidade oferece "abrir cadastro existente" → se o existente está em `LEAD` sem lead, cria o lead para ele.
- Badge de follow-ups vencidos na navegação (`GET /leads/follow-ups?due=overdue&limit=1` + `total`).

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Lead de outro tenant | Extension em `Lead`/`LeadActivity`; `404`; teste com id de `studio-b` |
| Anexar lead a `patientId` de outro tenant | Extension no `findFirst` do paciente → `404`; teste |
| `ownerMembershipId` de outro tenant | Validação explícita de membership ativa no tenant → `404` |
| PROFESSIONAL escrevendo em lead (D15) | `leads:write` ausente → `403`; teste por papel |
| Conversão sem `clients:write` | Rota exige ambas as permissões; `PatientsService` reasserta |
| Dado clínico em `content`/`lostReasonDetail` | Aviso na UI; `HEALTH` sem campo clínico; nunca em `metadata` de auditoria; exportação LGPD inclui como dado do titular |
| Divergência `Patient.status` × `Lead.stage` | Único listener transacional; teste nos dois sentidos (pela tela do lead e pela do paciente) |
| Enumeração de leads via funil | Só agregados; sem ids |
| PII em listagens | `LeadListItemView` só com máscaras; `whatsappHref` só no detalhe com `clients:write` |

## 7. Observabilidade

- Logs: `lead.created`, `lead.converted{toStatus,daysToConvert}`, `lead.lost{lostReason}`, `lead.follow_up.overdue_count` (gauge diário por tenant — follow-up de Sprint 6/automação).
- Métrica do piloto: taxa de conversão e tempo médio por tenant (só agregados).

## 8. Testes

### Unit

- `LeadStagePolicy`: transições entre abertos, fechados imutáveis, mapeamento stage ↔ status, `toStatus` default por serviço, `EVALUATION_SCHEDULED` como destino de conversão → erro.
- `LeadPatientStatusListener`: tabela §5.4 completa, idempotência, não duplicar `CONVERSION` quando origin = `LEAD_CONVERSION`.
- `FunnelService`: taxas com zero fechados, período vazio, `avgDaysToConvert`.
- Auto-avanço `NEW → CONTACTED` ao registrar contato; `autoAdvance=false`.
- Follow-up vencido: limites de `now`, fuso do tenant para "hoje"/"semana".

### Integração (`leads.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| RECEPTION A `POST /leads` com pessoa nova | `201`; `Patient.status=LEAD`; `Lead.stage=NEW`; 1 atividade; `AuditLog lead.created` + `patient.created{origin=MANUAL}` sem PII em claro |
| `POST /leads` com CPF já existente em A | `409 PATIENT_DUPLICATE_CPF` com `existingPatientId` |
| `POST /leads { patientId }` de paciente `ACTIVE` | `409` |
| `POST /leads { patientId }` de paciente de B | `404` |
| PROFESSIONAL A `POST /leads/:id/activities` | `403`; `GET /leads` → `200` |
| Registrar `WHATSAPP` em lead `NEW` | `stage=CONTACTED`; atividade `WHATSAPP` + `STAGE_CHANGE`; `nextFollowUpAt=null` |
| `POST /stage EVALUATION_SCHEDULED` | `Patient.status=EVALUATION_SCHEDULED`; histórico `origin=SYSTEM` |
| `POST /convert` (Pilates, sem `toStatus`) | `Patient.status=ACTIVE`; `Lead.stage=CONVERTED`; atividades preservadas (+1 `CONVERSION`); `PatientStatusHistory origin=LEAD_CONVERSION`; `AuditLog lead.converted{toPatientStatus}` |
| `POST /convert` de novo | `409` |
| `POST /patients/:id/status ACTIVE` direto (CLI-17) em lead aberto | Lead fecha `CONVERTED` via listener; exatamente 1 `CONVERSION` |
| `POST /lose { HEALTH }` | `Patient.status=NOT_CONVERTED`; `reason` = rótulo; `nextFollowUpAt=null` |
| `POST /reopen` | `stage=CONTACTED`; `Patient.status=LEAD`; `reopenedCount=1` |
| `POST /reopen` em `CONVERTED` | `409` |
| `GET /leads/follow-ups?due=overdue` com fixtures (um vencido, um hoje, um convertido vencido) | Só o vencido aberto |
| `GET /leads/funnel` em A | Contagens batem com fixtures; nenhum lead de B |
| `GET /leads/:idDeB` em A | `404` |

### E2E

```gherkin
Funcionalidade: CRM de leads
  Cenário: lead vira cliente sem recadastro
    Dada uma RECEPTION autenticada em "studio-a"
    Quando cadastra o lead "Paciente A9" com telefone sintético e interesse em Pilates
    E registra um contato por WhatsApp
    E marca "Avaliação agendada"
    E converte o lead
    Então é levada ao Patient 360 de "Paciente A9" com status "Ativo"
    E o histórico mostra o contato, a avaliação e a conversão

  Cenário: follow-up vencido aparece na lista
    Dado um lead com follow-up marcado para ontem
    Quando a RECEPTION abre "Follow-ups"
    Então vê o lead em "Vencidos"

  Cenário: profissional só visualiza
    Dada uma PROFESSIONAL autenticada
    Quando abre o funil
    Então vê os leads sem ações de edição

  Cenário: isolamento entre tenants
    Dado um lead L em "studio-b"
    Quando um usuário de "studio-a" acessa a URL de L
    Então vê "Lead não encontrado"
```

## 9. Plano de execução

1. [ ] Branch `feat/CLI-18-leads-crm` após merge de CLI-17. Confirmar D15, D20.
2. [ ] `packages/types/src/leads.ts` (enums, labels, views); `leads:read`/`leads:write` no catálogo + matriz + teste; ações de auditoria + allowlists + labels.
3. [ ] Schema §4 + migration (trigger append-only em `LeadActivity`); `TENANT_OWNED_MODELS`.
4. [ ] `LeadsModule`: repository, policy, listener (registrado em `onModuleInit`), service, funnel, mapper, controller, DTOs.
5. [ ] Providers para CLI-19 (`leadStage`, `followUpOverdue`) e seção/timeline para CLI-20 — entregues como classes registráveis; ativados quando os cards mergearem.
6. [ ] `SENSITIVE_MODULES += 'leads'`.
7. [ ] Fixtures: 3 leads em A (um vencido, um para hoje, um convertido), 1 em B.
8. [ ] Web: BFF, funil, follow-ups, novo lead, ações; badge.
9. [ ] Testes §8.
10. [ ] Fase 2 (CLI-15/16): exporter/anonymizer, FK `interestServiceId`.
11. [ ] Docs: `docs/leads-crm.md` (funil, mapeamento stage ↔ status, listener, métricas).
12. [ ] Validação mandatória.
13. [ ] PR `CLI-18 — CRM de leads e funil de conversão`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Um único caminho de sincronização `Patient.status ↔ Lead.stage` (listener), provado nos dois sentidos.
- [ ] Conversão nunca copia dados nem cria novo paciente.
- [ ] Nenhum texto livre em `metadata` de auditoria.
- [ ] Funil e follow-ups sem vazamento cross-tenant.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| Não-P0 (discovery: CRM pós-piloto) | Pode ser adiado; CLI-20 trata a seção `lead` como `UNAVAILABLE` até o merge |
| Estágios fixos (D20) | Simples para o piloto; configurável é pós-piloto |
| Um lead por pessoa | Reabertura reutiliza; se o studio precisar de "novo ciclo comercial" para ex-aluno, é evolução do paciente, não lead |
| Auto-avanço `NEW → CONTACTED` | Pode surpreender; flag `autoAdvance` e texto na UI |
| `HEALTH` como motivo de perda | Sem campo clínico; a UI não pede detalhe para este motivo |
| Follow-up sem notificação push | Só lista/badge no P0; automação na Sprint 6 |
