import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { getApiEnv } from "../common/env";

type HistogramState = {
  buckets: number[];
  count: number;
  sum: number;
};

type RequestMetricLabels = {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
};

@Injectable()
export class MetricsService {
  private readonly environment = getApiEnv().SENTRY_ENVIRONMENT;
  private readonly durationBucketsSeconds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly requestCounters = new Map<string, number>();
  private readonly requestDurationHistograms = new Map<string, HistogramState>();

  readonly contentType = "text/plain; version=0.0.4; charset=utf-8";

  recordHttpRequest(input: RequestMetricLabels) {
    const method = this.normalizeMethod(input.method);
    const route = this.normalizeRoute(input.route);
    const status = this.normalizeStatusCode(input.statusCode);
    const durationSeconds = Number.isFinite(input.durationSeconds) ? Math.max(input.durationSeconds, 0) : 0;
    const key = this.toLabelKey(method, route, status);

    this.requestCounters.set(key, (this.requestCounters.get(key) ?? 0) + 1);

    const histogram =
      this.requestDurationHistograms.get(key) ??
      {
        buckets: Array.from({ length: this.durationBucketsSeconds.length }, () => 0),
        count: 0,
        sum: 0,
      };

    const bucketIndex = this.durationBucketsSeconds.findIndex((bound) => durationSeconds <= bound);
    if (bucketIndex >= 0) {
      histogram.buckets[bucketIndex] += 1;
    }
    histogram.count += 1;
    histogram.sum += durationSeconds;

    this.requestDurationHistograms.set(key, histogram);
  }

  resolveRoute(req: Request) {
    const routePath = typeof req.route?.path === "string" ? req.route.path : undefined;
    const baseUrl = typeof req.baseUrl === "string" ? req.baseUrl : "";
    if (routePath) {
      return this.normalizeRoute(`${baseUrl}${routePath}`);
    }

    const path = (typeof req.path === "string" && req.path.length > 0 ? req.path : req.originalUrl?.split("?")[0]) ?? "/";
    return this.normalizeRoute(path);
  }

  renderMetrics() {
    const lines: string[] = [];
    const processMemory = process.memoryUsage();

    lines.push("# HELP ledgerlite_build_info Build and deployment metadata.");
    lines.push("# TYPE ledgerlite_build_info gauge");
    lines.push(`ledgerlite_build_info{service="api",environment="${this.escapeLabelValue(this.environment)}"} 1`);

    lines.push("# HELP ledgerlite_process_uptime_seconds Process uptime in seconds.");
    lines.push("# TYPE ledgerlite_process_uptime_seconds gauge");
    lines.push(`ledgerlite_process_uptime_seconds ${process.uptime().toFixed(3)}`);

    lines.push("# HELP ledgerlite_process_resident_memory_bytes Resident memory in bytes.");
    lines.push("# TYPE ledgerlite_process_resident_memory_bytes gauge");
    lines.push(`ledgerlite_process_resident_memory_bytes ${processMemory.rss}`);

    lines.push("# HELP ledgerlite_process_heap_used_bytes Heap used in bytes.");
    lines.push("# TYPE ledgerlite_process_heap_used_bytes gauge");
    lines.push(`ledgerlite_process_heap_used_bytes ${processMemory.heapUsed}`);

    lines.push("# HELP ledgerlite_process_heap_total_bytes Heap total in bytes.");
    lines.push("# TYPE ledgerlite_process_heap_total_bytes gauge");
    lines.push(`ledgerlite_process_heap_total_bytes ${processMemory.heapTotal}`);

    lines.push("# HELP ledgerlite_http_requests_total Total HTTP requests processed.");
    lines.push("# TYPE ledgerlite_http_requests_total counter");
    for (const [key, count] of this.sortedEntries(this.requestCounters)) {
      const labels = this.fromLabelKey(key);
      lines.push(`ledgerlite_http_requests_total{${this.renderLabelSet(labels)}} ${count}`);
    }

    lines.push("# HELP ledgerlite_http_request_duration_seconds HTTP request duration in seconds.");
    lines.push("# TYPE ledgerlite_http_request_duration_seconds histogram");
    for (const [key, state] of this.sortedEntries(this.requestDurationHistograms)) {
      const labels = this.fromLabelKey(key);
      let cumulativeCount = 0;
      for (let idx = 0; idx < this.durationBucketsSeconds.length; idx += 1) {
        cumulativeCount += state.buckets[idx] ?? 0;
        const le = this.durationBucketsSeconds[idx];
        lines.push(
          `ledgerlite_http_request_duration_seconds_bucket{${this.renderLabelSet(labels)},le="${le}"} ${cumulativeCount}`,
        );
      }
      lines.push(
        `ledgerlite_http_request_duration_seconds_bucket{${this.renderLabelSet(labels)},le="+Inf"} ${state.count}`,
      );
      lines.push(`ledgerlite_http_request_duration_seconds_sum{${this.renderLabelSet(labels)}} ${state.sum.toFixed(6)}`);
      lines.push(`ledgerlite_http_request_duration_seconds_count{${this.renderLabelSet(labels)}} ${state.count}`);
    }

    return `${lines.join("\n")}\n`;
  }

  private normalizeMethod(method: string) {
    if (!method) {
      return "UNKNOWN";
    }
    return method.toUpperCase();
  }

  private normalizeStatusCode(statusCode: number) {
    if (!Number.isFinite(statusCode) || statusCode <= 0) {
      return "000";
    }
    return String(Math.floor(statusCode));
  }

  private normalizeRoute(route: string) {
    const trimmed = route.trim();
    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const withoutQuery = withLeadingSlash.split("?")[0] ?? "/";
    const collapsed = withoutQuery.replace(/\/{2,}/g, "/");
    const normalized = collapsed
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
        ":uuid",
      )
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/:token");
    return normalized.length > 0 ? normalized : "/";
  }

  private toLabelKey(method: string, route: string, status: string) {
    return `${method}|${route}|${status}`;
  }

  private fromLabelKey(key: string) {
    const [method = "UNKNOWN", route = "/", status = "000"] = key.split("|");
    return { method, route, status };
  }

  private renderLabelSet(labels: { method: string; route: string; status: string }) {
    return `method="${this.escapeLabelValue(labels.method)}",route="${this.escapeLabelValue(labels.route)}",status="${this.escapeLabelValue(labels.status)}"`;
  }

  private escapeLabelValue(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
  }

  private sortedEntries<T>(map: Map<string, T>) {
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
}
