# Spec — CLI-22 Agenda operacional diária e semanal

| Campo | Valor |
| --- | --- |
| Linear | [CLI-22](https://linear.app/clivyra/issue/CLI-22/sprint-3-agenda-diaria-semanal-e-mensal) — Urgent — Backlog |
| Pai | CLI-68 |
| Prioridade | P0 |
| Branch | `feat/CLI-22-agenda-operacional` |
| Depende de | CLI-12, CLI-13, CLI-14, CLI-16, CLI-17 e contratos de busca da CLI-19 |
| Bloqueia | CLI-23, CLI-52 e CLI-53 |
| Plano | [`../PLANO_IMPLEMENTACAO.md`](../PLANO_IMPLEMENTACAO.md) |

> **Ajuste de escopo:** o título/descrição atual do Linear ainda cita visão
> mensal e presença. O recorte canônico da CLI-68 e do milestone é dia/semana.
> Visão mensal e frequência/presença de Pilates não entram neste card.

## 1. Objetivo

Entregar a primeira fatia vertical da agenda: usuários autorizados consultam a
agenda diária/semanal e criam, editam, confirmam, reagendam, concluem, marcam
não comparecimento ou cancelam um atendimento individual, com persistência,
auditoria, isolamento de tenant e UX mobile-first.

## 2. Escopo

### Dentro

- modelo tenant-owned `Appointment` e `AppointmentStatus`;
- lista por intervalo com filtros de profissional, sala, serviço e status;
- detalhe com projeção de dados por papel;
- atendimento individual;
- edição de paciente/serviço/profissional/sala;
- reagendamento de ocorrência única;
- transições de estado explícitas;
- cancelamento sem exclusão;
- validação básica de intervalo e referências ativas do tenant;
- auditoria e optimistic concurrency;
- agenda web dia/semana, formulário e ações rápidas;
- integração “Agendar”/próximo atendimento com Patient 360 sem alterar o domínio
  de pacientes;
- testes unitários, integração e E2E da fatia.

### Fora

- série/recorrência, bloqueios e cálculo de disponibilidade (CLI-23);
- visão mensal;
- turmas, capacidade, frequência, saldo, reposição e lista de espera (Sprint 6);
- validação de plano/contrato ou cobrança;
- criação inline de paciente;
- notificações e calendários externos;
- observações clínicas ou motivo de atendimento em texto livre;
- exclusão física;
- override de conflito.

## 3. Critérios de aceite → prova

| Critério | Prova |
| --- | --- |
| Operações principais funcionam no mobile | Playwright em 390×844: listar, criar, confirmar, reagendar e cancelar sem scroll horizontal |
| Alterações atualizam a agenda | resposta contém nova `version`; query/reload mostra horário e status atualizados |
| Eventos pertencem ao tenant | integration: tenant A não lista nem acessa/altera appointment de B; id de B → `404` |
| Status é rastreável | máquina de estados no domínio + `AuditLog` para criação, reagendamento, mudança de status e cancelamento |
| Autorização é server-side | PROFESSIONAL não altera agenda de outro profissional mesmo chamando a API diretamente |
| Não há perda por edição concorrente | segundo update com `version` antiga → `409 VERSION_CONFLICT` |

CLI-22 faz a checagem de sobreposição em uma porta
`ScheduleConflictChecker`; CLI-23 substitui a implementação inicial pelo motor
completo e resistente à concorrência. CLI-22 não pode ser mergeada se permitir
dupla reserva conhecida no fluxo normal.

## 4. Modelo de dados

Adaptar nomes de FKs ao schema real da Sprint 2:

```prisma
enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  COMPLETED
  NO_SHOW
  CANCELLED
}

model Appointment {
  id               String            @id @default(cuid())
  tenantId         String
  patientId        String
  professionalId   String
  serviceId        String
  roomId           String?
  startsAt         DateTime
  endsAt           DateTime
  durationMinutes  Int
  status           AppointmentStatus @default(SCHEDULED)
  cancellationCode String?
  cancelledAt      DateTime?
  confirmedAt      DateTime?
  completedAt      DateTime?
  noShowAt         DateTime?
  version          Int               @default(1)
  createdByUserId  String
  updatedByUserId  String
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  patient     Patient      @relation(fields: [patientId], references: [id], onDelete: Restrict)
  professional Professional @relation(fields: [professionalId], references: [id], onDelete: Restrict)
  service     Service      @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  room        Room?        @relation(fields: [roomId], references: [id], onDelete: Restrict)

  @@index([tenantId, startsAt])
  @@index([tenantId, professionalId, startsAt])
  @@index([tenantId, roomId, startsAt])
  @@index([tenantId, patientId, startsAt])
  @@index([tenantId, status, startsAt])
}
```

Migration SQL adiciona checks:

```sql
CHECK ("startsAt" < "endsAt");
CHECK ("durationMinutes" BETWEEN 5 AND 480);
CHECK ("version" >= 1);
```

Regras:

- entra em `TENANT_OWNED_MODELS`;
- `durationMinutes` é copiada de `Service.durationMinutes` no momento da criação
  ou troca de serviço; alteração futura do catálogo não muda o histórico;
- `endsAt` é calculado no servidor, nunca aceito como autoridade do cliente;
- `createdByUserId`/`updatedByUserId` vêm do principal autenticado;
- `cancellationCode` usa enum/allowlist:
  `PATIENT_REQUEST`, `PROFESSIONAL_UNAVAILABLE`, `STUDIO_REQUEST`,
  `DUPLICATE`, `OTHER`; não há texto livre no P0;
- não existe `DELETE /appointments/:id`.

## 5. Contratos compartilhados

Em `packages/types/src/scheduling.ts`:

```ts
export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export interface AppointmentSummary {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  version: number;
  patient: { id: string; displayName: string } | { displayName: 'Ocupado' };
  professional: { id: string; displayName: string; color?: string };
  service: { id: string; name: string };
  room?: { id: string; name: string };
}
```

DTOs de request vivem na API e têm allowlist estrita. Contratos de resposta e
enums reutilizados pela web vivem no pacote compartilhado. Nenhum contrato
inclui entidade Prisma ou `tenantId` fornecido pelo cliente.

## 6. Design da API

### 6.1 Estrutura

```text
apps/api/src/scheduling/
  scheduling.module.ts
  appointments/
    appointments.controller.ts
    appointments.service.ts
    appointment.repository.ts
    appointment.policy.ts
    appointment-state-machine.ts
    appointment.mapper.ts
    dto/
  conflicts/
    schedule-conflict-checker.port.ts
    basic-schedule-conflict-checker.ts
packages/types/src/scheduling.ts
```

Controller trata HTTP. `AppointmentsService` orquestra casos de uso.
`AppointmentStateMachine` e `AppointmentPolicy` concentram regras; o repository
é o único acesso Prisma do módulo.

### 6.2 Endpoints

| Método/rota | Permissão | Request | Resultado |
| --- | --- | --- | --- |
| `GET /appointments` | `agenda:read` | `from`, `to`, filtros opcionais | `AppointmentSummary[]` |
| `GET /appointments/:id` | `agenda:read` | — | detalhe projetado |
| `POST /appointments` | `agenda:write` | `{ patientId, professionalId, serviceId, roomId?, startsAt }` | `201` |
| `PATCH /appointments/:id` | `agenda:write` | `{ version, patientId?, professionalId?, serviceId?, roomId? }` | `200` |
| `POST /appointments/:id/reschedule` | `agenda:write` | `{ version, startsAt }` | `200` |
| `POST /appointments/:id/status` | `agenda:write` | `{ version, status }` | `200` |
| `POST /appointments/:id/cancel` | `agenda:write` | `{ version, cancellationCode }` | `200` |

Validações:

- `from`/`to` ISO-8601 com offset, `from < to`, janela ≤ 31 dias;
- `startsAt` ISO-8601 com offset e granularidade de 5 minutos;
- criação no passado é rejeitada quando anterior a `now - 5 min`;
- ids são CUID/UUID conforme o padrão real, no máximo 128 caracteres;
- referências devem estar ativas, pertencer ao tenant e manter vínculos:
  profissional presta o serviço; sala está ativa;
- campos desconhecidos, inclusive `tenantId`, `status` em `PATCH` e `endsAt`,
  retornam `400`.

### 6.3 Máquina de estados

| De | Para permitidos | Regra |
| --- | --- | --- |
| `SCHEDULED` | `CONFIRMED`, `COMPLETED`, `NO_SHOW`, `CANCELLED` | desfecho só após `startsAt` |
| `CONFIRMED` | `SCHEDULED` por reagendamento, `COMPLETED`, `NO_SHOW`, `CANCELLED` | status genérico não volta para scheduled |
| `COMPLETED` | — | terminal |
| `NO_SHOW` | — | terminal |
| `CANCELLED` | — | terminal |

Reagendar:

1. carrega por `id + tenantId`;
2. policy autoriza o ator e rejeita estado terminal;
3. recalcula `endsAt` com a duração congelada;
4. checa conflito;
5. atualiza com `where { id, tenantId, version }`;
6. incrementa `version`, limpa `confirmedAt` e retorna `SCHEDULED`;
7. audita horário anterior/novo, sem nome do paciente.

Se nenhuma linha for atualizada, distinguir `404` de `VERSION_CONFLICT` sem
consultar fora do tenant.

## 7. Autorização e projeção

| Papel | Policy |
| --- | --- |
| OWNER / ADMIN / RECEPTION | leitura e escrita operacional em qualquer profissional do tenant |
| PROFESSIONAL | detalhe completo e escrita somente quando `professional.membershipId` é a membership do ator |

Na visão de um PROFESSIONAL:

- seus appointments mostram nome de exibição do paciente e serviço;
- appointments de outro profissional aparecem como intervalo “Ocupado”, nome do
  profissional e sala quando necessário para operação;
- não retornam `patientId`, nome, serviço específico ou cancellation code do
  outro profissional.

A policy é executada no serviço, além do guard de permissão. Ocultar ação na web
é somente UX.

## 8. Auditoria e observabilidade

Eventos:

- `appointment.created`;
- `appointment.updated`;
- `appointment.rescheduled`;
- `appointment.status_changed`;
- `appointment.cancelled`;
- `appointment.conflict_rejected`;
- `appointment.version_conflict`.

Metadata allowlist:

```text
appointmentId, patientId, professionalId, serviceId, roomId,
previousStartsAt, startsAt, previousStatus, status, cancellationCode, version
```

Não registrar nome, CPF, telefone, e-mail, body completo ou texto clínico.
Conflito retorna/loga `resourceType` e intervalo, não a identidade de outro
paciente. Métricas por tenant podem usar `tenantId`, mas não PII.

## 9. Web mobile-first

```text
apps/web/app/(app)/app/agenda/page.tsx
apps/web/app/(app)/app/agenda/novo/page.tsx
apps/web/app/(app)/app/agenda/[appointmentId]/page.tsx
apps/web/app/(app)/app/agenda/[appointmentId]/reagendar/page.tsx
apps/web/features/scheduling/
```

### Agenda

- default “Hoje” no timezone do tenant;
- segmented control `Dia | Semana`;
- botões anterior, hoje, próximo;
- filtros em drawer/bottom sheet;
- timeline com indicadores de horário e status;
- card: horário, nome/projeção “Ocupado”, serviço, profissional, sala e status;
- CTA vazio “Agendar atendimento”;
- nenhum conteúdo autenticado entra no cache do service worker.

### Novo atendimento

1. selecionar pessoa pela busca da Sprint 2;
2. selecionar serviço;
3. selecionar profissional;
4. selecionar data/hora;
5. sala opcional;
6. revisar e salvar.

O formulário preserva valores em erro recuperável. Conflito `409` mantém o
formulário e foca a mensagem. CLI-23 adiciona slots e recorrência sem reescrever
o fluxo.

### Detalhe e ações

- confirmar;
- reagendar;
- concluir;
- marcar “Não compareceu”;
- cancelar com motivo controlado;
- abrir ficha da pessoa quando autorizado.

Confirmação destrutiva para cancelar. Após `VERSION_CONFLICT`, oferecer
“Atualizar dados”; nunca sobrescrever silenciosamente.

## 10. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| `tenantId` forjado | DTO rejeita; tenant vem da sessão |
| IDOR em appointment | repository sempre usa tenant scope; outro tenant → 404 |
| PROFESSIONAL alterar agenda alheia | `AppointmentPolicy` por vínculo, testada via API |
| Mass assignment de status/autor/horário final | allowlists e endpoints de comando |
| Referência cross-tenant | validação de patient/professional/service/room no tenant |
| Lost update | `version` obrigatória e update condicional |
| PII na grade/log | projeção mínima e audit metadata allowlist |
| Cache PWA de agenda | excluir `/app/agenda` e APIs autenticadas |
| Enumeração por conflito | detalhe sanitizado sem identidade |

Qualquer leitura/mutação cross-tenant ou bypass da policy de profissional é
**BLOCKER**.

## 11. Testes

### Unit

- transições permitidas/proibidas;
- desfecho antes do início → 422;
- cálculo de `endsAt` e granularidade;
- policy de PROFESSIONAL próprio/alheio;
- projeção “Ocupado”;
- mapper sem PII excessiva;
- metadata de auditoria sem campos proibidos.

### Integração

| Cenário | Esperado |
| --- | --- |
| RECEPTION cria appointment no tenant A | `201`, duração do serviço congelada |
| payload contém `tenantId`, `endsAt`, `createdByUserId` ou `status` | `400` |
| patient/professional/service/room de B | `404`, nada criado |
| A lista intervalo | somente appointments de A |
| A acessa/altera id de B | `404` |
| PROFESSIONAL A altera appointment de outro profissional de A | `403` |
| PROFESSIONAL A lista agenda geral | appointment alheio projetado como “Ocupado” |
| reagendar confirmado | `SCHEDULED`, horário novo, audit |
| cancelar | registro preservado, terminal, audit |
| completar antes do início | `422` |
| update simultâneo com mesma versão | um `200`, outro `409` |
| serviço muda duração depois | appointment antigo mantém duração |

### Playwright

```gherkin
Feature: Agenda operacional
  Scenario: recepção cria um atendimento pelo celular
    Given uma recepção autenticada no tenant A
    And uma pessoa, serviço e profissional ativos no tenant A
    When cria um atendimento futuro na agenda diária
    Then o atendimento aparece no horário escolhido
    And permanece após recarregar a página

  Scenario: profissional não altera agenda de colega
    Given um profissional autenticado no tenant A
    And um atendimento de outro profissional do tenant A
    When tenta abrir a ação de reagendamento
    Then vê apenas o intervalo ocupado
    And a API rejeita a mutação com 403

  Scenario: cancelamento preserva histórico
    Given um atendimento confirmado
    When a recepção cancela com um motivo válido
    Then o card aparece como cancelado
    And não volta a aparecer como horário ocupado após a recarga
```

## 12. Plano de execução

1. [ ] Confirmar Definition of Ready e schema resultante das Sprints 1/2.
2. [ ] Criar `packages/types/src/scheduling.ts`.
3. [ ] Adicionar `Appointment`, migration aditiva, índices/checks e registro
   tenant-owned.
4. [ ] Implementar módulo, repository, policy, state machine, mapper e DTOs.
5. [ ] Implementar endpoints e auditoria.
6. [ ] Integrar busca de paciente e Patient 360 por contrato, sem import direto
   entre módulos de domínio.
7. [ ] Implementar agenda dia/semana e formulários mobile.
8. [ ] Excluir agenda/API autenticada do service worker.
9. [ ] Criar testes unitários, integração e Playwright da fatia.
10. [ ] Atualizar docs de API/domínio e executar validação mandatória.
11. [ ] Abrir PR `CLI-22 — Agenda operacional dia e semana`.

## 13. Definition of Done

- [ ] Critérios do §3 cobertos no CI.
- [ ] Nenhum `tenantId` aceito do cliente.
- [ ] Policy por papel/recurso testada server-side.
- [ ] Sem exclusão física e sem transição terminal reversível.
- [ ] Edição concorrente não sobrescreve estado.
- [ ] UI dia/semana passa em viewport mobile e desktop.
- [ ] Agenda e API autenticada fora do cache do PWA.
- [ ] Auditoria não contém PII excessiva.
- [ ] Migration deploy/rollback operacional documentado.
- [ ] Security review sem BLOCKER/HIGH.

## 14. Riscos

| Risco | Mitigação |
| --- | --- |
| Schema Patient/Studio divergir da spec | adaptar após dependências, sem duplicar modelos |
| Motor de conflito básico sofrer corrida | CLI-23 é bloqueador do gate e entrega consistência concorrente |
| Status confundido com frequência de Pilates | não criar Attendance/saldo; explicitar desfecho individual |
| Grade semanal complexa no mobile | default dia; semana resumida e acessível |
| Dados alheios na agenda de profissional | projeção busy-only testada por papel |
