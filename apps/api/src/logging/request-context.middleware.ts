import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { RequestContext } from "./request-context";

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerId = req.header("x-request-id");
  const requestId = headerId && headerId.length > 0 ? headerId : randomUUID();
  res.setHeader("x-request-id", requestId);
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

  RequestContext.run({ requestId, ip, userAgent }, () => {
    next();
  });
}
