# Spec — CLI-21 Importação inicial de pacientes e deduplicação

| Campo | Valor |
| --- | --- |
| Linear | [CLI-21](https://linear.app/clivyra/issue/CLI-21/sprint-2-importacao-inicial-de-pacientes-e-deduplicacao) — High — Backlog |
| Pai | — (milestone Sprint 2; **não-P0**, ver plano §1.2) |
| Branch | `feat/CLI-21-patient-import` (a partir de `master` após merge de CLI-17; paralelo a CLI-18/19/20) |
| Depende de | CLI-17 (`PatientsService.create`, validadores, `PatientDuplicatesService`, `Patient.importId`), CLI-13/14; **fase 2**: CLI-15 (`ConsentRecord source=IMPORT`) |
| Bloqueia | CLI-50, CLI-51; migração do Studio Vega |
| Decisões em aberto | D12 (XLSX), D16 (retenção das linhas) |

## 1. Objetivo

Migrar os cadastros atuais do studio (planilhas) com segurança: upload CSV (XLSX opcional), mapeamento de colunas, preview com validação de CPF/telefone/e-mail e detecção de duplicados, revisão de erros **antes** de concluir, commit por lote em que nenhuma linha inválida interrompe as demais, relatório final, idempotência básica e auditoria — sem persistir o arquivo e sem manter PII bruta além do necessário.

## 2. Escopo

### Dentro

- `PatientImport` (estado do processo) + `PatientImportRow` (linhas normalizadas, erros, duplicados, decisão e resultado).
- Upload multipart com limites (bytes, linhas, colunas, tamanho de célula), magic bytes e detecção de encoding/delimitador; parse em **streaming** para CSV; arquivo descartado após o parse.
- Mapeamento de colunas com sugestão automática por cabeçalho (sinônimos pt-BR) e templates CSV para download.
- Preview paginado: linhas válidas, com erro, com duplicado provável/exato; decisão por linha (`IMPORT`/`SKIP`); edição pontual de célula no preview (corrigir um CPF digitado errado sem reenviar).
- Commit assíncrono em lotes com transação por lote e isolamento por linha; relatório com contagens e lista de erros (download CSV com `csvSafeCell`).
- Idempotência: `fileHash` único por tenant (mesmo arquivo → mesma importação); linhas duplicadas por CPF/telefone → `DUPLICATE_SKIPPED`.
- Retenção (D16): limpeza de `raw`/`normalized` das linhas criadas no commit; purga completa após N dias ou sob demanda.
- Permissão `clients:import` (OWNER/ADMIN); auditoria do processo.
- Web wizard mobile-friendly (desktop é o caso principal, mas funcional no celular).

### Fora

- Merge de duplicados (atualizar paciente existente com dados da planilha) — P0 só `SKIP`; `MERGE` é follow-up.
- Importação de agenda, planos, financeiro, prontuário — cada módulo terá o seu (reutilizando esta infraestrutura).
- Integração com Google Sheets/Drive.
- Agendamento/recorrência de importações.
- Persistência do arquivo original (nem em storage).
- OCR/PDF.

## 3. Critérios de aceite → verificação

| Critério | Prova |
| --- | --- |
| Importação não cria duplicidade óbvia dentro do tenant | Preview marca `duplicateOf` (exato por CPF/telefone; provável por nome+nascimento); commit reaplica a checagem e a constraint do banco (`P2002 → DUPLICATE_SKIPPED`); duplicatas **dentro do arquivo** também detectadas; integração com planilha contendo repetições |
| Usuário revisa erros antes de concluir | `commit` só de `PREVIEWED`; `409 IMPORT_NOT_REVIEWED` se houver linhas com erro sem decisão `SKIP`; E2E passa pelo preview |
| Importações ficam auditadas | `patient.import.uploaded\|mapped\|committed\|cancelled\|purged`; `Patient.importId` liga cada paciente à importação; timeline do 360 mostra "Importado em …" |
| Nenhum registro inválido interrompe todo o lote | Commit por lote com `try/catch` por linha; linha `FAILED` não afeta as demais; integração com 1 linha que viola constraint no meio do lote |
| (CLI-51) Arquivos inválidos ou maliciosos são rejeitados | Magic bytes, extensão, tamanho, colunas, linhas, células; XLSX só com flag; testes com polyglot, zip bomb (limite antes de descomprimir), CSV com `=HYPERLINK` |
| (CLI-51) PII não aparece em logs | Logs só com `importId`, contagens e códigos; `raw` nunca logado nem em auditoria |

## 4. Modelo de dados

```prisma
enum PatientImportStatus {
  UPLOADED      // arquivo parseado, linhas em raw, aguardando mapeamento
  MAPPED        // mapeamento salvo, linhas normalizadas/validadas
  PREVIEWED     // usuário abriu o preview (marca de revisão)
  COMMITTING    // commit em andamento
  COMMITTED
  FAILED        // erro sistêmico (não de linha)
  CANCELLED
}

enum PatientImportFormat {
  CSV
  XLSX
}

enum ImportRowDecision {
  IMPORT
  SKIP
}

enum ImportRowResult {
  PENDING
  CREATED
  SKIPPED             // decisão do usuário
  DUPLICATE_SKIPPED   // duplicado exato detectado no commit
  INVALID             // erros de validação não resolvidos (só se decision=IMPORT forçado — não permitido; fica PENDING até SKIP)
  FAILED              // erro inesperado na linha
}

model PatientImport {
  id               String               @id @default(cuid())
  tenantId         String
  status           PatientImportStatus  @default(UPLOADED)
  format           PatientImportFormat
  fileName         String                             // sanitizado (basename, ≤ 120, sem caracteres de controle)
  fileHash         String                             // sha256 do conteúdo
  fileSizeBytes    Int
  delimiter        String?                            // CSV: ',' ';' '\t'
  encoding         String?                            // 'utf-8' | 'latin1'
  headers          Json                               // string[] originais (neutralizados com csvSafeCell)
  mapping          Json?                              // { [targetField]: sourceColumnIndex } + opções (dateFormat, defaultServiceType, defaultStatus)
  totalRows        Int
  validRows        Int                  @default(0)
  invalidRows      Int                  @default(0)
  duplicateRows    Int                  @default(0)
  importedRows     Int                  @default(0)
  skippedRows      Int                  @default(0)
  failedRows       Int                  @default(0)
  errorCode        String?                            // em FAILED (código, não mensagem interna)
  createdByUserId  String
  committedAt      DateTime?
  purgedAt         DateTime?                          // raw/normalized removidos de todas as linhas
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt
  tenant           Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  rows             PatientImportRow[]

  @@unique([tenantId, fileHash])
  @@index([tenantId, status, createdAt(sort: Desc)])
}

model PatientImportRow {
  id           String             @id @default(cuid())
  tenantId     String
  importId     String
  rowNumber    Int                                    // 1-based, linha do arquivo (sem cabeçalho)
  raw          Json?                                  // string[] células neutralizadas; NULL após commit (CREATED/SKIPPED) ou purga
  normalized   Json?                                  // CreatePatientInput parcial após mapeamento; NULL após commit/purga
  errors       Json?                                  // [{ field, code, message }] — mensagens pt-BR sem eco do valor
  duplicateOf  Json?                                  // { patientId?, rowNumber?, matchedBy: 'CPF'|'PHONE'|'NAME_BIRTHDATE', confidence: 'EXACT'|'PROBABLE' }
  decision     ImportRowDecision  @default(IMPORT)
  result       ImportRowResult    @default(PENDING)
  patientId    String?                                // FK → Patient quando CREATED
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  import       PatientImport      @relation(fields: [importId], references: [id], onDelete: Cascade)

  @@unique([importId, rowNumber])
  @@index([tenantId, importId, result])
}
```

Notas:

- Ambos em `TENANT_OWNED_MODELS`. `PatientImportRow` com `tenantId` redundante; `onDelete: Cascade` da importação (purga total apaga linhas). Pacientes criados **não** são afetados: `Patient.importId` é FK com `onDelete: SetNull`; `Patient.externalId`, `PatientStatusHistory origin=IMPORT` e a auditoria permanecem como rastro.
- `raw` e `normalized` contêm PII bruta: nunca em logs, auditoria ou respostas de listagem (só no preview, paginado, para `clients:import`).
- Migration aditiva; adiciona FK `Patient.importId → PatientImport.id (SetNull)` prevista em CLI-17.

## 5. Design

### 5.1 Módulos e arquivos

```text
packages/shared/src/csv-safety.ts            # csvSafeCell (CLI-17 já cria; aqui é consumido)
packages/types/src/patient-import.ts         # enums, IMPORT_TARGET_FIELDS, ColumnMapping, ImportPreviewRowView, ImportReportView, labels pt-BR

apps/api/src/patient-import/
  patient-import.module.ts
  patient-import.controller.ts
  patient-import.service.ts                  # orquestra estados
  patient-import.repository.ts
  dto/upload.dto.ts, mapping.dto.ts, preview-query.dto.ts, row-decision.dto.ts, row-edit.dto.ts
  upload/upload.guard.ts                     # limites de bytes/tipo antes do parse (multer memoryStorage com limits)
  upload/file-sniffer.ts                     # magic bytes, encoding, delimitador, BOM
  parsers/csv.parser.ts                      # csv-parse em streaming com limites de linhas/colunas/célula
  parsers/xlsx.parser.ts                     # exceljs (flag D12), primeira aba, limites
  mapping/column-mapper.ts                   # sugestão por sinônimos; validação do mapping
  mapping/row-normalizer.ts                  # raw → CreatePatientInput + errors (reusa packages/shared/br)
  dedupe/import-dedupe.service.ts            # intra-arquivo + contra o banco (PatientDuplicatesService)
  commit/import-committer.ts                 # lotes, transação por lote, isolamento por linha, progresso
  report/import-report.service.ts            # contagens + CSV de erros (csvSafeCell)
  retention/import-retention.service.ts      # limpeza no commit e purga por idade
  templates/patients-template.csv            # modelo para download

apps/web/app/(app)/app/pacientes/importar/page.tsx          # wizard (steps por query ?step=)
apps/web/components/patient-import/{upload-step,mapping-step,preview-step,commit-step,report-step}.tsx
apps/web/components/patient-import/preview-table.tsx        # virtualizada; edição de célula
apps/web/app/api/patient-imports/**                          # BFF (multipart passthrough)
```

Dependências novas (avaliar licença/vulnerabilidades antes de adicionar — Sonatype/`npm audit`): `csv-parse` (MIT, sem nativo). `exceljs` (MIT) **somente** se D12 aprovar; alternativa é manter XLSX fora e orientar "salvar como CSV". `multer` já está em `overrides` (2.3.0).

### 5.2 Permissões

| Permissão | OWNER | ADMIN | PROFESSIONAL | RECEPTION |
| --- | :-: | :-: | :-: | :-: |
| `clients:import` (**nova**) | ✓ | ✓ | – | – |

Todas as rotas deste módulo exigem `clients:import`; o commit exige também `clients:write` (cria pacientes).

### 5.3 Endpoints

| Método/rota | Notas |
| --- | --- |
| `GET /patient-imports?status&cursor` | Lista do tenant (sem `raw`); contagens e status |
| `POST /patient-imports` (multipart `file`) | `UploadGuard`: `Content-Length` ≤ `PATIENT_IMPORT_MAX_BYTES`, extensão `.csv`/`.xlsx`, `file-sniffer` (magic bytes; XLSX exige flag); parse em streaming com limites → cria `PatientImport UPLOADED` + linhas `raw`; `fileHash` já existente e não `FAILED/CANCELLED` → `409 IMPORT_DUPLICATE_FILE { importId }`; resposta `{ importId, headers, sampleRows: 5, suggestedMapping, totals }`; erros: `413 IMPORT_FILE_TOO_LARGE`, `415 IMPORT_UNSUPPORTED_TYPE`, `400 IMPORT_TOO_MANY_ROWS\|COLUMNS`, `400 IMPORT_ENCODING_UNKNOWN`, `400 IMPORT_EMPTY` |
| `GET /patient-imports/:id` | Estado + contagens + `mapping` |
| `POST /patient-imports/:id/mapping { mapping, options }` | Valida (campos obrigatórios `fullName`, `serviceType` ou `options.defaultServiceType`; coluna usada uma vez; formato de data); normaliza e valida **todas** as linhas (síncrono até 5.000; progresso via polling se > 1 s); dedupe intra-arquivo e contra o banco; status `MAPPED`; recontagens |
| `GET /patient-imports/:id/preview?only=all\|errors\|duplicates\|valid&cursor&limit≤100` | `ImportPreviewRowView { rowNumber, normalized (CPF/telefone mascarados), errors, duplicateOf (displayName do existente, mascarado), decision, result }`; primeira chamada marca `PREVIEWED` |
| `PATCH /patient-imports/:id/rows/:rowNumber { decision }` | `IMPORT`/`SKIP`; `SKIP` em massa via `POST /patient-imports/:id/rows/skip { only: 'errors' \| 'duplicates' }` |
| `PATCH /patient-imports/:id/rows/:rowNumber/cells { field, value }` | Edita um campo normalizado (ex.: corrige CPF); revalida a linha e sua deduplicação; permitido em `MAPPED/PREVIEWED` |
| `POST /patient-imports/:id/commit` | Pré-condições: status `PREVIEWED`; nenhuma linha com `errors` e `decision=IMPORT` (`409 IMPORT_NOT_REVIEWED { pendingRows }`); nenhum duplicado `EXACT` com `decision=IMPORT` (`409 IMPORT_DUPLICATES_PENDING`); duplicado `PROBABLE` pode seguir. Muda para `COMMITTING` e dispara `ImportCommitter` (assíncrono em processo); `202 { importId }` |
| `GET /patient-imports/:id/progress` | `{ status, processed, total, importedRows, skippedRows, duplicateRows, failedRows }` para polling (2 s) |
| `GET /patient-imports/:id/report` | `ImportReportView` + `GET .../report.csv` (linhas não criadas com `rowNumber`, motivo, campos mascarados; células via `csvSafeCell`; `Content-Disposition: attachment`) |
| `POST /patient-imports/:id/cancel` | De `UPLOADED/MAPPED/PREVIEWED`; apaga linhas; `CANCELLED` |
| `DELETE /patient-imports/:id/rows` | Purga antecipada de `raw`/`normalized` (após `COMMITTED`); `purgedAt` |
| `GET /patient-imports/template.csv` | Modelo com cabeçalhos e uma linha de exemplo sintética |
| `GET /patient-imports/limits` | `{ maxBytes, maxRows, maxColumns, xlsxEnabled, xlsxMaxBytes, maxOpenImports }` para a UI exibir os limites efetivos |

Mutações `@Audited` (`patient-import` em `SENSITIVE_MODULES`).

### 5.4 Regras de negócio

**Upload e parse (`UploadGuard`, `FileSniffer`, parsers)**

- Rejeita antes de ler o corpo: `Content-Length` acima do limite (`413`); multer `limits.fileSize` como segunda barreira; `files: 1`; nome de campo fixo `file`.
- `FileSniffer`: lê os primeiros 512 bytes; XLSX exige `50 4B 03 04` **e** entradas `[Content_Types].xml`/`xl/` no zip; CSV exige texto sem bytes `NUL`, detecta BOM UTF-8, tenta `utf-8` e cai para `latin1` (planilhas BR); delimitador por contagem em 20 linhas (`;` comum no Excel pt-BR). Extensão e magic bytes têm que concordar (`.csv` com zip → `415`).
- CSV em streaming (`csv-parse` com `relax_column_count`, `skip_empty_lines`, `bom`); aborta ao exceder `PATIENT_IMPORT_MAX_ROWS` (`400`, nada persistido), `PATIENT_IMPORT_MAX_COLUMNS` ou célula > 500 chars (truncada e marcada com erro `CELL_TOO_LONG`).
- XLSX (D12): só a primeira aba; `exceljs` carrega em memória — limite de bytes já garante teto; fórmulas são lidas como **valor calculado** e o texto de fórmula é descartado; datas do Excel convertidas com fuso do tenant. Se a flag estiver desligada → `415 IMPORT_XLSX_DISABLED` com dica.
- Cada célula passa por `trim`, remoção de caracteres de controle e `csvSafeCell()` **na leitura** (prefixa `'` em células que começam com `= + - @ \t \r`) — o valor armazenado em `raw` já é inofensivo; `row-normalizer` remove o `'` de campos numéricos/data antes de validar e **rejeita** nomes que comecem por esses caracteres (`INVALID_NAME`).
- O buffer do arquivo é descartado após o parse (sem storage, sem tmp em disco: `memoryStorage`). Se o processo cair no meio, não há importação parcial (linhas inseridas em uma transação).
- `fileHash = sha256(conteúdo)`; `fileName` sanitizado (só basename, sem path).

**Mapeamento (`ColumnMapper`)**

- Campos-alvo (`IMPORT_TARGET_FIELDS`): `fullName`*, `socialName`, `cpf`, `birthDate`, `email`, `phone`, `secondaryPhone`, `address.line1/line2/city/state/postalCode`, `emergencyContact.name/phone/relationship`, `source`, `sourceDetail`, `serviceType`, `status`, `notes`, `externalId`, `consent` (fase 2). `*` obrigatório.
- Sugestão automática por sinônimos normalizados (`nome`, `nome completo`, `paciente`, `aluno` → `fullName`; `cpf`, `documento` → `cpf`; `celular`, `whatsapp`, `telefone`, `fone` → `phone`; `nascimento`, `data de nascimento`, `dt nasc` → `birthDate`; `e-mail`, `email` → `email`; `origem`, `como conheceu` → `source`; `serviço`, `modalidade`, `tipo` → `serviceType`; `situação`, `status` → `status`; `obs`, `observações` → `notes`; `id`, `código`, `matrícula` → `externalId`).
- `options`: `dateFormat` (`DD/MM/YYYY` default, `YYYY-MM-DD`, `MM/DD/YYYY`), `defaultServiceType`, `defaultStatus` (default `ACTIVE`; a planilha atual é de alunos/pacientes ativos), `statusMap` (valores da planilha → `PatientStatus`, sugeridos por sinônimos: "ativo", "inativo", "pausa", "alta", "cancelado", "ex-aluno", "lead"), `serviceTypeMap`, `sourceMap`, `phoneCountry` (`BR`).
- Uma coluna só pode alimentar um campo; mapping inválido → `400` com lista.

**Normalização e validação (`RowNormalizer`)**

- Reusa `packages/shared/src/br` (mesmas regras de CLI-17). Erros com `code` (`INVALID_CPF`, `INVALID_PHONE`, `INVALID_EMAIL`, `INVALID_DATE`, `FUTURE_DATE`, `INVALID_STATUS`, `INVALID_SERVICE_TYPE`, `NAME_REQUIRED`, `NAME_TOO_SHORT`, `CELL_TOO_LONG`, `INVALID_NAME`, `INVALID_STATE`, `INVALID_POSTAL_CODE`) e mensagem pt-BR **sem ecoar o valor** (o valor está na própria linha do preview).
- Linha sem nenhum dado além do nome é válida (paciente mínimo).
- `status` mapeado para `LEAD_STATUSES` cria paciente lead **sem** `Lead` (CLI-18 permite anexar depois via `POST /leads { patientId }`); fase 2 pode criar o `Lead` automaticamente quando CLI-18 estiver mergeado (`options.createLeads=true`).

**Deduplicação (`ImportDedupeService`)**

- Intra-arquivo: índice em memória por `cpf` e `phone` normalizados; a segunda ocorrência recebe `duplicateOf { rowNumber, matchedBy, confidence: 'EXACT' }` e `decision=SKIP` sugerida.
- Contra o banco: `PatientDuplicatesService` (CLI-17) em lote (`WHERE tenantId AND cpf IN (...)`, `phone IN (...)`, chunks de 500) → `EXACT`; nome+nascimento → `PROBABLE` (sugestão, `decision=IMPORT` mantida).
- Arquivados são ignorados na checagem (podem ser recriados; a constraint parcial permite).
- Recontagem após cada edição de célula.

**Commit (`ImportCommitter`)**

- Executa em processo (`setImmediate`/fila em memória; um commit por importação, lock otimista pelo status `COMMITTING`). Se a API reiniciar durante o commit, status fica `COMMITTING` com `processed < total`; `GET /progress` detecta ausência de worker (heartbeat `updatedAt` > 60 s) e oferece **retomar** (`POST /commit` de novo é idempotente: pula linhas com `result ≠ PENDING`).
- Cada linha roda em sua **própria** transação curta (`Patient.create` + `PatientStatusHistory` + atualização da `PatientImportRow`). Postgres aborta a transação inteira em erro de constraint, então uma transação por lote violaria "nenhuma linha inválida interrompe o lote"; o "lote" de 200 linhas é apenas unidade de progresso/heartbeat. Por linha, em `try/catch`:
  - `decision=SKIP` → `SKIPPED`;
  - `PatientsService.create(normalized, { origin: 'IMPORT', importId, actor })` com `allowSharedPhone=false`;
  - `P2002` (unique de CPF/telefone) → `DUPLICATE_SKIPPED` com `duplicateOf` do existente (via `check-duplicates`);
  - qualquer outro erro → `FAILED` com `errors=[{ code: 'UNEXPECTED' }]`, log `error` com `requestId`/`importId`/`rowNumber` (sem dados); as linhas seguintes continuam.
- `PatientStatusHistory` inicial com `origin=IMPORT`; **sem** `AuditLog patient.created` por linha (plano §12) — rastreabilidade via `importId` + `patient.import.committed` com contagens.
- Ao terminar: `COMMITTED`, `committedAt`, contagens; `ImportRetentionService.afterCommit` zera `raw`/`normalized` das linhas `CREATED`/`SKIPPED`/`DUPLICATE_SKIPPED` (mantém `errors`/`duplicateOf` para o relatório); linhas `FAILED` mantêm `raw` até a purga.

**Relatório e retenção**

- `ImportReportView { totals, byResult, errorsByCode, sample: primeiras 50 linhas não criadas (mascaradas) }`; CSV completo com `rowNumber, result, code, fullName, cpfMasked, phoneMasked`.
- `ImportRetentionService.purgeExpired(tenantId)`: apaga `raw`/`normalized` de importações `COMMITTED/CANCELLED/FAILED` com `updatedAt < now − PATIENT_IMPORT_ROW_RETENTION_DAYS`; chamado no início de cada `POST /patient-imports` do tenant e via `DELETE /rows`; job agendado é follow-up (`@nestjs/schedule` fora do P0).

### 5.5 Web (wizard `/app/pacientes/importar?step=upload|mapping|preview|commit|report&importId=`)

1. **Upload**: área de arrastar/soltar + botão; texto com limites efetivos (lidos de `GET /patient-imports/limits`); link "Baixar modelo CSV"; dica "No Excel: Salvar como → CSV UTF-8" quando XLSX desligado. Progresso de envio. Erros com mensagens do `code`.
2. **Mapeamento**: tabela coluna da planilha → campo (select) com sugestões pré-selecionadas e amostra de 3 valores por coluna; opções (formato de data, serviço padrão, status padrão, mapas de status/serviço/origem com os valores distintos encontrados); "Validar" → `POST /mapping`.
3. **Preview**: resumo (válidas / com erro / duplicadas); filtros; tabela virtualizada com badge por linha, erros por célula com tooltip, edição inline de célula (`PATCH /cells`), decisão por linha e ações em massa ("Pular todas com erro", "Pular duplicadas exatas"); CPF/telefone mascarados com "revelar" por célula (sem auditoria — é dado da planilha ainda não persistido como paciente; o preview inteiro exige `clients:import`).
4. **Confirmar**: checklist ("X pacientes serão criados, Y pulados, Z duplicados ignorados"); botão só habilita quando `commit` seria aceito (mesma regra do servidor, pré-checada no cliente).
5. **Progresso**: barra com polling; botão "Retomar" quando o worker parou.
6. **Relatório**: contagens, tabela de não criados, download CSV, "Abrir pacientes importados" (busca com `importId` — filtro `importId` registrado em CLI-19 por este card).

Retomável: entrar em `/importar?importId=` leva ao passo correspondente ao `status`.

## 6. Segurança e LGPD

| Ameaça | Controle |
| --- | --- |
| Upload grande / zip bomb | `Content-Length` + `multer.limits` antes do parse. XLSX (só com flag) tem teto próprio `PATIENT_IMPORT_XLSX_MAX_BYTES` (2 MB) e, antes de inflar, o tamanho descomprimido declarado no *central directory* do zip é somado; acima de 50 MB → `413 IMPORT_FILE_TOO_LARGE`. `exceljs` infla em memória, por isso o teto comprimido sozinho não basta |
| Polyglot / extensão enganosa | Magic bytes **e** extensão devem concordar; XLSX valida estrutura do pacote; CSV rejeita `NUL` |
| Formula injection (planilhas do studio exportadas depois) | `csvSafeCell` na leitura e em todo CSV gerado (`report.csv`, `template.csv`); nomes que começam com `= + - @` rejeitados |
| XXE / entidades externas em XLSX | `exceljs` usa parser SAX sem resolver entidades externas — confirmar na avaliação da dependência; se não, XLSX fica fora |
| PII bruta em `raw`/`normalized` | Só visível no preview para `clients:import`; nunca em logs/auditoria/listagens; limpeza no commit; purga por idade (D16); `redaction.ts` cobre chaves `raw`, `normalized`, `cpf`, `phone` |
| Cross-tenant | Extension em `PatientImport`/`PatientImportRow`; `fileHash` unique **por tenant** (mesmo arquivo pode ser importado por tenants diferentes); `404` |
| IDOR em `rows/:rowNumber` | Linha resolvida por `(importId do tenant, rowNumber)`; `404` |
| Escalada via `status` da planilha | `statusMap` só para valores de `PatientStatus`; `defaultStatus` validado; nunca cria `Membership`/usuário |
| Mass assignment | `normalized` construído pelo `RowNormalizer` a partir do mapping — nunca do body; `PATCH /cells` só aceita `field ∈ IMPORT_TARGET_FIELDS` |
| DoS por processamento | Máx. 1 importação `COMMITTING` por tenant; máx. 3 importações abertas (`UPLOADED/MAPPED/PREVIEWED`) por tenant (`429 IMPORT_TOO_MANY_OPEN`); rate limit 5 uploads/hora por usuário |
| Reprocessamento acidental | `fileHash` unique; commit idempotente por `result ≠ PENDING` |
| Dado clínico em `notes` da planilha | Aviso no mapeamento ("Observações não devem conter informações clínicas"); heurística de alerta é follow-up |
| Consentimento | Pacientes importados ficam `MISSING` (CLI-15); banner no 360; fase 2 mapeia coluna `consent` → `ConsentRecord source=IMPORT` com `evidence.signerName` = quem importou |

## 7. Observabilidade

- Logs: `patient_import.uploaded{format, totalRows, sizeBytes, encoding}`, `patient_import.rejected{code}`, `patient_import.committed{importedRows, skippedRows, duplicateRows, failedRows, durationMs}`, `patient_import.row_failed{rowNumber, code}`; sem células.
- Métricas: taxa de duplicidade detectada por importação (hipótese do piloto), tempo de commit por 1k linhas.

## 8. Testes

### Unit

- `FileSniffer`: BOM, UTF-8 vs latin1, delimitadores `, ; \t`, zip válido/inválido, `.csv` com conteúdo zip, `NUL`.
- `csv.parser`: limites de linhas/colunas/célula, `relax_column_count`, linhas vazias, aspas escapadas.
- `csvSafeCell`: `= + - @ \t \r`, células normais intactas, idempotência.
- `ColumnMapper`: sinônimos, coluna repetida, obrigatórios, `statusMap` com valor desconhecido.
- `RowNormalizer`: cada `code`; datas nos 3 formatos; telefone com/sem DDD; nome com `=`; célula longa.
- `ImportDedupeService`: intra-arquivo (CPF e telefone), contra banco (mock), `PROBABLE` por nome+nascimento, arquivados ignorados.
- `ImportCommitter`: `SKIP`, `P2002 → DUPLICATE_SKIPPED`, erro inesperado → `FAILED` sem parar, idempotência (`result ≠ PENDING` pulado), heartbeat.
- `ImportRetentionService`: limpeza pós-commit por resultado; purga por idade.

### Integração (`patient-import.integration.spec.ts`)

| Cenário | Esperado |
| --- | --- |
| RECEPTION A `POST /patient-imports` | `403` |
| ADMIN A CSV válido (`;`, latin1, 20 linhas) | `201`; `UPLOADED`; `headers` e `suggestedMapping` corretos; `AuditLog patient.import.uploaded{format,totalRows}` sem células |
| Mesmo arquivo de novo | `409 IMPORT_DUPLICATE_FILE { importId }` |
| Mesmo arquivo em B | `201` |
| Arquivo 6 MB | `413` antes do parse |
| `.csv` com magic bytes de zip | `415` |
| `.xlsx` com flag desligada | `415 IMPORT_XLSX_DISABLED` |
| CSV com 5.001 linhas | `400 IMPORT_TOO_MANY_ROWS`; nenhuma linha persistida |
| CSV com célula `=HYPERLINK("http://x")` em nome | linha com `INVALID_NAME`; `raw` armazenado com `'` |
| `POST /mapping` sem `fullName` | `400` |
| `POST /mapping` válido com 2 CPFs iguais no arquivo, 1 CPF já em A, 1 CPF inválido, 1 telefone de paciente de B | duplicado intra-arquivo `EXACT`; duplicado do banco `EXACT`; `INVALID_CPF`; telefone de B **não** marcado (cross-tenant) |
| `POST /commit` direto de `MAPPED` | `409` (não `PREVIEWED`) |
| `GET /preview` → `POST /commit` com erro pendente | `409 IMPORT_NOT_REVIEWED { pendingRows }` |
| `POST /rows/skip { only: 'errors' }` + `POST /rows/skip { only: 'duplicates' }` → `POST /commit` | `202`; após conclusão `COMMITTED`; `importedRows` = válidas; pacientes com `importId`, `PatientStatusHistory origin=IMPORT`; `AuditLog patient.import.committed` com contagens; **nenhum** `patient.created` |
| Linha que viola constraint no commit (paciente criado manualmente entre preview e commit) | `DUPLICATE_SKIPPED`; demais `CREATED` |
| Linha que dispara erro inesperado (mock) no meio | `FAILED`; anteriores e posteriores `CREATED` |
| Após commit | linhas `CREATED` com `raw=null`; `FAILED` com `raw` presente |
| `POST /commit` de novo após conclusão | `200` idempotente, nada muda |
| `GET /report.csv` | `Content-Disposition: attachment`; células perigosas prefixadas; CPF mascarado |
| `PATCH /cells` corrigindo CPF inválido | erro removido; dedupe recalculado |
| `DELETE /rows` | `purgedAt`; `raw/normalized` nulos em todas |
| `GET /patient-imports/:idDeB` em A | `404` |
| 4.ª importação aberta em A | `429 IMPORT_TOO_MANY_OPEN` |

### E2E

```gherkin
Funcionalidade: Importação de pacientes
  Cenário: importar planilha com preview e erros
    Dado um ADMIN autenticado em "studio-a"
    Quando envia o CSV sintético "pacientes-vega-exemplo.csv" (10 linhas: 7 válidas, 1 CPF inválido, 1 duplicada no arquivo, 1 já cadastrada)
    E aceita o mapeamento sugerido e valida
    Então vê "7 válidas, 1 com erro, 2 duplicadas"
    Quando pula as linhas com erro e as duplicadas
    E confirma a importação
    Então vê o relatório com "7 pacientes criados"
    E a busca de pacientes encontra "Paciente Import 1"

  Cenário: arquivo inválido é rejeitado
    Quando envia um arquivo .csv que na verdade é um zip
    Então vê "Tipo de arquivo não suportado"

  Cenário: recepção não acessa a importação
    Dada uma RECEPTION autenticada
    Quando acessa /app/pacientes/importar
    Então vê "Sem permissão"

  Cenário: isolamento entre tenants
    Dada uma importação I em "studio-b"
    Quando um ADMIN de "studio-a" acessa /app/pacientes/importar?importId=<I>
    Então vê "Importação não encontrada"
```

Artefatos: CSVs de teste em `tests/e2e/fixtures/` com dados sintéticos gerados; nenhum arquivo real do Studio Vega no repositório.

## 9. Plano de execução

1. [ ] Branch `feat/CLI-21-patient-import` após merge de CLI-17. Confirmar D12 (avaliar `exceljs`: licença, `npm audit`, XXE) e D16.
2. [ ] Adicionar `csv-parse` (+ `exceljs` se D12); `packages/types/src/patient-import.ts`; `clients:import` no catálogo + matriz + teste; ações de auditoria + allowlists + labels.
3. [ ] Schema §4 + migration (FK `Patient.importId SetNull`); `TENANT_OWNED_MODELS`; `redaction.ts` (`raw`, `normalized`).
4. [ ] `UploadGuard`, `FileSniffer`, `csv.parser` (+ `xlsx.parser` atrás de flag), `ColumnMapper`, `RowNormalizer`, `ImportDedupeService`.
5. [ ] `PatientImportService` (estados), `ImportCommitter` (transação por linha, heartbeat, retomada), `ImportReportService`, `ImportRetentionService`, controller, DTOs; limites e rate limits.
6. [ ] `SENSITIVE_MODULES += 'patient-import'`; filtro `importId` em CLI-19 (provider deste módulo).
7. [ ] Template CSV; fixtures de CSV sintéticos (válido, com erros, com duplicatas, 5.001 linhas gerado em teste, polyglot).
8. [ ] Web: wizard (5 passos), tabela virtualizada, BFF multipart, retomada por `importId`.
9. [ ] Testes §8.
10. [ ] Fase 2 (CLI-15/18): coluna `consent`, `options.createLeads`.
11. [ ] Docs: `docs/patient-import.md` (formato, limites, mapeamento, dedupe, retenção, retomada), `README.md`, `.env.example`.
12. [ ] Validação mandatória.
13. [ ] PR `CLI-21 — Importação inicial de pacientes e deduplicação`.

## 10. Definition of Done

- [ ] Critérios da §3 provados em integração e E2E.
- [ ] Nenhum arquivo persistido; `raw`/`normalized` limpos no commit e purgáveis; nunca em logs/auditoria.
- [ ] Rejeição provada para: tamanho, tipo/magic bytes, linhas, colunas, XLSX sem flag, polyglot.
- [ ] `csvSafeCell` em toda leitura e geração de CSV.
- [ ] Commit isolado por linha; idempotente; retomável.
- [ ] Cross-tenant `404` em importação e linhas; dedupe nunca consulta outro tenant.
- [ ] Security review sem BLOCKER/HIGH.

## 11. Riscos e decisões

| Item | Nota |
| --- | --- |
| Não-P0 | Pode ser adiado; migração inicial do Studio Vega via seed controlado se necessário |
| XLSX (D12) | Só com avaliação da dependência e limites próprios; default desligado |
| Transação por linha vs. por lote | Postgres aborta a transação inteira em erro de constraint; a spec adota transação **por linha** para cumprir "nenhuma linha inválida interrompe o lote" — custo aceitável para ≤ 5k linhas |
| Worker em processo | Sem fila externa no P0; retomada idempotente cobre reinício; fila (Sprint 6, automações) pode assumir depois |
| Planilhas com colunas clínicas | Não há campo-alvo clínico; colunas não mapeadas são ignoradas e a UI avisa |
| `MERGE` de duplicados | Follow-up; no P0 o usuário pula e ajusta manualmente |
| Encoding latin1 mal detectado | Preview mostra amostra; usuário pode reenviar como UTF-8; heurística de caracteres inválidos |
