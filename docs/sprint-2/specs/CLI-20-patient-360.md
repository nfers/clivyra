# Spec — CLI-20 Tela Patient 360 e ficha rápida

| Campo | Valor |
| --- | --- |
| Linear | [CLI-20](https://linear.app/clivyra/issue/CLI-20/sprint-2-tela-patient-360-e-ficha-rapida) — Urgent — Backlog |
| Pai | CLI-67 |
| Branch | `feat/CLI-20-patient-360` (a partir de `master` após merge de CLI-19 e CLI-18) |
| Depende de | CLI-17 (`Patient`, histórico de status, `whatsappHref`), CLI-19 (navegação até o paciente), CLI-18 (seção `lead`, atividades), CLI-14 (`AuditLog` como fonte da timeline), CLI-13 (permissões por módulo) |
| Bloqueia | CLI-50, CLI-51; Sprints 3–5 registram seções neste contrato |
| Decisões em aberto | D14 (auditar abertura do 360) |

## 1. Objetivo

Dar ao studio uma visão consolidada da relação com o paciente sem navegar por várias telas: cabeçalho com identidade e status, **ficha rápida** (serviço/plano/frequência, vencimento, última e próxima sessão, presença, situação financeira) e abas (Resumo, Cadastro, Agenda, Financeiro, Anamnese, Avaliação, Evolução, Plano terapêutico, Documentos, Histórico) — mobile-first, com cada dado respeitando a permissão do módulo dono e um histórico cronológico único.

Nesta sprint só existem cadastro, status e lead. A spec entrega essas seções **prontas** e define o **contrato** (`PatientSummarySectionPort`, `PatientTimelineSourcePort`) pelo qual agenda (Sprint 3), planos/financeiro (Sprint 4) e clínico (Sprint 5) plugam suas seções sem alterar esta tela — decisão do PO: abas futuras aparecem com estado vazio "disponível na Sprint X".

## 2. Escopo

### Dentro

- `GET /patients/:id/summary`: cabeçalho, ficha rápida e seções, filtradas pela permissão do ator; seções de módulos ausentes vêm como `UNAVAILABLE` com sprint prevista; seções sem permissão são **omitidas**.
- `GET /patients/:id/timeline`: histórico cronológico unificado (status, atividades de lead, auditoria relevante do paciente), paginado, filtrável por tipo.
- Contrato `PatientSummarySectionPort` (dados da seção + campos da ficha rápida que o módulo alimenta) e `PatientTimelineSourcePort`.
- Implementações desta sprint: `registration` (CLI-17), `lead` (CLI-18), `history` (esta spec).
- Ficha rápida com campos tipados como `QuickCardField<T> = { state: 'READY' | 'UNAVAILABLE'; value: T | null; plannedSprint? }`.
- Ações rápidas: WhatsApp (`wa.me`), editar cadastro, trocar status, registrar contato (lead); agenda/financeiro/prontuário/avaliação desabilitadas com dica até existirem.
- Web `/app/pacientes/[id]` mobile-first com abas roláveis, deep link por aba (`?tab=`), estados vazios e de erro.
- Registro do agregador em `docs/patient-360.md` como contrato para as próximas sprints.

### Fora

- Implementação de qualquer seção de agenda, financeiro ou clínica.
- Edição inline (a aba Cadastro reutiliza o formulário de CLI-17 em modo leitura + botão "Editar").
- Impressão/exportação da ficha (LGPD export é CLI-15; PDF é pós-sprint).
- Comentários/anotações livres na ficha (usar `notes` do cadastro ou atividade de lead).
- Envio de mensagem pelo sistema (só abre o WhatsApp do dispositivo).
- Auditoria de visualização do 360 (D14 — não no P0; ver §6).

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Resumo carrega informações essenciais sem navegar por várias telas | Uma chamada `GET /summary` devolve cabeçalho + ficha rápida + `registration` + `lead` + últimos 10 itens de `history`; aba Resumo renderiza sem chamadas adicionais; E2E confere presença dos blocos |
| Layout é mobile-first | Cabeçalho fixo compacto, ficha rápida em grade 2 colunas, abas roláveis horizontalmente com a ativa visível, ações rápidas em barra inferior; E2E em `Pixel 7` sem scroll horizontal da página |
| Dados exibidos respeitam permissões por módulo | Seções filtradas no **servidor** por `requiredPermission`; RECEPTION não recebe `finance`/clínicas nem seus campos na ficha rápida (`state: 'FORBIDDEN'` **não existe** — a seção é omitida e o campo vem `UNAVAILABLE` sem `plannedSprint`); teste por papel; UI não renderiza aba sem seção |
| Histórico é cronológico | `timeline` ordenada por `occurredAt desc` com cursor keyset `(occurredAt, id)`; fontes mescladas no servidor; integração verifica ordem com eventos de três fontes |
| (CLI-67) Ficha rápida não expõe dados de outro tenant | `GET /summary` com id de `studio-b` → `404`; seções nunca consultam fora do tenant do contexto (o port recebe `ctx`) |
| (CLI-50) Abertura da ficha rápida/Patient 360 | E2E: busca → toque → 360 com nome, status e ficha rápida |

## 4. Modelo de dados

Sem tabelas novas. Lê `Patient`, `PatientStatusHistory` (CLI-17), `Lead`, `LeadActivity` (CLI-18), `AuditLog` (CLI-14, filtrado por `entityType='Patient'` e `entityId`). Índices já existentes cobrem as consultas (`[tenantId, patientId, occurredAt desc]`, `[tenantId, entityType, entityId, occurredAt desc]`).

## 5. Design

### 5.1 Módulos e arquivos

```text
packages/types/src/patient-360.ts
  PatientSummaryView, PatientHeaderView, QuickCardView, QuickCardField, PatientSectionKey, PatientSectionView,
  PATIENT_SECTIONS (ordem, label pt-BR, módulo, permissão, plannedSprint), TimelineItemView, TimelineItemType

apps/api/src/patients/summary/
  patient-summary.controller.ts        # GET /patients/:id/summary, GET /patients/:id/timeline
  patient-summary.service.ts           # carrega paciente (404), resolve seções permitidas, executa em paralelo, monta ficha rápida
  patient-section.registry.ts          # PatientSummarySectionPort + registro + catálogo com disponibilidade
  patient-timeline.service.ts          # PatientTimelineSourcePort + merge keyset
  sections/registration.section.ts     # CLI-17 (dados cadastrais, status, transições disponíveis)
  sections/history.section.ts          # últimos 10 itens da timeline
  timeline/status-history.source.ts    # PatientStatusHistory
  timeline/audit.source.ts             # AuditLog do paciente (ações allowlisted)
  quick-card/quick-card.assembler.ts   # combina contribuições dos módulos em QuickCardView

apps/api/src/leads/summary/lead-summary.section.ts, lead-timeline.source.ts   # CLI-18 (já previstos lá)

apps/web/app/(app)/app/pacientes/[id]/page.tsx        # server component: summary + tab
apps/web/components/patient-360/patient-header.tsx
apps/web/components/patient-360/quick-card.tsx
apps/web/components/patient-360/section-tabs.tsx
apps/web/components/patient-360/quick-actions-bar.tsx
apps/web/components/patient-360/sections/{resumo,cadastro,historico,lead,unavailable}.tsx
apps/web/components/patient-360/timeline.tsx
apps/web/app/api/patients/[id]/summary/route.ts, timeline/route.ts
```

### 5.2 Permissões

| Rota / seção | Permissão |
| --- | --- |
| `GET /patients/:id/summary`, `GET /patients/:id/timeline` | `clients:read` (mínimo; devolve o que o papel puder ver) |
| Seção `registration`, `history` (itens de status e cadastro) | `clients:read` |
| Seção `lead`, itens de timeline de lead | `leads:read` |
| Seções `agenda` | `agenda:read` (Sprint 3) |
| Seção `finance` | `finance:read` (Sprint 4) |
| Seções `anamnesis`, `evaluation`, `evolution`, `therapeutic-plan`, `documents` | `clinical-record:read` (Sprint 5); itens clínicos na timeline idem |
| Ação rápida WhatsApp (`whatsappHref`) | `clients:write` (CLI-17) |

### 5.3 Contratos

```ts
export type PatientSectionKey =
  | 'summary' | 'registration' | 'agenda' | 'finance' | 'anamnesis' | 'evaluation'
  | 'evolution' | 'therapeutic-plan' | 'documents' | 'history' | 'lead'

export const PATIENT_SECTIONS: readonly {
  key: PatientSectionKey; label: string; module: 'patients' | 'leads' | 'agenda' | 'finance' | 'clinical'
  requiredPermission: Permission | null; plannedSprint?: 'Sprint 3' | 'Sprint 4' | 'Sprint 5'; order: number
}[]
// 'summary' é composição client-side; 'lead' aparece como bloco do Resumo e aba só quando isLead ou houver lead histórico

export interface PatientSectionView<T = unknown> {
  key: PatientSectionKey
  state: 'READY' | 'UNAVAILABLE' | 'EMPTY' | 'ERROR'
  plannedSprint?: string          // em UNAVAILABLE
  data?: T                        // em READY
  errorCode?: string              // em ERROR (nunca mensagem interna)
}

export interface QuickCardField<T> { state: 'READY' | 'UNAVAILABLE'; value: T | null; plannedSprint?: string }

export interface QuickCardView {
  serviceType: QuickCardField<ServiceType>                 // patients
  status: QuickCardField<PatientStatus>                    // patients
  plan: QuickCardField<{ name: string; frequencyPerWeek: number | null }>   // finance (Sprint 4)
  planExpiresAt: QuickCardField<string>                    // finance (Sprint 4)
  lastSessionAt: QuickCardField<string>                    // agenda (Sprint 3)
  nextSessionAt: QuickCardField<string>                    // agenda (Sprint 3)
  attendance: QuickCardField<{ present: number; total: number; ratePct: number }>   // agenda (Sprint 3)
  financialStatus: QuickCardField<'OK' | 'PENDING' | 'OVERDUE'>                     // finance (Sprint 4)
  lead: QuickCardField<{ stage: LeadStage; nextFollowUpAt: string | null; overdue: boolean }>   // leads
}

export interface PatientSummaryView {
  header: PatientHeaderView          // id, displayName, age, status, serviceType, phoneMasked, whatsappHref?, availableTransitions, isLead, archivedAt
  quickCard: QuickCardView
  sections: PatientSectionView[]     // só as permitidas; UNAVAILABLE para módulos futuros
  quickActions: { key: 'whatsapp' | 'edit' | 'status' | 'lead-contact' | 'schedule' | 'finance' | 'clinical' | 'evaluation'; enabled: boolean; reason?: 'UNAVAILABLE' | 'FORBIDDEN' | 'NO_PHONE' }[]
}

export interface TimelineItemView {
  id: string                          // `${source}:${id}`
  occurredAt: string
  type: TimelineItemType              // 'STATUS_CHANGED' | 'CREATED' | 'UPDATED' | 'ARCHIVED' | 'RESTORED' | 'LEAD_ACTIVITY' | 'LEAD_STAGE' | 'LEAD_CONVERTED' | 'LEAD_LOST' | 'CONSENT' | 'IMPORTED' | (futuros: 'APPOINTMENT' | 'PAYMENT' | 'CLINICAL_NOTE' ...)
  title: string                       // pt-BR, sem PII além do necessário
  description?: string                // conteúdo de atividade de lead (dado do titular, permitido); nunca `changes` com campos sensíveis em claro
  actor?: { userId: string | null; name: string | null }
  source: 'patients' | 'leads' | 'audit' | 'agenda' | 'finance' | 'clinical'
  link?: { section: PatientSectionKey; id?: string }
}
```

Ports (API interna):

```ts
interface PatientSummarySectionPort<T = unknown> {
  readonly key: PatientSectionKey
  readonly requiredPermission: Permission | null
  load(ctx: TenantContext, patient: PatientCore): Promise<{ section: Omit<PatientSectionView<T>, 'key'>; quickCard?: Partial<QuickCardView> }>
}
interface PatientTimelineSourcePort {
  readonly source: TimelineItemView['source']
  readonly requiredPermission: Permission | null
  fetch(ctx: TenantContext, patientId: string, window: { before: { occurredAt: Date; id: string } | null; limit: number; types?: TimelineItemType[] }): Promise<TimelineItemView[]>
}
```

Registro em `onModuleInit` (`PatientSectionRegistry.register(section)`, `PatientTimelineRegistry.register(source)`). `PatientCore` é a entidade sem campos sensíveis (`id`, `tenantId`, `status`, `serviceType`, `birthDate`, `isLead`) — o port não recebe CPF/telefone.

### 5.4 Regras de negócio (`PatientSummaryService`, `PatientTimelineService`)

**Summary**

1. Carrega `Patient` pela extension; arquivado → `404` salvo `clients:archive` (então cabeçalho marca `archivedAt`).
2. Para cada entrada de `PATIENT_SECTIONS` (exceto `summary`):
   - sem permissão → **omite** (não entra em `sections`; campos da ficha rápida que dependem dela vêm `UNAVAILABLE` sem `plannedSprint`);
   - com permissão e sem provider registrado → `UNAVAILABLE` + `plannedSprint`;
   - com provider → `load()` em paralelo (`Promise.allSettled`, timeout 1.500 ms por seção); rejeição/timeout → `ERROR` com `errorCode='SECTION_LOAD_FAILED'` e log `error` com `requestId`; as demais seções seguem (a tela nunca cai por causa de um módulo).
3. `QuickCardAssembler` parte de todos os campos `UNAVAILABLE` (com `plannedSprint` do módulo dono, se o ator tem a permissão) e sobrescreve com as contribuições `READY` dos providers. `serviceType`/`status` sempre `READY`.
4. `quickActions`: `whatsapp` habilitado se `clients:write` e `phoneIsWhatsapp` e telefone existe (`NO_PHONE` caso contrário); `edit`/`status` se `clients:write`; `lead-contact` se `leads:write` e lead aberto; `schedule`/`finance`/`clinical`/`evaluation` `UNAVAILABLE` até o módulo registrar (registry de ações segue o mesmo padrão das seções — `QuickActionProviderPort` mínimo: `key`, `requiredPermission`, `resolve(ctx, patient) → { enabled, href? }`).
5. `history` no summary = primeiros 10 itens da timeline (mesma lógica de §"Timeline").

**Timeline**

- Fontes desta sprint: `status-history` (todas as transições, título com labels pt-BR e `reason`), `audit` (só ações allowlisted: `patient.created|updated|archived|restored|duplicate_override|cpf.revealed`, `patient.import.*` do paciente; `updated` mostra apenas **nomes** dos campos alterados, nunca valores), `leads` (atividades, estágio, conversão, perda — `content` incluído).
- Merge keyset: cada fonte recebe `before` e `limit`; o serviço mescla por `(occurredAt desc, id desc)` e devolve `limit` itens + `nextCursor` (assinado, mesmo utilitário de CLI-19). Fontes sem permissão são puladas.
- `types[]` filtra por tipo (a UI oferece "Só status", "Só contatos").
- Itens com `link` levam à aba correspondente (`?tab=lead`).

**Estados de seção na UI**

| `state` | Render |
| --- | --- |
| `READY` | conteúdo |
| `EMPTY` | "Nenhum registro ainda" + CTA do módulo (ex.: "Registrar contato") |
| `UNAVAILABLE` | ilustração + "Disponível na Sprint X" (texto configurável em `PATIENT_SECTIONS`); aba visível mas com ícone de cadeado |
| `ERROR` | "Não foi possível carregar" + botão tentar de novo (recarrega só a seção via `GET /summary?sections=finance`) |
| ausente | aba **não renderiza** |

### 5.5 Web

- Rota `/app/pacientes/[id]?tab=resumo|cadastro|agenda|financeiro|anamnese|avaliacao|evolucao|plano|documentos|historico|lead`. Server component chama `GET /summary` (via `apiFetch`) e passa para o client; `timeline` da aba Histórico é client-side com scroll infinito.
- `PatientHeader`: `displayName`, idade, `PatientStatusChip` (CLI-17, troca rápida), `serviceType`, badge lead/follow-up vencido, telefone mascarado; colapsa ao rolar.
- `QuickCard`: 2 colunas no mobile, 4 no desktop; cada `QuickCardField` renderiza valor ou "—" com tooltip "Disponível na Sprint X"; campos sem `plannedSprint` (sem permissão) simplesmente não aparecem.
- `SectionTabs`: lista horizontal rolável; aba ativa centralizada; teclado/`aria-selected`; badge de contagem quando a seção informa (`data.count`).
- `QuickActionsBar`: fixa no rodapé no mobile; ações desabilitadas mostram motivo ao tocar.
- Aba Cadastro: leitura com os mesmos grupos do formulário; botão "Editar" → `/editar`; CPF mascarado com "revelar" (CLI-17).
- Aba Lead: bloco do lead (estágio, follow-up, responsável) + atividades + ações (CLI-18 componentes).
- Aba Histórico: `Timeline` com agrupamento por dia e filtro de tipo.
- Sem cache do SW para `/api/patients/**`; `no-store`.

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| IDOR: trocar `:id` para paciente de outro tenant | Extension → `404`; providers recebem `ctx` e usam repositórios tenant-scoped; teste com id de `studio-b` |
| Seção clínica/financeira para RECEPTION | Filtro **no servidor** por `requiredPermission`; seção omitida (não vazia) para não confirmar existência; teste por papel com providers fake registrados |
| Provider de módulo devolvendo dados de outro paciente/tenant | Port recebe `PatientCore` com `tenantId`; contrato exige filtro; teste de contrato genérico (`section.load` com paciente de B via ctx de A → vazio/erro) executado contra cada provider registrado |
| Vazamento por timeline de auditoria | Só ações allowlisted; `updated` sem valores; `changes` nunca devolvidos ao 360 (só em `/audit-logs` com `audit:read`) |
| `whatsappHref` com telefone completo | Só com `clients:write`; nunca em listagens; link abre app externo (sem dados além do número) |
| Uma seção lenta derrubar a tela | `allSettled` + timeout por seção; `ERROR` isolado |
| Erros internos vazando | `errorCode` fixo; detalhe só em log com `requestId` |
| Auditoria de acesso (D14) | Não no P0 para o 360 como um todo; CPF revelado é auditado (CLI-17). Sprint 5 **deve** registrar `recordAccess('clinical-record.viewed')` quando a seção clínica for `READY` — obrigação documentada no contrato |
| PII em URL | Só `patientId` (cuid) e `tab` |

## 7. Observabilidade

- Logs: `patient.summary.loaded{sectionsReady, sectionsUnavailable, sectionsError, durationMs}`, `patient.section.failed{key, errorCode}`; sem PII.
- Métricas: p95 do summary; contagem de `sectionsError` por `key` (saúde dos módulos); cliques em ações `UNAVAILABLE` (demanda — evento web anônimo por tenant).

## 8. Testes

### Unit

- `PatientSectionRegistry`: omissão por permissão, `UNAVAILABLE` com `plannedSprint`, provider registrado → `READY`, duplicidade de `key` → erro no boot.
- `PatientSummaryService`: `allSettled` com um provider lançando/timeout → `ERROR` isolado; ordem das seções por `order`.
- `QuickCardAssembler`: defaults `UNAVAILABLE`, sobrescrita por provider, campo sem permissão sem `plannedSprint`.
- `PatientTimelineService`: merge de 3 fontes com timestamps intercalados e iguais (desempate por `id`), cursor round-trip, fonte sem permissão ignorada, `types[]`.
- `audit.source`: só ações allowlisted; `updated` sem valores.
- `quickActions`: matriz permissão × estado do paciente × telefone.

### Integração (`patient-360.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| OWNER A `GET /summary` de A3 (ativo, ex-lead convertido) | `header` correto; `quickCard.serviceType/status READY`; `plan/lastSessionAt/... UNAVAILABLE` com `plannedSprint`; `sections`: `registration READY`, `lead READY`, `history READY`(≥ 3 itens), `agenda/finance/anamnesis/... UNAVAILABLE` |
| RECEPTION A mesma chamada | sem seções `finance`/clínicas; `quickCard.financialStatus.state=UNAVAILABLE` **sem** `plannedSprint`; `lead READY` |
| Usuário sem `leads:read` (probe de matriz) | sem seção `lead`; timeline sem itens de lead |
| `GET /summary` de paciente de B | `404` |
| Paciente arquivado como PROFESSIONAL | `404`; como OWNER → `200` com `archivedAt` |
| Provider fake registrado no teste que lança | seção `ERROR`; demais `READY`; `200` |
| Provider fake que ignora `ctx` (retorna dados de B) | teste de contrato falha (garante que o teste de contrato roda para providers reais) |
| `GET /timeline?limit=5` com 12 eventos de 3 fontes | ordem decrescente; 3 páginas; sem duplicatas |
| `GET /timeline?types[]=STATUS_CHANGED` | só transições |
| Item `UPDATED` na timeline | `description` lista campos (`"Telefone, E-mail"`), nunca valores |
| `whatsappHref` como RECEPTION (`clients:write`) | presente; após retirar `clients:write` via probe → ausente e ação `FORBIDDEN` |

### E2E

```gherkin
Funcionalidade: Patient 360
  Cenário: abrir a ficha a partir da busca
    Dada uma RECEPTION autenticada em viewport mobile
    Quando busca "Paciente A3" e toca no resultado
    Então vê o cabeçalho com nome, idade e status "Ativo"
    E a ficha rápida mostra "Pilates" e campos "Disponível na Sprint 3/4" para sessão e plano
    E a aba Resumo mostra o bloco de cadastro e os últimos eventos

  Cenário: abas futuras com estado vazio
    Quando toca na aba "Financeiro"
    Então vê "Disponível na Sprint 4"

  Cenário: recepção não vê abas clínicas
    Dada uma RECEPTION autenticada
    Quando abre a ficha de um paciente
    Então não vê as abas Anamnese, Avaliação, Evolução, Plano terapêutico nem Documentos

  Cenário: histórico cronológico
    Dado um paciente com conversão de lead e duas trocas de status
    Quando abre a aba Histórico
    Então vê os eventos do mais recente ao mais antigo com data e autor

  Cenário: isolamento entre tenants
    Dado um paciente P em "studio-b"
    Quando um usuário de "studio-a" acessa /app/pacientes/<id de P>
    Então vê "Paciente não encontrado"
```

Artefatos: screenshots sem CPF revelado; `notes`/atividades com texto sintético.

## 9. Plano de execução

1. [ ] Branch `feat/CLI-20-patient-360` após merge de CLI-19 e CLI-18 (se CLI-18 atrasar, seguir sem a seção `lead`, que fica `UNAVAILABLE` até o merge). Confirmar D14.
2. [ ] `packages/types/src/patient-360.ts` (`PATIENT_SECTIONS` com labels, ordem, permissões, sprints; views; tipos de timeline).
3. [ ] `PatientSectionRegistry`, `PatientTimelineRegistry`, `QuickCardAssembler`, `QuickActionRegistry`; teste de contrato genérico para providers.
4. [ ] Seções/fontes desta sprint: `registration`, `history`, `status-history`, `audit`; ativar `lead` de CLI-18.
5. [ ] `PatientSummaryService` (paralelismo, timeout, omissão por permissão), `PatientTimelineService` (merge keyset, cursor assinado), controller.
6. [ ] Web: página, header, quick card, tabs, ações, seções (`resumo`, `cadastro`, `historico`, `lead`, `unavailable`), timeline; BFF; deep link `?tab`.
7. [ ] Fixtures: paciente A3 com histórico (lead → avaliação → conversão → pausa → ativo) e atividades.
8. [ ] Testes §8.
9. [ ] Docs: `docs/patient-360.md` — **contrato para Sprints 3–5**: como registrar seção/fonte/ação, permissões, obrigação de `recordAccess` para seções clínicas, exemplos de `QuickCardField`.
10. [ ] Validação mandatória.
11. [ ] PR `CLI-20 — Tela Patient 360 e ficha rápida`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Seções filtradas no servidor; nenhuma seção sem permissão na resposta; teste por papel.
- [ ] Falha de um provider não derruba o summary.
- [ ] Timeline cronológica com cursor assinado; auditoria sem valores de campos.
- [ ] `PATIENT_SECTIONS` cobre as 10 abas do card com `plannedSprint` nas futuras.
- [ ] `docs/patient-360.md` publicado como contrato para agenda/financeiro/clínico.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| Expectativa gerada por abas vazias | Texto explícito "Disponível na Sprint X"; PO aprovou o formato |
| Latência com muitos providers (Sprints 3–5) | Paralelismo + timeout por seção; `?sections=` para recarregar uma só; considerar cache curto por paciente depois |
| Seção `lead` sem CLI-18 mergeado | `UNAVAILABLE` sem quebrar; ativação é só registro |
| D14 (auditar visualização) | Não no P0; obrigação de `clinical-record.viewed` na Sprint 5 documentada |
| Timeline misturar auditoria técnica com eventos de negócio | Allowlist de ações e títulos pt-BR; `changes` fora |
| Cursor de merge com fontes heterogêneas | Keyset `(occurredAt, id)` por fonte; fontes futuras devem respeitar o contrato `fetch(before, limit)` |
