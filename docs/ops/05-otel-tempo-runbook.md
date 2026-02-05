# 05 - OpenTelemetry and Tempo Runbook

## Scope

Define the tracing pipeline wiring for LedgerLite API with correlation identifiers.

Task mapping:

- `AOM-604-T01`

---

## Correlation contract

Every API request includes:

- `x-request-id` (generated or propagated)
- `traceparent` (W3C trace context)
- `x-trace-id` (trace id extracted from `traceparent`)

Structured logs include:

- `requestId`
- `traceId`
- `spanId`

Sentry error events also include:

- `traceId`
- `spanId`

This allows pivot between logs, traces, and error events.

---

## Environment variables

Configure these in each environment:

- `OTEL_ENABLED` (`true|false`)
- `OTEL_SERVICE_NAME` (default: `ledgerlite-api`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (for example: `http://otel-collector:4318`)
- `OTEL_TRACES_SAMPLER_RATIO` (`0.0` to `1.0`)

Recommended sampling:

- `development`: `1.0`
- `staging`: `0.2`
- `production`: `0.05`

---

## Collector and Tempo reference config

OpenTelemetry Collector (`otel-collector-config.yaml`):

```yaml
receivers:
  otlp:
    protocols:
      http:
      grpc:

processors:
  batch: {}

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
```

Tempo (`tempo.yaml`) minimum:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
        http:

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/traces
```

---

## Grafana correlation setup

1. Add Tempo data source.
2. Add Loki data source.
3. In Explore, query logs by `requestId` or `traceId`.
4. Pivot to Tempo trace using the same `traceId`.

---

## Validation checklist

1. API response includes `traceparent` and `x-trace-id`.
2. API logs include `requestId`, `traceId`, and `spanId`.
3. Errors captured by Sentry carry `traceId` tag.
4. Tempo receives traces for sampled requests.
5. Logs and traces can be correlated by `traceId`.
