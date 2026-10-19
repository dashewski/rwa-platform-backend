## 💻 Local Development Setup

Before starting the stack locally, you need to map the local domains to your loopback address and generate self-signed SSL certificates.

### Step 1: Update Hosts File
Add the following lines to your `hosts` file:
- **Windows:** `C:\Windows\System32\drivers\etc\hosts` (Run Notepad as Administrator)
- **Linux/macOS:** `/etc/hosts` (Use `sudo`)

```text
127.0.0.1 rwa.local
127.0.0.1 auth.rwa.local
127.0.0.1 lldap.rwa.local
127.0.0.1 admin.rwa.local
127.0.0.1 grafana.rwa.local
127.0.0.1 prometheus.rwa.local
127.0.0.1 alloy.rwa.local
127.0.0.1 rabbitmq.rwa.local
127.0.0.1 mongo.rwa.local
127.0.0.1 redis.rwa.local
127.0.0.1 portainer.rwa.local
127.0.0.1 uptime.rwa.local
127.0.0.1 graphiql.rwa.local
```

### Step 2: Generate Self-Signed Certificates
For local development, generate SSL certificates for `*.rwa.local`:

```bash
mkdir -p infrastructure/docker/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/docker/nginx/ssl/privkey.pem \
  -out infrastructure/docker/nginx/ssl/fullchain.pem \
  -subj "/C=US/ST=Dev/L=Dev/O=RWA/OU=Dev/CN=*.rwa.local"
```

---

## 🚀 Server Deployment Guide (Full Setup)

Follow these steps in order to initialize and start the production-ready stack.

## Step 1: Initialize Authelia File Secrets
Authelia requires physical secret files to be present for mounting.
```bash
chmod +x deployments/scripts/*.sh
./deployments/scripts/init-authelia-secrets.sh
```
*This creates files in `./infrastructure/docker/authelia/secrets/`.*

## Step 2: Generate Values for .env
Generate secure random strings for your environment configuration.
```bash
./deployments/scripts/generate-env-values.sh
```
**Action:** Copy the output from the terminal.

## Step 3: Configure Environment (.env)
Edit `infrastructure/docker/.env` and update the following mandatory fields:

1.  **Paste generated secrets** from Step 2 into their respective fields:
    - `APP_JWT_SECRET`
    - `RABBITMQ_PASSWORD`
    - `GRAFANA_PASSWORD`
     - `LLDAP_ADMIN_PASSWORD`
2.  **Set your domain:**
    - `BASE_DOMAIN=yourdomain.com`
    - `LLDAP_BASE_DN=dc=yourdomain,dc=com`
3.  **Check Blockchain Keys** (if deploying to production/mainnet):
    - Update `SIGNER_X_PRIVATE_KEY` and `TESTNET_FAUCET_WALLET_PRIVATE_KEY`.
4.  **SSL Configuration:**
    - **Production (Cloudflare Origin Certificate):**
      - `NGINX_HOST_SSL_CERT_PATH=/path/to/fullchain.pem`
      - `NGINX_HOST_SSL_KEY_PATH=/path/to/privkey.pem`
    - **Development (Self-signed):**
      - `NGINX_HOST_SSL_CERT_PATH=./nginx/ssl/fullchain.pem`
      - `NGINX_HOST_SSL_KEY_PATH=./nginx/ssl/privkey.pem`

## Step 4: SSL Certificates (Production)

Production uses Cloudflare certificates (Origin Certificate); Let's Encrypt / Certbot is no longer used.
Put the certificate files on the host and point `NGINX_HOST_SSL_CERT_PATH` / `NGINX_HOST_SSL_KEY_PATH` to them.

## Step 5: Start the Infrastructure
```bash
bun run app:up
```
*`app:up` starts the stack in the correct order, from any shell (PowerShell, cmd, git-bash): it brings the MongoDB members up, initializes/verifies the replica set `rs0` via a one-shot helper container that is removed automatically (nothing stays in the stack), waits until all members are healthy, and only then starts the rest of the stack. The order matters: before the set exists the members never pass their healthcheck and Docker Compose fail-fasts on the unhealthy dependency. Idempotent — safe on a fresh volume and on a running stack. To (re)initialize MongoDB only: `./deployments/scripts/init-mongo-replicaset.sh` (git-bash / Linux).*

## Step 6: Import Uptime Kuma Configuration
Upon first run, you must manually import the monitoring configuration:
1.  Open **Uptime Kuma** in your browser: `http://uptime.rwa.local` (local) or `https://uptime.yourdomain.com` (server).
2.  Create your admin account.
3.  Go to **Settings** > **Backup** > **Import Backup**.
4.  Select and upload the file: `infrastructure/docker/uptime-kuma/uptime-kuma-import.json`.

---

## 🛠 Maintenance Commands

### Nginx Domain/SSL Update
If you change `BASE_DOMAIN` or update certificates:
```bash
bun run nginx:reload
```

### Full Backup
Creates an archive of databases, configs, and SSL:
```bash
./deployments/scripts/backup.sh
```