# Spec — CLI-23 Recorrência, conflitos e disponibilidade

| Campo | Valor |
| --- | --- |
| Linear | [CLI-23](https://linear.app/clivyra/issue/CLI-23/sprint-3-recorrencia-conflitos-e-disponibilidade) — Urgent — Backlog |
| Pai | CLI-68 |
| Prioridade | P0 |
| Branch | `feat/CLI-23-recurrence-conflicts-availability` |
| Depende de | CLI-22 e todas as suas dependências |
| Bloqueia | CLI-52 e CLI-53 |
| Plano | [`../PLANO_IMPLEMENTACAO.md`](../PLANO_IMPLEMENTACAO.md) |

## 1. Objetivo

Tornar a agenda confiável para horários fixos e concorrência real: criar séries
semanais finitas, editar uma ocorrência ou esta e futuras, bloquear recursos,
calcular slots e impedir dupla reserva de paciente, profissional ou sala mesmo
quando duas requisições chegam ao mesmo tempo.

## 2. Escopo

### Dentro

- recorrência somente semanal;
- uma ou mais ocorrências por semana;
- limite de 104 ocorrências e 12 meses;
- materialização transacional das ocorrências;
- edição/cancelamento de uma ocorrência;
- edição/cancelamento desta e futuras com split de série;
- exceções preservadas;
- bloqueio de profissional e/ou sala;
- disponibilidade derivada de WorkingHours, duração do serviço, appointments e
  bloqueios;
- conflito de paciente, profissional e sala;
- consistência concorrente por lock/constraint no PostgreSQL;
- erros de conflito sanitizados;
- UI de recorrência, conflito, slots e bloqueios;
- auditoria, testes de timezone e concorrência.

### Fora

- recorrência diária, mensal, RRULE arbitrária ou sem fim;
- turma, capacidade, matrícula, presença, saldo, reposição e lista de espera;
- override de conflito;
- feriados nacionais automáticos;
- sincronização com Google Calendar;
- disponibilidade pública/autoagendamento;
- agenda multi-unidade;
- geração de série em background.

## 3. Critérios de aceite → prova

| Critério | Prova |
| --- | --- |
| Sistema impede dupla reserva incompatível | integração com requisições paralelas: apenas uma reserva para mesmo paciente/profissional/sala vence |
| Recorrência permite editar ocorrência ou série | E2E: alterar uma ocorrência não move irmãs; “esta e futuras” preserva passado e cria novo segmento |
| Horários bloqueados não aparecem disponíveis | integration + Playwright: slot some após bloqueio e criação no slot retorna 409/422 |
| Conflitos retornam mensagem clara | UI mantém formulário e identifica “profissional/sala/pessoa indisponível”, sem expor terceiro |
| Série é segura e finita | DTO rejeita intervalo/quantidade fora do limite antes de gerar ocorrências |
| Timezone é preservado | testes em timezone IANA com transição de offset mantêm hora local escolhida |

## 4. Modelo de dados

### 4.1 Série

```prisma
enum RecurrenceFrequency {
  WEEKLY
}

enum AppointmentSeriesStatus {
  ACTIVE
  ENDED
  CANCELLED
}

model AppointmentSeries {
  id               String                  @id @default(cuid())
  tenantId         String
  frequency        RecurrenceFrequency     @default(WEEKLY)
  intervalWeeks    Int                     @default(1)
  weekdays         Int[]
  localStartTime   String
  timezone         String
  startsOn         DateTime                @db.Date
  endsOn           DateTime                @db.Date
  status           AppointmentSeriesStatus @default(ACTIVE)
  version          Int                     @default(1)
  parentSeriesId   String?
  createdByUserId  String
  updatedByUserId  String
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt

  tenant       Tenant              @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  parentSeries AppointmentSeries?  @relation("SeriesSplit", fields: [parentSeriesId], references: [id], onDelete: Restrict)
  childSeries  AppointmentSeries[] @relation("SeriesSplit")
  appointments Appointment[]

  @@index([tenantId, status])
  @@index([tenantId, startsOn, endsOn])
  @@index([tenantId, parentSeriesId])
}
```

CLI-23 adiciona a `Appointment`:

```prisma
seriesId          String?
occurrenceLocalDate DateTime? @db.Date
isSeriesException Boolean @default(false)
series            AppointmentSeries? @relation(fields: [seriesId], references: [id], onDelete: Restrict)

@@unique([tenantId, seriesId, occurrenceLocalDate])
```

`AppointmentSeries` é a definição; cada `Appointment` materializado continua
sendo a fonte operacional. Agenda e conflitos nunca expandem RRULE em leitura.

### 4.2 Bloqueio

```prisma
enum ScheduleBlockReason {
  PERSONAL
  MEETING
  MAINTENANCE
  HOLIDAY
  OTHER
}

model ScheduleBlock {
  id              String              @id @default(cuid())
  tenantId        String
  professionalId  String?
  roomId          String?
  startsAt        DateTime
  endsAt          DateTime
  reasonCode      ScheduleBlockReason
  cancelledAt     DateTime?
  version         Int                 @default(1)
  createdByUserId String
  updatedByUserId String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  professional Professional? @relation(fields: [professionalId], references: [id], onDelete: Restrict)
  room        Room?        @relation(fields: [roomId], references: [id], onDelete: Restrict)

  @@index([tenantId, startsAt])
  @@index([tenantId, professionalId, startsAt])
  @@index([tenantId, roomId, startsAt])
}
```

Checks SQL:

- `startsAt < endsAt`;
- `version >= 1`;
- bloqueio exige `professionalId IS NOT NULL OR roomId IS NOT NULL`;
- `intervalWeeks BETWEEN 1 AND 4`;
- `startsOn <= endsOn`;
- weekdays contêm apenas 0..6, sem duplicidade;
- `localStartTime` casa `HH:mm` em passo de 5 minutos.

Ambos os modelos entram em `TENANT_OWNED_MODELS`.

## 5. Recorrência

### 5.1 Request

```ts
interface CreateAppointmentSeriesRequest {
  patientId: string;
  professionalId: string;
  serviceId: string;
  roomId?: string;
  recurrence: {
    frequency: 'WEEKLY';
    intervalWeeks: 1 | 2 | 3 | 4;
    weekdays: number[];
    localStartTime: string;
    startsOn: string;
    endsOn: string;
  };
}
```

O timezone não vem do request; é lido de `TenantSettings.timezone` e congelado
na série. O servidor usa uma biblioteca IANA aprovada ou `Temporal` disponível
no runtime para gerar instantes. Se for necessário adicionar
`@js-temporal/polyfill`, a implementação deve instalar a versão estável mais
recente após auditoria de vulnerabilidade/licença.

### 5.2 Regras

- máximo de 7 weekdays, 104 ocorrências e 12 meses;
- todas as ocorrências usam a duração congelada do serviço;
- criação valida referências e conflitos de **todas** as ocorrências antes de
  persistir;
- a operação é atômica: qualquer conflito impede a série inteira;
- a resposta `409` lista no máximo 20 datas conflitantes e `hasMore`;
- ocorrência editada individualmente mantém `seriesId`, marca
  `isSeriesException=true` e preserva `occurrenceLocalDate`;
- cancelamento individual preserva a linha cancelada como exceção;
- “esta e futuras” encerra a série original no dia anterior a `effectiveFrom`,
  preserva passado/exceções, cria série filha e rematerializa apenas o futuro;
- appointments futuros ainda não excepcionados da série antiga são cancelados
  com causa interna `SERIES_SPLIT`; não são apagados;
- alterar “toda a série” é representado por “esta e futuras” a partir da
  primeira ocorrência futura. Passado nunca muda;
- uma série sem ocorrências futuras passa a `ENDED`;
- retry idempotente usa `Idempotency-Key` por 24 horas para evitar série
  duplicada após timeout.

## 6. Conflitos e concorrência

### 6.1 Sobreposição

Intervalos são semiabertos:

```text
existing.startsAt < candidate.endsAt
AND existing.endsAt > candidate.startsAt
```

Ignorar somente appointments `CANCELLED` e blocks com `cancelledAt != null`.

Conflitos duros:

1. mesmo `patientId`;
2. mesmo `professionalId`;
3. mesmo `roomId`, quando informado;
4. block do profissional;
5. block da sala.

Atendimento fora de `WorkingHours.effective` retorna
`OUTSIDE_WORKING_HOURS`; não há override no P0.

### 6.2 Garantia transacional

`ScheduleConflictService.reserve()`:

1. inicia transação;
2. revalida tenant e recursos ativos;
3. calcula chaves de lock para cada `(tenantId, resourceType, resourceId,
   localDate)` afetado;
4. ordena chaves e adquire locks transacionais PostgreSQL para evitar deadlock;
5. consulta appointments/blocks sobrepostos;
6. aplica update condicional por `version` ou cria;
7. commit; erros serializáveis têm no máximo 3 retries com jitter.

Séries adquirem todos os locks em ordem determinística. A implementação pode
substituir advisory locks por exclusion constraints/range locks se provar a
mesma garantia. É proibido:

```text
find conflict -> no result -> create
```

fora de proteção transacional.

### 6.3 Erro sanitizado

```json
{
  "statusCode": 409,
  "code": "SCHEDULE_CONFLICT",
  "message": "O horário selecionado não está disponível.",
  "requestId": "req_...",
  "details": {
    "conflicts": [
      {
        "resourceType": "PROFESSIONAL",
        "startsAt": "2026-09-14T12:00:00.000Z",
        "endsAt": "2026-09-14T13:00:00.000Z"
      }
    ],
    "hasMore": false
  }
}
```

Não retornar id/nome do appointment conflitante, paciente ou motivo privado do
bloqueio.

## 7. Disponibilidade

### 7.1 Endpoint

`GET /availability?professionalId&serviceId&from&to&roomId?`

Regras:

- `from < to`, janela ≤ 31 dias;
- duração vem do serviço;
- grade em passos de 5 minutos;
- base = `WorkingHours.effective(professionalId, date)`;
- subtrai appointments ativos do profissional e do paciente **somente quando
  `patientId` opcional for informado**;
- subtrai blocks do profissional;
- se sala informada, subtrai appointments/blocks da sala;
- retorna somente slots em que a duração completa cabe;
- profissionais/serviços/salas inativos não têm slots;
- resposta usa UTC e inclui timezone do tenant para renderização;
- pagina/limita a no máximo 500 slots.

```ts
interface AvailabilityResponse {
  timezone: string;
  durationMinutes: number;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    professionalId: string;
    roomId?: string;
  }>;
}
```

Disponibilidade é informativa. `POST /appointments` sempre revalida conflito na
mesma transação de escrita.

## 8. API

| Método/rota | Permissão | Notas |
| --- | --- | --- |
| `POST /appointment-series` | `agenda:write` | `Idempotency-Key` obrigatório |
| `GET /appointment-series/:id` | `agenda:read` | projeção por policy |
| `PATCH /appointment-series/:id` | `agenda:write` | `{ version, effectiveFrom, ...changes }` |
| `POST /appointment-series/:id/cancel` | `agenda:write` | `{ version, effectiveFrom }` |
| `GET /schedule-blocks?from&to&professionalId&roomId` | `agenda:read` | motivo projetado |
| `POST /schedule-blocks` | `agenda:write` | profissional e/ou sala |
| `PATCH /schedule-blocks/:id` | `agenda:write` | exige `version` |
| `POST /schedule-blocks/:id/cancel` | `agenda:write` | sem delete |
| `GET /availability` | `agenda:read` | janela e resultado limitados |

CLI-23 amplia:

- `POST /appointments/:id/reschedule` com
  `scope: 'OCCURRENCE' | 'THIS_AND_FUTURE'`;
- `POST /appointments/:id/cancel` com o mesmo `scope` quando houver `seriesId`.

Para appointment avulso, `scope` deve ser ausente ou `OCCURRENCE`.

## 9. Estrutura

```text
apps/api/src/scheduling/
  series/
    appointment-series.controller.ts
    appointment-series.service.ts
    recurrence.policy.ts
    recurrence.generator.ts
    series.repository.ts
  conflicts/
    schedule-conflict.service.ts
    schedule-lock.repository.ts
    conflict.mapper.ts
  availability/
    availability.controller.ts
    availability.service.ts
  blocks/
    schedule-blocks.controller.ts
    schedule-blocks.service.ts
    schedule-block.repository.ts
    schedule-block.policy.ts
```

`RecurrenceGenerator` é puro e não acessa Prisma. `AvailabilityService` depende
de portas de leitura de Studio e Scheduling; não consulta tabelas de outro
módulo diretamente no controller.

## 10. Autorização, auditoria e LGPD

### Autorização

- OWNER/ADMIN/RECEPTION gerenciam séries e blocks de qualquer profissional;
- PROFESSIONAL gerencia somente série/block cujo `professionalId` está
  vinculado à própria membership;
- block somente de sala exige OWNER/ADMIN/RECEPTION;
- policy é reavaliada em cada alteração e não confia no `professionalId` antigo
  ou novo isoladamente;
- recursos de outro tenant retornam `404`.

### Auditoria

- `appointment_series.created|split|cancelled`;
- `schedule_block.created|updated|cancelled`;
- `schedule.conflict_rejected`;
- `availability.queried` apenas como métrica agregada, não `AuditLog` por
  consulta comum.

Metadata contém ids, datas, horários, status, quantidade de ocorrências e tipo
de recurso. Não contém nome de paciente, motivo livre, telefone ou dado clínico.

### Limites de abuso

- range máximo de 31 dias;
- no máximo 104 ocorrências por comando;
- `Idempotency-Key` 16..128 chars, escopada por tenant/ator/rota;
- payload máximo padrão da API;
- throttle específico para criação/alteração de série e consulta de
  disponibilidade;
- timeout da transação e retries limitados.

## 11. Web

### Recorrência

No formulário de agendamento:

- toggle “Repetir semanalmente”;
- dias da semana;
- intervalo de 1 a 4 semanas;
- data final obrigatória;
- resumo “Toda segunda e quarta, 08:00, até 30/11 — 20 atendimentos”;
- conflito lista datas afetadas sem dados de terceiros;
- nenhuma opção “sem fim”.

Ao editar série:

- sheet obrigatória “Somente este atendimento” ou “Este e os próximos”;
- mostrar o impacto/quantidade antes de confirmar;
- ocorrências passadas não são selecionáveis.

### Disponibilidade

- após pessoa, serviço e profissional, buscar slots;
- agrupar por dia no timezone do tenant;
- exibir “Sem horários” com opção de trocar profissional/data;
- seleção obsoleta que recebe 409 volta à etapa de horário sem perder dados.

### Bloqueios

- rota `/app/agenda/bloqueios`;
- criar por profissional e/ou sala, início/fim e motivo controlado;
- PROFESSIONAL vê/edita apenas os próprios;
- outros profissionais veem somente “Indisponível”.

## 12. Testes

### Unit

- sobreposição `[start,end)` e adjacência;
- geração semanal 1..4 semanas e múltiplos weekdays;
- limites de 104/12 meses;
- timezone IANA e transição de offset;
- split preserva passado/exceções;
- cálculo de slots em múltiplos intervalos de WorkingHours;
- subtração de appointments/blocks;
- ordenação estável das chaves de lock;
- sanitização de conflito;
- policy de block/série.

### Integração

| Cenário | Esperado |
| --- | --- |
| série válida com 10 datas | série + 10 appointments em uma transação |
| 1 ocorrência conflita | `409`, zero série e zero ocorrências |
| mesmo `Idempotency-Key` repetido | mesma resposta/recurso, sem duplicar |
| editar uma ocorrência | só ela muda e vira exceção |
| editar esta e futuras | passado intacto, série antiga encerrada, filha criada |
| cancelar ocorrência | linha permanece `CANCELLED`, irmãs intactas |
| dois POST paralelos no mesmo profissional | um sucesso, um `409` |
| dois POST paralelos mesma sala, profissionais diferentes | um sucesso, um `409` |
| dois POST paralelos mesmo paciente | um sucesso, um `409` |
| block concorrente com appointment | apenas uma operação vence |
| intervalos adjacentes | ambos permitidos |
| block cobre slot | não aparece em availability; criação rejeitada |
| range >31 dias ou série >104 | `422`, sem query/geração excessiva |
| série/recurso de tenant B | `404` |
| PROFESSIONAL bloqueia colega/sala-only | `403` |

### Playwright

```gherkin
Feature: Recorrência semanal
  Scenario: recepção cria uma série sem conflito
    Given uma pessoa e um profissional disponíveis no tenant A
    When a recepção agenda toda segunda às 08:00 até a data final
    Then o resumo informa a quantidade de atendimentos
    And as ocorrências aparecem nas semanas correspondentes após recarregar

  Scenario: alteração de uma ocorrência preserva a série
    Given uma série semanal com três ocorrências futuras
    When a recepção reageenda somente a segunda ocorrência
    Then a primeira e a terceira mantêm seus horários
    And a segunda aparece no novo horário

  Scenario: conflito não expõe outro paciente
    Given um profissional já ocupado no horário
    When a recepção tenta agendar outra pessoa no mesmo intervalo
    Then o sistema informa que o profissional está indisponível
    And não exibe o nome da pessoa do atendimento existente

Feature: Bloqueio e disponibilidade
  Scenario: bloqueio remove o slot
    Given um horário de trabalho livre
    When o profissional cria um bloqueio nesse intervalo
    Then o horário deixa de aparecer como disponível
    And uma criação direta no intervalo é rejeitada pelo servidor
```

## 13. Plano de execução

1. [ ] Confirmar CLI-22 mergeada e contratos de WorkingHours/timezone.
2. [ ] Adicionar contratos de recurrence, availability e blocks.
3. [ ] Adicionar models, migration, checks, índices e registro tenant-owned.
4. [ ] Implementar `RecurrenceGenerator` com timezone IANA e limites.
5. [ ] Implementar lock/constraint transacional e retries limitados.
6. [ ] Substituir o conflict checker básico da CLI-22.
7. [ ] Implementar série, split, exceção e idempotência.
8. [ ] Implementar blocks e availability.
9. [ ] Implementar UI incremental no formulário e rota de blocks.
10. [ ] Criar testes unitários, integração concorrente e Playwright.
11. [ ] Atualizar documentação técnica e rodar validação mandatória.
12. [ ] Abrir PR `CLI-23 — Recorrência, conflitos e disponibilidade`.

## 14. Definition of Done

- [ ] Dupla reserva é impedida sob concorrência real no PostgreSQL.
- [ ] Série é finita, atômica, idempotente e tenant-scoped.
- [ ] Ocorrência/esta e futuras preservam histórico.
- [ ] Availability deriva de dados internos e é revalidada na escrita.
- [ ] Nenhum conflito expõe terceiro.
- [ ] PROFESSIONAL não gerencia recurso alheio.
- [ ] Limites de range/recorrência e timeouts testados.
- [ ] UI mobile trata conflito sem perder formulário.
- [ ] Auditoria sem PII excessiva.
- [ ] Security review sem BLOCKER/HIGH.

## 15. Riscos

| Risco | Mitigação |
| --- | --- |
| Lock errado permitir corrida | teste paralelo repetido contra PostgreSQL real |
| Muitos locks em série | limite 104, ordem estável, timeout e transação curta |
| DST mover hora local | série congela timezone + data/hora local, testes de offset |
| Split duplicar ocorrências | unique por série/data local + idempotência |
| Availability parecer garantia | revalidar na transação e comunicar 409 recuperável |
| Escopo virar Pilates | nenhuma entidade de turma, capacidade ou saldo neste card |
