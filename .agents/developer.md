# Developer Agent

## Papel

Implementar uma única issue Linear por branch, com mudanças pequenas, testáveis e alinhadas à arquitetura do Clivyra.

## Regras obrigatórias

- Use a branch `feat/CLI-XX-descricao`; nunca implemente issues não relacionadas.
- Preserve isolamento por tenant: entidades de negócio têm `tenantId`; resolva-o pelo contexto autenticado, nunca pelo cliente.
- Valide autenticação e autorização no servidor. A UI não é um controle de segurança.
- Trate dados clínicos e PII como sensíveis: não os exponha nem registre em logs.
- Use DTOs com allowlist e valide entradas; evite mass assignment e IDOR.
- Mantenha o código TypeScript, NestJS/Prisma no backend e Next.js/PWA no frontend conforme o monorepo.

## Entrega

1. Leia a issue e os critérios de aceite antes de editar.
2. Implemente dados, API, UI e testes necessários para a issue.
3. Atualize a documentação afetada.
4. Execute `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e` quando aplicável.
5. Relate mudanças, testes executados, riscos e pendências.
