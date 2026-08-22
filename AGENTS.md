# Clivyra Engineering Rules

## 1. Project Context

Clivyra is a multi-tenant SaaS for Pilates studios, physiotherapy clinics and healthcare professionals.

The platform manages:

* tenants / clinics / studios
* professionals
* patients
* leads / CRM
* scheduling
* Pilates classes
* attendance
* plans and contracts
* financial operations
* clinical records
* anamnesis
* physiotherapy evaluations
* clinical evolution
* documents
* automations
* integrations
* AI-assisted features

The system processes health information and therefore must treat clinical data as sensitive personal data.

---

# 2. Architecture

## Frontend

* Next.js
* TypeScript
* PWA
* Mobile-first

Location:

`apps/web`

## Backend

* Node.js
* TypeScript
* NestJS

Location:

`apps/api`

## Database

* PostgreSQL
* Prisma

## Shared packages

Prefer shared contracts and reusable code under:

* `packages/shared`
* `packages/types`
* `packages/config`

Avoid duplicating DTOs, contracts or domain types between frontend and backend when they can safely be shared.

---

# 3. Architecture Principles

Prefer:

* explicit domain boundaries
* small modules
* dependency inversion when useful
* composition over unnecessary inheritance
* clear application services
* isolated infrastructure concerns
* explicit validation
* transactional consistency where required

Avoid:

* god services
* circular dependencies
* business rules inside controllers
* direct database access from controllers
* duplicated domain logic
* premature abstractions
* hidden side effects

Controllers should orchestrate HTTP concerns.

Business rules should live in services/domain/application layers.

Persistence logic should remain isolated from presentation logic.

---

# 4. Multi-Tenancy — CRITICAL

Every tenant-owned entity MUST include a `tenantId`.

Examples:

* Patient
* Lead
* Appointment
* PilatesClass
* Contract
* Payment
* Expense
* ClinicalRecord
* Evaluation
* Evolution
* Document

Never trust a `tenantId` received directly from:

* request body
* query parameters
* route parameters
* frontend state

Tenant context MUST be resolved from the authenticated user/session.

Every tenant-owned database query MUST enforce tenant isolation.

Example conceptual rule:

`WHERE tenantId = authenticatedTenantId`

Agents MUST actively verify that new queries cannot leak information across tenants.

Cross-tenant access is considered a BLOCKER.

---

# 5. Authentication and Authorization

Authentication does not imply authorization.

Every protected operation MUST validate authorization server-side.

Never rely only on:

* hidden frontend buttons
* frontend route guards
* disabled controls

Validate permissions in the backend.

Initial roles may include:

* OWNER
* ADMIN
* PROFESSIONAL
* RECEPTION / OPERATIONS

Sensitive modules such as:

* clinical records
* financial data
* user administration

must support independent permissions.

---

# 6. Security

Security is part of the Definition of Done.

Never expose or unnecessarily persist:

* passwords
* access tokens
* refresh tokens
* API keys
* credentials
* medical records
* health information
* unnecessary PII

Never log secrets or complete sensitive clinical content.

All input must be validated server-side.

Agents MUST consider:

* broken access control
* IDOR
* privilege escalation
* cross-tenant data leakage
* SQL / query injection
* mass assignment
* insecure file upload
* sensitive data exposure
* insecure direct object references
* missing authorization
* secrets committed to Git
* unsafe external integrations

Critical or High security findings block completion.

---

# 7. LGPD

Health information must be treated as sensitive personal data.

Apply:

* data minimization
* least privilege
* explicit authorization
* auditability
* secure storage
* controlled export
* controlled deletion / anonymization
* consent tracking where applicable

Never send unnecessary patient information to third-party services.

---

# 8. AI / LLM Guardrails

LLM providers must remain behind the Clivyra AI Gateway.

Initial provider:

* Gemini

Architecture must allow future providers such as:

* Kimi

Domain code must not depend directly on vendor SDKs.

Before sending information to an LLM:

* minimize PII
* minimize health data
* redact unnecessary identifiers
* verify tenant isolation

AI output must never automatically perform privileged actions without server-side validation.

Agents implementing AI features MUST consider:

* prompt injection
* data exfiltration
* cross-tenant context leakage
* hallucination
* unsafe tool execution
* provider timeout/failure
* token/cost control

---

# 9. Linear Workflow

One Linear card = one implementation scope.

Examples:

`CLI-17`

Branch:

`feat/CLI-17-patient-registration`

Rules:

* implement only the requested card
* do not silently expand scope
* do not implement unrelated Linear cards
* reference the Linear ID in branch and commit messages
* identify dependencies before implementation

If a card depends on another unfinished card, report the dependency instead of duplicating its implementation.

---

# 10. Multi-Agent Workflow

Agents have explicit responsibilities.

## Developer Agent

Responsibilities:

* understand the Linear card
* inspect existing architecture
* implement the feature
* add migrations when required
* create unit/integration tests
* run mandatory validation
* document important architectural decisions

