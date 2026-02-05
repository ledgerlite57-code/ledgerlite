import { randomBytes, randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { RequestContext } from "./request-context";

const TRACEPARENT_VERSION = "00";

function generateTraceId() {
  return randomBytes(16).toString("hex");
}

function generateSpanId() {
  return randomBytes(8).toString("hex");
}

function parseTraceparent(headerValue: string | undefined) {
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const traceId = match[2].toLowerCase();
  const parentSpanId = match[3].toLowerCase();
  const traceFlags = match[4].toLowerCase();

  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) {
    return null;
  }

  return { traceId, parentSpanId, traceFlags };
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerId = req.header("x-request-id");
  const requestId = headerId && headerId.length > 0 ? headerId : randomUUID();
  res.setHeader("x-request-id", requestId);

  const incomingTraceparent = parseTraceparent(req.header("traceparent"));
  const traceId = incomingTraceparent?.traceId ?? generateTraceId();
  const spanId = generateSpanId();
  const traceFlags = incomingTraceparent?.traceFlags ?? "01";
  res.setHeader("x-trace-id", traceId);
  res.setHeader("traceparent", `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${traceFlags}`);

  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip =
    (typeof forwardedIp === "string" && forwardedIp.trim().length > 0
      ? forwardedIp.split(",")[0]?.trim()
      : undefined) ??
    req.ip ??
    req.socket?.remoteAddress;
  const userAgentHeader = req.get("user-agent");
  const userAgent = userAgentHeader && userAgentHeader.length > 0 ? userAgentHeader : undefined;

  RequestContext.run({ requestId, traceId, spanId, ip, userAgent }, () => {
    next();
  });
}
