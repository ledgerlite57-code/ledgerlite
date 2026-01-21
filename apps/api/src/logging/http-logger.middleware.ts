import pinoHttp from "pino-http";
import { RequestContext } from "./request-context";

export const httpLogger = pinoHttp({
  redact: {
    paths: ["req.headers.authorization", "req.body.password", "req.body.refreshToken"],
    censor: "[REDACTED]",
  },
  customProps: () => {
    const context = RequestContext.get();
    return {
      requestId: context?.requestId,
      userId: context?.userId,
      orgId: context?.orgId,
    };
  },
});
