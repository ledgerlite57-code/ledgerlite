# 02 - Monitoring Domains and Access Controls Runbook

## Scope

Provision monitoring UI domains and enforce access controls for:

- `development`
- `staging`
- `production`

This runbook implements `AOM-601-T02`.

---

## Target hostnames

- `monitor-dev.ledgerlite.net`
- `monitor-staging.ledgerlite.net`
- `monitor.ledgerlite.net`

All resolve to the EC2 Elastic IP and terminate TLS at Caddy.

---

## Prerequisites

- Elastic IP is already attached to EC2 (current value: `3.111.225.123`)
- Security group allows only:
  - `22/tcp`
  - `80/tcp`
  - `443/tcp`
- Caddy is installed and active on EC2
- Monitoring UI containers bind to `127.0.0.1` only (not `0.0.0.0`)

---

## Step 1: DNS records (Cloudflare)

Create these `A` records:

| Name | Type | Value | Proxy |
| --- | --- | --- | --- |
| `monitor-dev` | `A` | `3.111.225.123` | DNS only |
| `monitor-staging` | `A` | `3.111.225.123` | DNS only |
| `monitor` | `A` | `3.111.225.123` | DNS only |

PowerShell verification:

```powershell
Resolve-DnsName monitor-dev.ledgerlite.net -Type A
Resolve-DnsName monitor-staging.ledgerlite.net -Type A
Resolve-DnsName monitor.ledgerlite.net -Type A
```

Expected: each resolves to `3.111.225.123`.

---

## Step 2: Local port plan (loopback only)

Recommended Grafana ports:

- dev: `127.0.0.1:3300`
- staging: `127.0.0.1:4300`
- prod: `127.0.0.1:5300`

Container bind example:

```yaml
ports:
  - "127.0.0.1:3300:3000"
```

Never expose monitoring UI ports publicly.

---

## Step 3: Caddy access controls

Generate bcrypt password hashes on EC2:

```bash
caddy hash-password --plaintext 'REPLACE_DEV_PASSWORD'
caddy hash-password --plaintext 'REPLACE_STAGING_PASSWORD'
caddy hash-password --plaintext 'REPLACE_PROD_PASSWORD'
```

Add/merge this in `/etc/caddy/Caddyfile`:

```caddyfile
monitor-dev.ledgerlite.net {
  basicauth {
    monitor_dev REPLACE_DEV_BCRYPT_HASH
  }
  reverse_proxy 127.0.0.1:3300
}

monitor-staging.ledgerlite.net {
  basicauth {
    monitor_staging REPLACE_STAGING_BCRYPT_HASH
  }
  reverse_proxy 127.0.0.1:4300
}

monitor.ledgerlite.net {
  basicauth {
    monitor_prod REPLACE_PROD_BCRYPT_HASH
  }
  reverse_proxy 127.0.0.1:5300
}
```

Apply config:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

---

## Step 4: Optional network hardening (recommended)

If monitoring must be private to known IPs, add a remote IP matcher:

```caddyfile
@allowedIps remote_ip 203.0.113.10/32 198.51.100.0/24
handle @allowedIps {
  basicauth {
    monitor_prod REPLACE_PROD_BCRYPT_HASH
  }
  reverse_proxy 127.0.0.1:5300
}
respond "Forbidden" 403
```

Use this for production monitoring if your team has stable IP ranges.

---

## Step 5: Validation

From local machine:

```powershell
curl.exe -I https://monitor-dev.ledgerlite.net
curl.exe -I https://monitor-staging.ledgerlite.net
curl.exe -I https://monitor.ledgerlite.net
```

Expected:

- Without credentials: `401 Unauthorized`
- With valid basic auth: `200 OK`

Authenticated check example:

```powershell
curl.exe -I -u monitor_dev:REPLACE_DEV_PASSWORD https://monitor-dev.ledgerlite.net
```

Server-side checks:

```bash
sudo ss -ltnp | grep -E ':(3300|4300|5300)\s'
sudo ss -ltnp | grep -E ':(80|443)\s'
```

Expected:

- `3300/4300/5300` listen on `127.0.0.1` only
- `80/443` owned by `caddy`

---

## Security notes

- Do not reuse the same password across environments.
- Store plaintext monitoring passwords in a secure vault, not in git.
- Rotate monitoring credentials periodically (at least quarterly).
- Keep Caddy and monitoring images patched.

---

## Acceptance criteria mapping (`AOM-601-T02`)

- Domains provisioned for dev/staging/prod monitoring UIs.
- Reverse proxy route defined per environment.
- Authentication enforced for each monitoring UI.
- Optional IP allowlist pattern documented.
- Validation commands and expected results documented.
