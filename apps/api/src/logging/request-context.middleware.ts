import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { RequestContext } from "./request-context";

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerId = req.header("x-request-id");
  const requestId = headerId && headerId.length > 0 ? headerId : randomUUID();
  res.setHeader("x-request-id", requestId);

  RequestContext.run({ requestId }, () => {
    next();
  });
}
