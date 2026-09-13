# Spec — CLI-19 Busca inteligente e filtros de pacientes

| Campo | Valor |
| --- | --- |
| Linear | [CLI-19](https://linear.app/clivyra/issue/CLI-19/sprint-2-busca-inteligente-e-filtros-de-pacientes) — High — Backlog |
| Pai | CLI-67 |
| Branch | `feat/CLI-19-patient-search` (a partir de `master` após merge de CLI-17; paralelo a CLI-18) |
| Depende de | CLI-17 (`Patient`, `nameNormalized`, extensões `unaccent`/`pg_trgm`, normalizadores), CLI-13 (`clients:read`) |
| Bloqueia | CLI-20 (navegação até o paciente), CLI-50; Sprints 3/4 registram filtros neste contrato |
| Decisões em aberto | D19 (`pg_trgm` vs. `ILIKE`) |

## 1. Objetivo

Localizar pessoas em poucos passos no celular — por nome (com acento/erro de digitação), CPF, telefone/WhatsApp ou data de nascimento — e montar listas operacionais com filtros combináveis (ativos/inativos, leads, Pilates/Fisioterapia/Terapias, aniversariantes e, quando os módulos existirem, inadimplentes, planos vencendo, sem atendimento, sem renovação), respeitando tenant e RBAC, com paginação e ordenação.

## 2. Escopo

### Dentro

- `GET /patients/search` com classificação automática do termo (`q`) e filtros combináveis (AND entre filtros, OR dentro de listas).
- Catálogo de filtros (`GET /patients/filters`) com **disponibilidade declarada**: filtros desta sprint prontos; filtros de Sprints 3/4 definidos no contrato e recusados com `400 FILTER_NOT_AVAILABLE` até o módulo dono registrar seu provider.
- `PatientFilterProviderPort` — registro por módulo (CLI-18 registra `leadStage`/`followUpOverdue`; agenda/financeiro registram os deles).
- Índice GIN trigram em `nameNormalized`; busca por dígitos em `cpf`/`phone`; por `birthDate`.
- Ordenação (`relevance`, `name`, `recentlyUpdated`, `birthday`, `statusChangedAt`) e paginação por cursor.
- Web: barra de busca fixa, chips de filtro, resultados em cards, scroll infinito; filtros indisponíveis visíveis mas desabilitados.
- Salvamento local (por dispositivo) das últimas buscas/filtros — sem persistência no servidor.

### Fora

- Implementação dos filtros `overdue`, `planExpiring`, `noAttendance`, `noRenewal`, `planId` (Sprints 3/4 — só o contrato).
- Busca global (agenda, financeiro, documentos) — só pacientes/leads.
- Busca por campos clínicos.
- Exportação da lista (CSV) — pós-sprint; `csvSafeCell()` já existe para quando vier.
- Listas salvas/compartilhadas no servidor.
- Full-text search com ranking linguístico (`tsvector`) — trigram basta para nomes.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Busca retorna em poucos passos no mobile | Barra de busca na primeira tela de `/app/pacientes`; resultado ao digitar ≥ 2 caracteres (debounce 300 ms); tocar no card abre o 360; E2E mobile mede ≤ 3 interações |
| Filtros podem ser combinados | `status[]=ACTIVE&serviceType[]=PILATES&birthdayMonth=9` → AND; integração com fixtures que só satisfazem a interseção |
| Resultados respeitam tenant e RBAC | Extension de tenant; `clients:read` obrigatório; `leadStage`/`followUpOverdue` exigem também `leads:read` (`403` sem ela); nenhum campo sensível em claro; teste cross-tenant e por papel |
| Paginação e ordenação suportadas | Cursor opaco estável por `(sortKey, id)`; `limit ≤ 100`; integração percorre 3 páginas sem duplicar/pular; ordenações validadas |
| (CLI-67) Busca não expõe dados de outro tenant | Busca por CPF de paciente de `studio-b` autenticado em `studio-a` → lista vazia |

## 4. Modelo de dados

Sem tabelas novas. Usa `Patient` (CLI-17) e, via providers, `Lead` (CLI-18).

Índices (CLI-17 já cria; esta spec os exige):

```sql
-- nome com acento/erro de digitação
CREATE INDEX "Patient_tenantId_nameNormalized_trgm_idx" ON "Patient" USING GIN ("nameNormalized" gin_trgm_ops);
-- igualdade/prefixo por dígitos
CREATE INDEX "Patient_tenantId_cpf_idx"   ON "Patient" ("tenantId", "cpf")   WHERE "cpf" IS NOT NULL;
CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient" ("tenantId", "phone") WHERE "phone" IS NOT NULL;
-- aniversariantes: mês/dia independentes do ano
CREATE INDEX "Patient_tenantId_birthday_idx" ON "Patient" ("tenantId", (EXTRACT(MONTH FROM "birthDate")), (EXTRACT(DAY FROM "birthDate")));
```

Fallback D19: se `search.trgm=false` em `SystemMetadata`, o índice GIN não existe e a busca por nome usa `nameNormalized ILIKE '%termo%'` (índice btree ajuda só prefixo); funcional, mais lento em bases grandes — aceitável no piloto.

## 5. Design

### 5.1 Módulos e arquivos

```text
packages/types/src/patient-search.ts   # PatientSearchQuery, PatientSearchResultView, PatientFilterDescriptor, PATIENT_FILTERS, SORT_OPTIONS

apps/api/src/patients/search/
  patient-search.controller.ts         # GET /patients/search, GET /patients/filters
  patient-search.service.ts            # orquestra: classifica q, resolve filtros, monta where, pagina
  query-classifier.ts                  # q → { kind: 'NAME'|'DIGITS'|'DATE', normalized }
  patient-filter.registry.ts           # PatientFilterProviderPort + registro + disponibilidade
  providers/core-filters.provider.ts   # status, serviceType, isLead, activity, birthdayMonth, birthdayRange, source, createdAfter, includeArchived
  cursor.ts                            # encode/decode base64url de { sortValue, id }
  patient-search.repository.ts         # única camada com SQL (Prisma + $queryRaw parametrizado para trgm)

apps/web/app/(app)/app/pacientes/page.tsx        # substitui a lista de CLI-17 (mesma rota)
apps/web/components/patients/search-bar.tsx
apps/web/components/patients/filter-chips.tsx    # lê /patients/filters; desabilita indisponíveis
apps/web/components/patients/patient-result-card.tsx
apps/web/lib/patients/recent-searches.ts         # localStorage por tenant (sem PII além do termo digitado)
apps/web/app/api/patients/search/route.ts, filters/route.ts
```

### 5.2 Permissões

| Rota | Permissão |
| --- | --- |
| `GET /patients/search` | `clients:read`; filtros de lead exigem também `leads:read`; filtros financeiros exigirão `finance:read` (declarado no descriptor) |
| `GET /patients/filters` | `clients:read` (retorna só filtros cuja permissão o ator tem, com `available` por módulo) |

### 5.3 Contrato de busca

```ts
export interface PatientSearchQuery {
  q?: string                         // ≥ PATIENT_SEARCH_MIN_QUERY_LENGTH (2); ≤ 80
  status?: PatientStatus[]
  serviceType?: ServiceType[]
  isLead?: boolean                   // status ∈ LEAD_STATUSES
  activity?: 'active' | 'inactive'   // atalho: active = IN_TREATMENT|ACTIVE|EVALUATION_SCHEDULED|PAUSED; inactive = INACTIVE|DISCHARGED|CANCELED|FORMER_STUDENT|NOT_CONVERTED
  birthdayMonth?: number             // 1..12 (aniversariantes do mês)
  birthdayRange?: { from: 'MM-DD'; to: 'MM-DD' }  // ex.: próximos 7 dias (cruza ano)
  source?: PatientSource[]
  createdAfter?: string              // ISO date
  includeArchived?: boolean          // exige clients:archive
  // CLI-18
  leadStage?: LeadStage[]
  followUpOverdue?: boolean
  // Sprint 3 (agenda)
  noAttendanceDays?: number          // sem sessão realizada há N dias
  // Sprint 4 (planos/financeiro)
  planId?: string
  planExpiringDays?: number          // plano vence em ≤ N dias
  noRenewal?: boolean                // plano vencido sem renovação
  overdue?: boolean                  // inadimplente
  sort?: 'relevance' | 'name' | 'recentlyUpdated' | 'birthday' | 'statusChangedAt'
  order?: 'asc' | 'desc'
  cursor?: string
  limit?: number                     // default 20, máx. 100
}

export interface PatientSearchResultView {
  items: PatientListItemView[]       // CLI-17: displayName, age, status, serviceType, phoneMasked, cpfMasked, isLead, updatedAt
  nextCursor: string | null
  appliedFilters: string[]           // chaves efetivamente aplicadas
  matchedBy?: 'NAME' | 'CPF' | 'PHONE' | 'BIRTHDATE'   // como q foi interpretado
}

export interface PatientFilterDescriptor {
  key: string
  label: string                      // pt-BR
  type: 'enum' | 'boolean' | 'number' | 'month' | 'dateRange' | 'id'
  options?: { value: string; label: string }[]
  module: 'patients' | 'leads' | 'agenda' | 'finance'
  requiredPermission: Permission
  available: boolean                 // provider registrado
  plannedSprint?: 'Sprint 3' | 'Sprint 4'
}
```

### 5.4 Regras de negócio

**Classificação de `q` (`QueryClassifier`)**

1. Remove espaços nas pontas. Se `q.length < 2` → `400 SEARCH_QUERY_TOO_SHORT` (a UI nem chama).
2. `DATE`: casa `dd/mm/yyyy`, `dd/mm/yy`, `yyyy-mm-dd`, `dd/mm` → `birthDate` igual (ou mês/dia quando sem ano).
3. `DIGITS`: após remover `. - ( ) + espaço`, restam só dígitos com ≥ 3 caracteres →
   - 11 dígitos com DV válido → CPF **igualdade** (`cpf = $1`);
   - senão telefone: normaliza para E.164 quando possível (`+55`) e busca `phone = $1 OR secondaryPhone = $1`; com < 10 dígitos, **sufixo** (`phone LIKE '%' || $1`) — as pessoas lembram o final do número;
   - se também for um CPF parcial (≥ 6 dígitos, DV não verificável), inclui `cpf LIKE $1 || '%'` (prefixo). Resultado une CPF e telefone; `matchedBy` reflete o primeiro que casou.
4. `NAME`: `normalizeName(q)`; com trgm: `nameNormalized % $1 OR nameNormalized ILIKE '%' || $1 || '%'`, ordenado por `similarity(nameNormalized, $1) DESC` quando `sort=relevance`; `pg_trgm.similarity_threshold` fixado em `0.3` por sessão (`SET LOCAL`). Sem trgm: só `ILIKE`. O mesmo predicado é aplicado a `socialNameNormalized` (coluna adicionada nesta spec, migration aditiva, mantida pela aplicação como `nameNormalized`), com OR entre os dois.
5. Termo com letras **e** dígitos (ex.: "maria 9876") → divide: parte alfabética em `NAME`, parte numérica em `DIGITS`, AND entre elas.

**Filtros (`PatientFilterRegistry`)**

- Cada `PatientFilterProviderPort` declara `key`, `descriptor` e `apply(value, ctx): Promise<Prisma.PatientWhereInput | { idIn: string[] }>`. Providers de outros módulos podem devolver `idIn` (subconsulta materializada, limitada a 10.000 ids) quando o filtro vive em outra tabela; o serviço combina com AND.
- Filtro presente na query sem provider registrado → `400 FILTER_NOT_AVAILABLE { filter, plannedSprint }`. Filtro desconhecido → `400` (DTO `forbidNonWhitelisted`).
- Filtro cuja `requiredPermission` o ator não tem → `403`.
- `includeArchived` só com `clients:archive`; default exclui arquivados.
- `activity` e `status[]` juntos: interseção (a UI evita a combinação).
- `birthdayRange` cruzando ano (`12-28 → 01-03`) tratado com OR de dois intervalos.

**Ordenação e cursor**

- `relevance` só faz sentido com `q`; sem `q` cai para `recentlyUpdated`. `name` usa `nameNormalized`; `birthday` ordena por próximo aniversário a partir de hoje (fuso do tenant); `statusChangedAt` desc.
- Cursor = `base64url(JSON{ v: sortValue, id })`, assinado com HMAC curto (`AUTH_ACCESS_TOKEN_SECRET`) para não ser forjado; inválido → `400 SEARCH_CURSOR_INVALID`. Página seguinte usa `(sortValue, id) > (v, id)` (keyset).
- `similarity` não é estável para keyset; com `sort=relevance` a paginação usa `(similarity, id)` calculado na mesma query — aceito; alternativa documentada: limitar relevância a 100 resultados sem cursor.

**Limites**

- `limit` default 20, máx. 100. `q` ≤ 80 chars. Máximo 8 filtros simultâneos. Tempo de query alvo < 200 ms para 50k pacientes por tenant (índices acima); `EXPLAIN` no teste de integração de carga leve (fixture com 2k pacientes, executada só sob flag `SEARCH_PERF=1`).

### 5.5 Web

- `/app/pacientes`: `SearchBar` fixa no topo (input com teclado padrão; ao detectar dígitos, mantém), `FilterChips` roláveis abaixo (chips ativos primeiro; chip "Mais filtros" abre bottom sheet com todos, os indisponíveis com cadeado e texto "disponível na Sprint X"). Resultados em `PatientResultCard` (nome, idade, status, serviço, telefone mascarado, badge lead/follow-up vencido). Scroll infinito com `nextCursor`. Estado vazio com CTA "Novo paciente" pré-preenchendo o nome/telefone digitado.
- Atalhos prontos (chips compostos): "Ativos", "Leads", "Aniversariantes do mês", "Pilates", "Fisioterapia", "Follow-up vencido" (só com `leads:read` e CLI-18). Futuramente: "Inadimplentes", "Planos vencendo".
- `recent-searches.ts`: guarda até 5 termos e o último conjunto de filtros em `localStorage` sob chave por `tenantId`; limpa no logout/troca de tenant; nunca guarda resultados.
- Acessibilidade: `role="search"`, resultados anunciados (`aria-live="polite"`), chips como `button[aria-pressed]`.

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Vazamento cross-tenant | Extension em `findMany`; `$queryRaw` **sempre** com `"tenantId" = $tenant` do contexto (nunca da query) e parâmetros tagged (`Prisma.sql`), nunca interpolação; teste com CPF de `studio-b` |
| SQL injection via `q` | Parâmetros; `q` sanitizado (remove `%`/`_` do usuário antes do `LIKE` e escapa); tamanho limitado |
| Enumeração de CPF/telefone (buscar dígitos para descobrir se existe) | Só autenticado com `clients:read`; resultado devolve máscaras; rate limit 120/min por usuário na rota de busca; sem distinção de erro |
| Cursor forjado para saltar filtros/tenant | Cursor assinado (HMAC) e só carrega `(sortValue, id)`; filtros sempre reaplicados a partir da query, nunca do cursor |
| Filtro de outro módulo sem permissão | `requiredPermission` por descriptor; `403`; `GET /filters` já omite |
| Arquivados visíveis | `includeArchived` exige `clients:archive` |
| PII em `localStorage` | Só termos digitados e filtros; sem resultados; limpo no logout |
| Logs com termo de busca | `q` **não** vai para logs (pode ser CPF); loga só `matchedBy`, `filters`, `resultCount`, `durationMs` |
| DoS por busca cara | Limites de `limit`, filtros e tamanho de `q`; `SET LOCAL statement_timeout = 2000` na transação da busca |

## 7. Observabilidade

- Logs: `patient.search{matchedBy, filterKeys, resultCount, durationMs, trgm: boolean}` sem `q`.
- Métricas: p95 de `durationMs` por tenant; contagem de `FILTER_NOT_AVAILABLE` por filtro (mostra demanda para Sprints 3/4).

## 8. Testes

### Unit

- `QueryClassifier`: nome com acento, CPF com/sem máscara (válido → igualdade; inválido → prefixo), telefone com DDD/9º dígito/sufixo, datas em 4 formatos, misto letras+dígitos, `q` curto.
- `cursor.ts`: round-trip, assinatura inválida, payload adulterado.
- `PatientFilterRegistry`: filtro indisponível, sem permissão, desconhecido, combinação AND, `idIn` de provider externo, limite de 8 filtros.
- `birthdayRange` cruzando ano; `activity` ↔ conjuntos de status.
- Ordenação `birthday` (próximo aniversário, ano bissexto, hoje).

### Integração (`patient-search.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| `q=jose` em A com pacientes "José", "Josefa", "Joseph" | os três; ordenados por similaridade quando `sort=relevance` |
| `q=joze` (erro de digitação) com trgm | "José" retornado; sem trgm (`search.trgm=false` simulado) → vazio, sem erro |
| `q=<CPF de A5 com máscara>` | só A5; `matchedBy=CPF` |
| `q=<CPF de paciente de B>` em A | vazio |
| `q=0005` (sufixo de telefone) | pacientes cujo telefone termina em 0005 |
| `q=15/03/1990` | pacientes nascidos nessa data |
| `status[]=ACTIVE&serviceType[]=PILATES&birthdayMonth=9` | só a interseção |
| `overdue=true` | `400 FILTER_NOT_AVAILABLE { plannedSprint: 'Sprint 4' }` |
| `leadStage[]=NEW` como PROFESSIONAL (tem `leads:read`) | `200`; como usuário sem `leads:read` (teste com matriz alterada via probe) → `403` |
| `includeArchived=true` como RECEPTION | `403`; como OWNER → inclui arquivado |
| Paginação `limit=2` em 5 resultados, `sort=name` | 3 páginas, sem repetição/omissão; cursor da última = `null` |
| Cursor adulterado | `400 SEARCH_CURSOR_INVALID` |
| `q` com `%` e `_` | tratados como literais |
| Resposta de busca | nenhum `cpf`/`phone` completo em nenhum item |
| `GET /patients/filters` como RECEPTION | sem filtros de `finance`; `overdue.available=false` |

### E2E

```gherkin
Funcionalidade: Busca e filtros de pacientes
  Cenário: encontrar paciente pelo final do telefone no celular
    Dada uma RECEPTION autenticada em viewport mobile
    Quando digita "0003" na busca de pacientes
    Então vê "Paciente A3" como resultado em até 3 interações
    E ao tocar no card abre a ficha do paciente

  Cenário: filtros combinados
    Quando seleciona os chips "Ativos" e "Pilates"
    Então vê apenas pacientes ativos de Pilates
    E o contador de resultados corresponde

  Cenário: filtro indisponível
    Quando abre "Mais filtros"
    Então vê "Inadimplentes" desabilitado com "disponível na Sprint 4"

  Cenário: busca não cruza tenants
    Dado o CPF sintético de um paciente de "studio-b"
    Quando um usuário de "studio-a" busca por esse CPF
    Então vê "Nenhum paciente encontrado"
```

Artefatos: termos de busca nos traces são sintéticos; nenhum CPF real.

## 9. Plano de execução

1. [ ] Branch `feat/CLI-19-patient-search` após merge de CLI-17. Confirmar D19 (estado da extensão no CI e no OCI).
2. [ ] `packages/types/src/patient-search.ts` (query, views, descriptors, labels pt-BR).
3. [ ] Migration aditiva: `socialNameNormalized`, índices de CPF/telefone/aniversário (se não vieram em CLI-17).
4. [ ] `QueryClassifier`, `cursor.ts`, `PatientFilterRegistry` + `core-filters.provider.ts`.
5. [ ] `PatientSearchRepository` (`Prisma.sql` parametrizado, `SET LOCAL` de similaridade/timeout, fallback `ILIKE`), `PatientSearchService`, controller, DTO com `forbidNonWhitelisted`.
6. [ ] Rate limit da rota; logs sem `q`.
7. [ ] Fixtures: nomes com acento/variações, telefones com sufixos distintos, aniversários em meses diferentes, 1 arquivado; script opcional de 2k pacientes para `SEARCH_PERF=1`.
8. [ ] Web: `SearchBar`, `FilterChips`, `PatientResultCard`, scroll infinito, `recent-searches`, BFF; substituir a lista de CLI-17.
9. [ ] Testes §8.
10. [ ] Docs: `docs/patient-search.md` (classificação de `q`, contrato `PatientFilterProviderPort` para Sprints 3/4, cursor, fallback).
11. [ ] Validação mandatória.
12. [ ] PR `CLI-19 — Busca inteligente e filtros de pacientes`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Nenhuma query de busca sem `tenantId` do contexto; nenhuma interpolação de string em SQL.
- [ ] Filtros futuros declarados no catálogo com `available=false` e `plannedSprint`; `FILTER_NOT_AVAILABLE` provado.
- [ ] Cursor assinado; paginação keyset provada.
- [ ] `q` ausente de logs/telemetria.
- [ ] Contrato `PatientFilterProviderPort` documentado para agenda/financeiro.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| `pg_trgm`/`unaccent` (D19) | Trusted extensions no Postgres ≥ 13; fallback `ILIKE` mantém funcionalidade; medir no piloto |
| Paginação com `similarity` | Keyset por `(similarity, id)` na mesma query; se instável, limitar relevância a 100 sem cursor |
| Filtros de outros módulos via `idIn` | Simples e desacoplado; limite de 10k ids; se crescer, provider passa a devolver `Prisma.sql` de subquery |
| Telefone por sufixo | Útil no balcão; custo `LIKE '%x'` sem índice — aceitável no piloto; índice reverso (`reverse(phone)`) se necessário |
| Busca por nome social | Coluna normalizada própria evita custo em runtime |
| Termo misto (letras+dígitos) | Heurística simples; casos raros caem em `NAME` |
