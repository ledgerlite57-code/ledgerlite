import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { loginSchema, refreshSchema, registerSchema, type LoginInput, type RegisterInput } from "@ledgerlite/shared";
import { getApiEnv } from "../common/env";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedRequest } from "./jwt-auth.guard";
import { randomBytes } from "crypto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const env = getApiEnv();
    const secureCookie = process.env.NODE_ENV === "production";
    const result = await this.authService.login(body.email, body.password, body.orgId);
    const csrfToken = this.createCsrfToken();
    this.setAuthCookies(res, result.refreshToken, csrfToken, secureCookie, env.API_JWT_REFRESH_TTL);
    return { accessToken: result.accessToken, userId: result.userId, orgId: result.orgId };
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: RegisterInput, @Res({ passthrough: true }) res: Response) {
    const env = getApiEnv();
    const secureCookie = process.env.NODE_ENV === "production";
    const result = await this.authService.register(body.email, body.password);
    const csrfToken = this.createCsrfToken();
    this.setAuthCookies(res, result.refreshToken, csrfToken, secureCookie, env.API_JWT_REFRESH_TTL);
    return { accessToken: result.accessToken, userId: result.userId, orgId: result.orgId };
  }

  @Post("refresh")
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const env = getApiEnv();
    const secureCookie = process.env.NODE_ENV === "production";
    const bearerToken = this.getBearerToken(req);
    const refreshToken = bearerToken ?? req.cookies?.refresh_token;
    if (!bearerToken) {
      this.assertCsrf(req);
    }
    const parsed = refreshSchema.parse({ refreshToken });
    const result = await this.authService.refresh(parsed.refreshToken);
    const csrfToken = this.createCsrfToken();
    this.setAuthCookies(res, result.refreshToken, csrfToken, secureCookie, env.API_JWT_REFRESH_TTL);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const secureCookie = process.env.NODE_ENV === "production";
    const bearerToken = this.getBearerToken(req);
    const refreshToken = bearerToken ?? req.cookies?.refresh_token;
    if (!bearerToken) {
      this.assertCsrf(req);
    }
    const parsed = refreshSchema.parse({ refreshToken });
    await this.authService.logout(parsed.refreshToken);
    res.clearCookie("refresh_token", { path: "/auth", sameSite: "lax", secure: secureCookie });
    res.clearCookie("csrf_token", { path: "/auth", sameSite: "lax", secure: secureCookie });
    return { status: "ok" };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    if (!req.user) {
      throw new UnauthorizedException("Missing user context");
    }
    return this.authService.getMe(req.user);
  }

  private getBearerToken(req: Request) {
    const header =
      (typeof req.headers?.authorization === "string" ? req.headers.authorization : undefined) ??
      (typeof req.get === "function" ? req.get("authorization") : undefined);
    if (!header) {
      return undefined;
    }
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return token.length > 0 ? token : undefined;
  }

  private assertCsrf(req: Request) {
    const csrfHeader =
      (typeof req.headers?.["x-csrf-token"] === "string" ? req.headers["x-csrf-token"] : undefined) ??
      (typeof req.get === "function" ? req.get("x-csrf-token") : undefined);
    const csrfCookie = req.cookies?.csrf_token;
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new UnauthorizedException("Missing or invalid CSRF token");
    }
  }

  private createCsrfToken() {
    return randomBytes(32).toString("hex");
  }

  private setAuthCookies(
    res: Response,
    refreshToken: string,
    csrfToken: string,
    secureCookie: boolean,
    refreshTtlSeconds: number,
  ) {
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      maxAge: refreshTtlSeconds * 1000,
      path: "/auth",
    });
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: secureCookie,
      maxAge: refreshTtlSeconds * 1000,
      path: "/auth",
    });
  }
}
