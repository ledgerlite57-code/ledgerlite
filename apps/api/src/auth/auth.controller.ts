import { Body, Controller, Get, Post, Req, Res, UseGuards, UsePipes } from "@nestjs/common";
import { loginSchema, refreshSchema } from "@ledgerlite/shared";
import { getApiEnv } from "../common/env";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RequirePermissions } from "../rbac/permissions.decorator";
import { Permissions } from "@ledgerlite/shared";
import { RbacGuard } from "../rbac/rbac.guard";
import { Request, Response } from "express";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const env = getApiEnv();
    const result = await this.authService.login(body.email, body.password);
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: env.API_JWT_REFRESH_TTL * 1000,
      path: "/auth",
    });
    return { accessToken: result.accessToken, userId: result.userId, orgId: result.orgId };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const env = getApiEnv();
    const refreshToken = req.cookies?.refresh_token;
    const parsed = refreshSchema.parse({ refreshToken });
    const result = await this.authService.refresh(parsed.refreshToken);
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: env.API_JWT_REFRESH_TTL * 1000,
      path: "/auth",
    });
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    const parsed = refreshSchema.parse({ refreshToken });
    await this.authService.logout(parsed.refreshToken);
    res.clearCookie("refresh_token", { path: "/auth" });
    return { status: "ok" };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.AUTH_SELF)
  me() {
    return { status: "ok" };
  }
}
