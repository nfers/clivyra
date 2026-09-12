# Deploy Clivyra na OCI (dev + prod)

Ambientes suportados: **`dev`** e **`prod`** apenas.

## Arquitetura recomendada

```text
GitHub Actions
    │  SSH + rsync
    ▼
┌─────────────────────┐     ┌─────────────────────┐
│  OCI Compute (dev)  │     │  OCI Compute (prod) │
│  Docker Compose     │     │  Docker Compose     │
│  web :3000          │     │  web :3000          │
│  api :3001          │     │  api :3001          │
│  postgres           │     │  postgres           │
└─────────────────────┘     └─────────────────────┘
```

- **1 VM por ambiente** (isolamento simples; cabe no Always Free com 2 VMs Ampere se disponível).
- Alternativa barata: **1 VM** e os dois stacks com `COMPOSE_PROJECT_NAME` + portas diferentes (`3000/3001` vs `3100/3101`). Use hosts/paths distintos nos secrets.

O monorepo (Sprint 0) precisa existir no branch deployado (`package.json`, `docker-compose.yml`, `infra/Dockerfile`).

## 1. Provisionar na OCI (manual, uma vez)

Por ambiente (`dev` e `prod`):

1. **Compute** → Create instance (Oracle Linux 8/9 ou Ubuntu 22.04).
2. Shape sugerido: `VM.Standard.A1.Flex` (Always Free) com 1–2 OCPU / 6–12 GB.
3. VCN com subnet pública (ou privada + bastion).
4. Security List / NSG:
   - SSH `22` só do seu IP (ou via bastion)
   - HTTP `80` / HTTPS `443` (quando colocar reverse proxy)
   - Opcional em dev: `3000` e `3001` abertos só para teste
5. Atribuir **IP público** (ou Load Balancer na frente).
6. Gerar par de chaves SSH; gravar a **privada** só nos GitHub Secrets (nunca no git).

### Bootstrap da VM

SSH na instância e rode:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# relogue
sudo mkdir -p /opt/clivyra
sudo chown $USER:$USER /opt/clivyra
```

(Opcional) Nginx/Caddy na frente com TLS (Let’s Encrypt) apontando para `127.0.0.1:3000` e `/api` → `127.0.0.1:3001`.

## 2. GitHub Environments + Secrets

1. Repo → **Settings → Environments** → crie `dev` e `prod`.
2. Em **prod**, recomendado: required reviewers + wait timer.
3. Repo → **Settings → Secrets and variables → Actions** (ou secrets por environment):

| Secret | Uso |
| --- | --- |
| `OCI_SSH_PRIVATE_KEY` | Chave privada PEM |
| `OCI_SSH_USER` | Ex.: `opc` (Oracle Linux) ou `ubuntu` |
| `OCI_DEV_HOST` | IP/DNS da VM de **dev** |
| `OCI_PROD_HOST` | IP/DNS da VM de **prod** |
| `OCI_DEV_PATH` | Path remoto (opcional, default `/opt/clivyra`) |
| `OCI_PROD_PATH` | Path remoto (opcional, default `/opt/clivyra`) |
| `DEV_ENV_FILE` | Conteúdo completo do `.env` de **dev** |
| `PROD_ENV_FILE` | Conteúdo completo do `.env` de **prod** |

Triggers do workflow:

| Evento | Ambiente |
| --- | --- |
| Push em `develop` | `dev` |
| Push em `master` | `prod` |
| `workflow_dispatch` | escolhe `dev` ou `prod` |

### Exemplo de `.env` (secret `DEV_ENV_FILE` / `PROD_ENV_FILE`)

```env
NODE_ENV=production
COMPOSE_PROJECT_NAME=clivyra-dev
WEB_PORT=3000
API_PORT=3001
WEB_ORIGIN=https://dev.seu-dominio.com
DATABASE_URL=postgresql://clivyra:SENHA_FORTE@db:5432/clivyra?schema=public
POSTGRES_DB=clivyra
POSTGRES_USER=clivyra
POSTGRES_PASSWORD=SENHA_FORTE
```

Em **prod**, use `COMPOSE_PROJECT_NAME=clivyra-prod` e senhas distintas.

## 3. Como o deploy funciona

Workflow: `.github/workflows/deploy-oci.yml`

Passos:

1. Checkout
2. Exige monorepo (`package.json` + `infra/Dockerfile` + compose OCI)
3. Rsync do código para a VM (sem `.git`, `node_modules`, secrets locais)
4. Escreve `.env` a partir do secret
5. `docker compose --env-file .env -f infra/oci/compose.yml up -d --build`

Imagem: use targets de produção (`api` / `web`). Veja `infra/Dockerfile.production.example`.
O Dockerfile do bootstrap atual ainda roda `dev` e **precisa ser alinhado** antes do primeiro deploy real.

## 4. Checklist pós-deploy

```bash
ssh $USER@$HOST 'cd /opt/clivyra && docker compose ps'
curl -fsS "http://$HOST:3001/health"   # quando o health existir
curl -fsS "http://$HOST:3000" | head
```

## 5. Rollback rápido

```bash
ssh $USER@$HOST
cd /opt/clivyra
git status   # se mantiver git remoto; neste fluxo usamos rsync
docker compose --env-file .env -f infra/oci/compose.yml logs --tail=200
# Re-execute o workflow em um commit anterior via workflow_dispatch
```

## Segurança

- Nunca committe `.env`, chaves SSH ou connection strings.
- Prod: SSH só via IP allowlist / bastion; app só atrás de HTTPS.
- Postgres **não** deve expor `5432` publicamente no compose de deploy.
- Separe senhas e `WEB_ORIGIN` entre dev e prod.