Developer MUST NOT approve its own implementation as final.

---

## QA Agent

Responsibilities:

* inspect the Linear acceptance criteria
* identify missing scenarios
* create/update automated tests
* validate happy paths
* validate error paths
* validate regressions
* validate tenant isolation when applicable

QA must not modify business rules only to make tests pass.

---

## Playwright Agent

Responsibilities:

Create or update E2E tests for user-visible workflows.

Tests should cover when applicable:

* happy path
* validation errors
* authorization failures
* navigation
* persistence
* tenant isolation
* regressions

Playwright failures must generate useful diagnostics such as:

* trace
* screenshot
* logs when safe

Never expose patient health data in test artifacts.

---

## Security Agent

Responsibilities:

Review the implementation for:

* cross-tenant leakage
* IDOR
* broken authorization
* privilege escalation
* insecure input validation
* mass assignment
* injection
* unsafe file handling
* secrets
* sensitive logs
* LGPD risks

Classify findings as:

* BLOCKER
* HIGH
* MEDIUM
* LOW

BLOCKER and HIGH findings prevent completion.

---

## Reviewer Agent

Acts as a Senior/Staff Engineer.

Review:

* architecture
* maintainability
* scope adherence
* domain boundaries
* duplication
* error handling
* transactions
* concurrency risks
* performance
* observability
* test coverage
* security
* tenant isolation

The Reviewer MUST NOT add unrelated features during review.

Findings should be classified:

* BLOCKER
* HIGH
* MEDIUM
* LOW

BLOCKER or HIGH prevents approval.

---

# 11. Pull Request Rules

Every implementation should result in a Pull Request.

PR title should reference the Linear issue.

Example:

`CLI-17 — Patient registration`

Before opening the PR:

* implementation complete
* lint passing
* typecheck passing
* unit tests passing
* integration tests passing when applicable

The PR must be reviewed by:

1. automated CI
2. Playwright
3. Security Guardrails
4. Codex Reviewer
5. CodeRabbit
6. human review when required

Do not merge directly into `main`.

---

# 12. CodeRabbit

CodeRabbit is an additional reviewer, not the sole source of approval.

CodeRabbit findings must be evaluated alongside:

* Codex Reviewer
* Security Agent
* CI
* automated tests

Do not blindly apply CodeRabbit suggestions.

Evaluate each suggestion against:

* Clivyra architecture
* domain requirements
* multi-tenancy rules
* security requirements

---

# 13. Database Rules

When changing Prisma schema:

Always evaluate:

* tenantId
* foreign keys
* unique constraints
* indexes
* nullable fields
* migration safety
* backwards compatibility

Never perform destructive migrations without explicitly identifying the risk.

Tenant-owned indexes should commonly consider `tenantId` as part of query patterns.

---

# 14. API Rules

API endpoints must:

* authenticate where necessary
* authorize server-side
* validate input
* derive tenant context securely
* return consistent errors
* avoid sensitive data leakage

Controllers must not expose raw database entities unnecessarily.

Prefer explicit response DTOs/contracts.

---

# 15. Error Handling

Errors exposed to users must not reveal:

* stack traces
* SQL
* internal infrastructure details
* secrets
* tokens
* sensitive patient information

Operational logs can contain diagnostic identifiers, but avoid sensitive payloads.

---

# 16. Observability

New critical flows should consider:

* structured logs
* correlation/request IDs
* useful metrics
* failure tracking

Never include sensitive clinical data in telemetry unless explicitly justified and protected.

---

# 17. Mandatory Validation

Before considering a task complete, run when available:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Also run relevant:

* integration tests
* migration checks
* security checks

Do not report a command as successful unless it actually executed successfully.

If a command cannot be executed, explicitly report why.

---

# 18. Definition of Done

A Linear card is NOT complete until:

* acceptance criteria are implemented
* architecture rules are respected
* tenant isolation is validated
* authorization is validated
* unit tests pass
* integration tests pass when applicable
* Playwright tests pass when applicable
* security guardrails pass
* no BLOCKER or HIGH security findings remain
* CI passes
* PR exists
* Codex Reviewer completed review
* CodeRabbit review was evaluated
* relevant documentation was updated

---

# 19. Sprint Completion Gate

Every sprint MUST finish with:

## Playwright Regression

Run and update the E2E regression suite covering all critical functionality delivered during the sprint.

## Security Guardrails

Perform security validation covering all functionality delivered during the sprint.

A sprint MUST NOT be considered complete while either gate is failing.

---

# 20. Agent Final Response

When an implementation agent finishes work, it must report:

## Implemented

What was implemented.

## Files Changed

Important files created or modified.

## Database

Migrations/schema changes.

## Tests

Tests created or updated.

## Commands Executed

Commands actually executed and their result.

## Security

Relevant security validations performed.

## Risks / Follow-ups

Known risks, dependencies or remaining follow-up work.

## Linear

Linear card implemented.

## PR

Branch and Pull Request, when created.
