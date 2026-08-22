# Arquitetura inicial

O Clivyra usa um monorepo npm workspaces. A web é uma PWA em Next.js e a API é NestJS; PostgreSQL/Prisma persistem dados.

Fluxo: `Next.js PWA → NestJS API → Prisma → PostgreSQL`.

Antes de existir qualquer entidade de negócio, as próximas sprints devem introduzir tenant context, autenticação, RBAC e auditoria. Nenhuma consulta de recurso pertencente a tenant poderá ocorrer sem o tenant resolvido pelo contexto autenticado.
