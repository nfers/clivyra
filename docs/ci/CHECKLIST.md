# CI pipeline — checklist de execução

Espelho operacional do [plano](./PIPELINE_IMPLEMENTATION_PLAN.md). Marcar conforme for entregue.

## Fase 0 — Pré-requisito

- [ ] Merge monorepo bootstrap (CLI-5)
- [ ] Scripts root: `lint`, `typecheck`, `test`, `test:e2e`
- [ ] Actions billing OK

## Fase 1 — Split do PR gate

- [ ] Job `lint-and-standards`
- [ ] Job `typecheck`
- [ ] Job `unit-tests` (`npm run test:unit`)
- [ ] `gate-result` agrega os três + security
- [ ] Atualizar `.github/CI.md`

## Fase 2 — Boas práticas

- [ ] Prettier + `format:check`
- [ ] ESLint boundaries / typescript-eslint reforçado
- [ ] `npm run check:standards` (tenant input, LLM SDK denylist)
- [ ] Step no job de lint

## Fase 3 — Integração

- [ ] `apps/api/test/integration/`
- [ ] `test:integration` + `db:migrate:deploy`
- [ ] Job Actions com service `postgres:16`
- [ ] Casos: health, cross-tenant, 401, validation 400
- [ ] Entrar no `gate-result`

## Fase 4 — E2E no gate

- [ ] Job `e2e` (Playwright) no PR ou CI push
- [ ] `needs`: lint, typecheck, unit
- [ ] Artefatos em falha (trace/screenshot) sem PII clínico
- [ ] Smoke + 1 fluxo domínio Given/When/Then

## Fase 5 — Deploy

- [ ] Environments `dev` / `prod` protegidos
- [ ] Deploy OCI só com gate verde
- [ ] Dockerfile produção alinhado

## Fase 6 — Endurecimento

- [ ] Coverage threshold em pacotes críticos
- [ ] Cache npm/Playwright
- [ ] Dependabot / CodeQL
- [ ] Path filters opcionais para E2E
