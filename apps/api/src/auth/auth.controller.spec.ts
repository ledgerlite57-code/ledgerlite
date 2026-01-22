import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import { resetApiEnvCache } from "../common/env";

const originalEnv = { ...process.env };

const refreshTokenValue = "refresh-token-1234567890123456";

const buildResponse = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as Response;

describe("AuthController cookies", () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      API_JWT_SECRET: "secret",
      API_JWT_REFRESH_SECRET: "refresh",
    };
    resetApiEnvCache();
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    controller = new AuthController(authService as never);
  });

  afterAll(() => {
    process.env = originalEnv;
    resetApiEnvCache();
  });

  it("sets refresh cookie with httpOnly and lax sameSite in development", async () => {
    process.env.NODE_ENV = "development";
    authService.login.mockResolvedValue({
      accessToken: "access",
      refreshToken: refreshTokenValue,
      userId: "user-1",
      orgId: "org-1",
    });
    const res = buildResponse();

    await controller.login({ email: "user@ledgerlite.local", password: "Password123!" }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      refreshTokenValue,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/auth",
      }),
    );
  });

  it("sets refresh cookie as secure in production on refresh and logout", async () => {
    process.env.NODE_ENV = "production";
    authService.refresh.mockResolvedValue({
      accessToken: "access",
      refreshToken: refreshTokenValue,
    });
    const req = { cookies: { refresh_token: refreshTokenValue } } as unknown as Request;
    const res = buildResponse();

    await controller.refresh(req, res);
    await controller.logout(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      refreshTokenValue,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/auth",
      }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      "refresh_token",
      expect.objectContaining({
        sameSite: "lax",
        secure: true,
        path: "/auth",
      }),
    );
  });
});
