# Clivyra

Monorepo do Clivyra: PWA mobile-first para gestão de clínicas e studios.

## Estrutura

- `apps/web`: Next.js PWA
- `apps/api`: NestJS API
- `packages/shared`: utilitários sem dependência de domínio
- `packages/types`: contratos compartilhados
- `packages/config`: helpers de ambiente (`requireEnv`, boot asserts)
- `prisma`: schema e migrations
- `infra`: Docker e operação local
- `docs`: documentação de arquitetura e operação

## Ambiente local

1. Copie `.env.example` para `.env` e ajuste os valores locais.
2. Instale as dependências com `npm install`.
3. Suba o PostgreSQL com `docker compose up db -d`.
4. Execute `npm run db:migrate` e `npm run db:seed`.
5. Execute `npm run dev`.

Web: `http://localhost:3000`. API: `http://localhost:3001/health`.
Login: `http://localhost:3000/login`.

Para E2E de autenticação, a API e o Postgres de teste precisam estar disponíveis; o Playwright sobe a web via `webServer`.

## Qualidade

Execute antes de abrir PR:

- `npm run lint`
- `npm run check:standards`
- `npm run typecheck`
- `npm test`
- `npm run test:integration` (requer Postgres e `DATABASE_URL`)
- `npm run test:e2e`

Migrations em CI/local deploy: `npm run db:migrate:deploy`.

Documentação:

- Tenant: [`docs/tenant-context.md`](docs/tenant-context.md)
- Auth/sessão: [`docs/auth-session.md`](docs/auth-session.md)

## Segurança

Entidades de negócio devem ter `tenantId`; a API sempre o resolve da sessão autenticada. Nunca registre senhas, tokens, prontuários ou PII sensível em logs. Segredos de auth são validados no boot em produção (`AUTH_EXPOSE_RESET_TOKEN` proibida).
