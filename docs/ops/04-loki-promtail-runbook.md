# 04 - Loki and Promtail Runbook

## Scope

Ship structured API logs from dev/staging/prod into Loki with consistent environment labels.

Task mapping:

- `AOM-603-T01`

---

## API log schema (current)

LedgerLite API logs are JSON lines from `pino-http` and include:

- `env`
- `service`
- `requestId`
- `route`
- `statusCode`
- `durationMs`
- `level`
- `time`

Optional fields when available:

- `userId`
- `orgId`

---

## Promtail config example

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: ledgerlite-api
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 10s
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        regex: "/ledgerlite-(dev|staging|prod)-api-1"
        action: keep
      - source_labels: ["__meta_docker_container_name"]
        regex: "/ledgerlite-(dev|staging|prod)-api-1"
        target_label: env
        replacement: "$1"
      - source_labels: ["__meta_docker_container_name"]
        target_label: container
      - target_label: service
        replacement: api

    pipeline_stages:
      - docker: {}
      - json:
          expressions:
            level: level
            requestId: requestId
            route: route
            statusCode: statusCode
            durationMs: durationMs
      - labels:
          level:
          requestId:
          route:
```

Notes:

- Keep `statusCode` and `durationMs` as parsed fields for LogQL filtering.
- `env` and `service` must always be labels.

---

## Loki query examples

```logql
{service="api", env="prod"} |= "request completed"
```

```logql
{service="api", env="prod", level="50"}
```

```logql
{service="api", env="staging"} | json | statusCode >= 500
```

```logql
{service="api", env="dev"} | json | requestId="8e5f..."
```

---

## Validation checklist

1. Promtail sees target API containers.
2. Loki receives labels `env` and `service`.
3. Query by `requestId` returns a single request trace.
4. Query by `statusCode >= 500` returns server error entries.
5. `durationMs` exists for request completion logs.
