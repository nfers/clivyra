# Playwright mapping — Given / When / Then

## File layout (prefer existing project conventions)

```text
apps/web/e2e/
  domain/
    patients/
      create-patient.spec.ts
      tenant-isolation.spec.ts
    contracts/
      cancel-blocks-scheduling.spec.ts
  support/
    auth.ts
    tenant.ts
    factories.ts
    steps/
      patients.ts
      contracts.ts
```

Se `apps/web` ainda não existir no branch atual, criar a skill coverage sob o
caminho Playwright já adotado pelo monorepo quando ele for bootstrapped
(`feat/CLI-5-bootstrap-monorepo` ou equivalente).

## Comment contract

Todo teste de domínio deve deixar explícito o BDD:

```ts
test('Scenario: ...', async ({ page }) => {
  // Given: ...
  // When: ...
  // Then: ...
});
```

Opcional: espelhar o Gherkin completo no topo do `describe`.

## Helpers

### Auth (Given)

```ts
// support/auth.ts
export async function loginAs(
  page: Page,
  opts: { role: Role; tenant: string },
) {
  // usa credenciais/fixtures de teste — nunca secrets de produção
}
```

### Tenant context

- Obter tenant da sessão de teste fixture
- Nunca aceitar `tenantId` “escolhido” pelo fluxo sob teste como fonte de verdade
- Para isolamento: seed de dois tenants + IDs conhecidos

### Factories

```ts
export function validPatient(overrides?: Partial<PatientInput>): PatientInput {
  return {
    name: `Paciente ${crypto.randomUUID().slice(0, 8)}`,
    phone: '11999990000',
    ...overrides,
  };
}
```

Dados sempre sintéticos. Sem CPF/prontuário real.

## Locators

Preferência:

1. `getByRole`
2. `getByLabel`
3. `getByTestId` só se o design system exigir
4. Evitar CSS/XPath frágeis

## Assertions that prove domain rules

| Regra | Assert bom | Assert fraco |
| --- | --- | --- |
| Criação | item na listagem + detalhe após reload | só toast |
| Authz | status 403/redirect + UI sem dados | botão ausente |
| Tenant | 404/403 ao abrir ID cruzado | “não vejo na lista” apenas |
| Validação | erro de campo + ausência de persistência | borda vermelha |
| Estado | transição de status visível e estável | texto genérico |

## Negative authz pattern

```ts
test('Scenario: PROFESSIONAL não cria despesa', async ({ page }) => {
  // Given
  await loginAs(page, { role: 'PROFESSIONAL', tenant: 'A' });

  // When
  const responsePromise = page.waitForResponse((r) =>
    r.url().includes('/expenses') && r.request().method() === 'POST',
  );
  await attemptCreateExpense(page, validExpense());
  const response = await responsePromise;

  // Then
  expect([401, 403]).toContain(response.status());
  await expect(page.getByText(/sem permissão|não autorizado/i)).toBeVisible();
});
```

## Tenant isolation pattern

```ts
test('Scenario: não lê paciente de outro tenant', async ({ page }) => {
  // Given: paciente existe no tenant B (seed)
  const foreignId = await seedPatient({ tenant: 'B' });
  await loginAs(page, { role: 'ADMIN', tenant: 'A' });

  // When
  const response = await page.goto(`/patients/${foreignId}`);

  // Then
  expect([403, 404]).toContain(response?.status() ?? 0);
  await expect(page.getByText(/prontuário|evolução|anamnese/i)).toHaveCount(0);
});
```

## Diagnostics on failure

Playwright config deve habilitar:

- `trace: 'on-first-retry'` ou `retain-on-failure`
- `screenshot: 'only-on-failure'`
- `video: 'retain-on-failure'` (opcional)

Antes de anexar artefatos ao relatório:

- redigir nomes clínicos sensíveis se aparecerem
- nunca colar payload completo de evaluation/evolution nos logs do agente

## Running

```bash
npx playwright test apps/web/e2e/domain --project=chromium
npx playwright test -g "@tenant-isolation"
npx playwright show-report
```

Integrar com `npm run test:e2e` quando o script existir no root/`apps/web`.

## Flakiness policy

1. Preferir waits baseados em assertion (`expect(...).toBeVisible()`)
2. Evitar `waitForTimeout`
3. Se flaky: estabilizar seletor/estado — não remover o Then da regra
4. Marcar `fix.fix` só com ticket e motivo; nunca silenciar BLOCKER de tenant
