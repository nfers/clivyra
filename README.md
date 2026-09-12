# Clivyra

Monorepo do Clivyra: PWA mobile-first para gestão de clínicas e studios.

## Estrutura

- `apps/web`: Next.js PWA
- `apps/api`: NestJS API
- `packages/shared`: utilitários sem dependência de domínio
- `packages/types`: contratos compartilhados
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

## Qualidade

Execute antes de abrir PR: `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e`.

## Segurança

Entidades de negócio devem ter `tenantId`; a API sempre o resolve da sessão autenticada. Nunca registre senhas, tokens, prontuários ou PII sensível em logs.
