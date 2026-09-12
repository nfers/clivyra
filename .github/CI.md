# GitHub Actions — Clivyra

## Current workflows

| Workflow | File | When | Purpose |
| --- | --- | --- | --- |
| PR Quality Gate | `.github/workflows/pr-check.yml` | pull_request (+ manual) | Lint, typecheck, tests, security when Node workspace exists; otherwise bootstrap-aware skip |
| Deploy OCI | `.github/workflows/deploy-oci.yml` | push `develop`→dev, `master`→prod, or manual | SSH + Docker Compose deploy to OCI VMs |

OCI setup (VMs, secrets, `.env`): see [`infra/oci/README.md`](../infra/oci/README.md).

After Sprint 0 bootstrap (`package.json` + `package-lock.json` on the default branch), the gate runs Node jobs automatically. The bootstrap PR may also introduce `ci.yml` (push + PR) and Dependabot.

## Why the quality gate was red

If job **Repository Readiness** fails in ~1–2s with **empty steps** and no runner name, Actions never started. On this repo the annotation was:

> The job was not started because your account is locked due to a billing issue.

That is an account billing lock on GitHub user `nfers`, not a bug in the workflow YAML and not “missing `package.json`”.

Dependent jobs (Lint, Security, Bootstrap Gate Status) show as **skipped** because `needs: readiness` failed — not because bootstrap detection ran.

## Unlock Actions (required)

Owner of the GitHub account must:

1. Open [GitHub Billing settings](https://github.com/settings/billing)
2. Clear any payment failure / locked account banner
3. Confirm Actions is allowed for public repos (Settings → Actions → General)
4. For private repos later: ensure spending limit / included minutes are available
5. Re-run failed workflows: PR → Checks → Re-run failed jobs

Until billing is unlocked, **no** workflow change will turn the gate green.

## Expected behavior after unlock

### Before monorepo bootstrap (no root `package.json`)

- Repository Readiness → success (`node_ready=false`)
- Bootstrap Gate Status → success (explains skip)
- Lint / Security → skipped
- Quality Gate Result → success (pre-bootstrap path)

### After bootstrap

- Repository Readiness → success (`node_ready=true`)
- Lint, Typecheck and Tests → runs `npm ci`, `lint`, `typecheck`, `test`
- Security Guardrails → `npm audit --audit-level=high`
- Quality Gate Result → success only if both pass

## Required checks (optional)

Ruleset `block-master` today does **not** require Actions checks. When enabling required status checks, prefer the aggregate job:

- **Quality Gate Result**

Do not require Lint/Security alone while the repo can still be pre-bootstrap, or skipped jobs will look like failed PR requirements.

## Manual run

Actions → PR Quality Gate → Run workflow (`workflow_dispatch`), useful after fixing billing.

## Local parity

When the Node workspace exists:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm audit --audit-level=high
```
