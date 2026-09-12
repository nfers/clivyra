# Clivyra domain checklist — review + E2E

Use este checklist ao validar implementações com a skill
`domain-rules-playwright`.

## Domain modules

Marque o módulo sob teste:

- [ ] Tenants / clínicas / studios
- [ ] Professionals
- [ ] Patients
- [ ] Leads / CRM
- [ ] Scheduling / appointments
- [ ] Pilates classes / attendance
- [ ] Plans / contracts
- [ ] Financial (payments, expenses)
- [ ] Clinical records / anamnesis / evaluation / evolution
- [ ] Documents
- [ ] Automations / integrations
- [ ] AI-assisted features (via AI Gateway only)

## Multi-tenancy (BLOCKER if fail)

- [ ] Entidade tenant-owned tem `tenantId`
- [ ] `tenantId` não é confiado do body/query/route/frontend
- [ ] Tenant resolve da sessão autenticada
- [ ] Toda query relevante inclui filtro de tenant
- [ ] Cenário Playwright de ID cruzado entre tenants (404/403, sem leak)
- [ ] Listagens não misturam dados de outro tenant

## Authorization

- [ ] Auth ≠ authz: permissão checada no backend
- [ ] Papéis cobertos: OWNER / ADMIN / PROFESSIONAL / RECEPTION
- [ ] Módulo sensível tem permissão independente (clínico, financeiro, users)
- [ ] Cenário negativo Playwright para papel sem permissão
- [ ] UI escondida não é a única proteção

## Business rule placement

- [ ] Regra no serviço/domínio/aplicação — não só controller
- [ ] Frontend não é a fonte da verdade da regra
- [ ] Validação server-side presente
- [ ] Invariantes de estado (ex.: contrato cancelado) cobertos

## LGPD / health data

- [ ] Minimização: só campos necessários no fluxo e no teste
- [ ] Sem PII/clínico real em fixtures
- [ ] Sem secrets/tokens em logs
- [ ] Trace/screenshot sem conteúdo clínico desnecessário
- [ ] Export/delete/anonymization respeitados se no escopo
- [ ] Nenhum envio indevido a LLM/terceiros

## AI features (if applicable)

- [ ] Chamada só via Clivyra AI Gateway
- [ ] Sem SDK vendor no domínio
- [ ] PII/health redigidos antes do provider
- [ ] Output da IA não executa ação privilegiada sem validação server-side

## Playwright coverage matrix

| Tipo | Presente? | Arquivo |
| --- | --- | --- |
| Happy path | | |
| Validation error | | |
| Authz failure | | |
| Tenant isolation | | |
| Persistence / reload | | |
| Regression of sibling rule | | |

## Verdict gate

Não marcar **VALIDADO** se:

- qualquer item de multi-tenancy crítico falhou
- regra de negócio principal está ausente ou invertida
- authz do fluxo sensível depende só do frontend
- testes E2E aplicáveis não rodaram com sucesso
- artefatos de teste expõem dados de saúde reais
