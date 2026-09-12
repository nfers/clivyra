# Consentimentos e direitos LGPD (CLI-15)

Base de gestão de consentimento e requisições do titular (art. 18 LGPD), isolada por tenant e auditada (CLI-14).

## Modelo

- **ConsentTerm** — versão por `(tenantId, type)`; rascunho editável; publicação gera `version` incremental + `contentHash` (sha256); só uma `PUBLISHED` por tipo.
- **ConsentRecord** — append-only. Aceite/revogação/renovação = novo registro com `supersedesId`. Triggers Postgres + extensão Prisma bloqueiam `UPDATE`/`DELETE`.
- **DataSubjectRequest** — fila com `dueAt = requestedAt + LGPD_REQUEST_SLA_DAYS` (default 15).
- Sujeito polimórfico `subjectType`/`subjectId` (`USER` | `PATIENT` | `LEAD`). Paciente/lead resolvers entram nos cards respectivos.

## Permissões

| Permissão | Papéis |
| --- | --- |
| `consent:read` / `consent:write` | OWNER, ADMIN, PROFESSIONAL, RECEPTION |
| `settings:write` | OWNER, ADMIN (criar/publicar termos) |
| `lgpd:manage` | OWNER, ADMIN |

`POST /lgpd/requests` com tipo `CONSENT_REVOCATION` aceita `consent:write`; demais tipos exigem `lgpd:manage`.

## Portas LGPD

Módulos registram exporters/anonymizers no `LgpdRegistry` (`onModuleInit`):

```ts
registry.registerExporter(myExporter)
registry.registerAnonymizer(myAnonymizer)
```

Neste card: implementação `users` (perfil, memberships do tenant, sessões, consentimentos, auditoria do ator nos últimos 12 meses).

`scripts/check-lgpd-ports.mjs` (parte de `check:standards`) exige registro quando pastas em `SUBJECT_DATA_MODULES` existirem (`patients`, `leads`, `clinical-record`, `finance`, `documents`).

## Retenção (D7)

Configuração em código (`apps/api/src/lgpd/retention-policy.ts`) — **sem purge no P0**:

| Categoria | Decisão P0 |
| --- | --- |
| CLINICAL_RECORD | RETAIN ~20 anos (orientação CFM/COFFITO) |
| FINANCIAL | RETAIN 5 anos |
| CONSENT / AUDIT | RETAIN (histórico obrigatório) |
| USER_PROFILE | ANONYMIZE se sem membership ativa; senão RETAIN |

Anonimização de usuário: nome → `Usuário removido`, e-mail → `deleted+<id>@anon.clivyra.local`, remove `passwordHash`, revoga sessões; **não** apaga `AuditLog` nem `ConsentRecord`.

## O que a exclusão faz / não faz

- Faz: anonimiza o que a política permite; registra `RETAIN` com justificativa; audita.
- Não faz: apagar consentimentos, auditoria, prontuário sob retenção legal; purge automático.

Artefato de exportação: inline auditado até `FileStoragePort` (CLI-16).

## Textos-modelo

Seed cria rascunhos `PRIVACY_POLICY` e `DATA_PROCESSING`. **Revisão jurídica obrigatória** antes de uso em produção comercial.

## Variáveis

| Variável | Default | Descrição |
| --- | --- | --- |
| `LGPD_REQUEST_SLA_DAYS` | `15` | Prazo da requisição do titular |

## APIs

Ver `docs/sprint-1/specs/CLI-15-consent-lgpd.md` §5.5.
