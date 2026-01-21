import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthTokenPayload } from "./auth.types";
import { RequestContext } from "../logging/request-context";
import { getApiEnv } from "../common/env";

export type AuthenticatedRequest = Request & { user?: AuthTokenPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header =
      (typeof request.headers?.authorization === "string" ? request.headers.authorization : undefined) ??
      (typeof request.get === "function" ? request.get("authorization") : undefined) ??
      (typeof request.header === "function" ? request.header("authorization") : undefined);
    if (!header || typeof header !== "string") {
      throw new UnauthorizedException("Missing authorization header");
    }
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const env = getApiEnv();
      const payload = this.jwtService.verify<AuthTokenPayload>(token, {
        secret: env.API_JWT_SECRET,
      });
      request.user = payload;
      RequestContext.setUserContext(payload.sub, payload.orgId);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
