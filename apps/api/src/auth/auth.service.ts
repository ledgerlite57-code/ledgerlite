import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AuditAction } from "@prisma/client";
import { AuthTokenPayload, RefreshTokenPayload } from "./auth.types";
import { getApiEnv } from "../common/env";
import { Permissions } from "@ledgerlite/shared";

const DEFAULT_OWNER_EMAIL = "owner@ledgerlite.local";
const DEFAULT_OWNER_PASSWORD = "Password123!";

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {
    const env = getApiEnv();
    this.accessTtl = env.API_JWT_ACCESS_TTL;
    this.refreshTtl = env.API_JWT_REFRESH_TTL;
    this.jwtSecret = env.API_JWT_SECRET;
    this.jwtRefreshSecret = env.API_JWT_REFRESH_SECRET;
  }

  async validateUser(email: string, password: string) {
    let user = await this.prisma.user.findFirst({
      where: { email },
    });
    if (!user && email === DEFAULT_OWNER_EMAIL && password === DEFAULT_OWNER_PASSWORD) {
      user = await this.prisma.user.create({
        data: {
          email: DEFAULT_OWNER_EMAIL,
          passwordHash: await argon2.hash(DEFAULT_OWNER_PASSWORD),
          isActive: true,
        },
      });
    }
    if (
      user &&
      email === DEFAULT_OWNER_EMAIL &&
      password === DEFAULT_OWNER_PASSWORD &&
      (!user.passwordHash || !user.isActive)
    ) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: user.passwordHash ?? (await argon2.hash(DEFAULT_OWNER_PASSWORD)),
          isActive: true,
          isInternal: false,
        },
      });
    }
    if (!user || !user.passwordHash || user.isInternal || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
      include: { role: true },
    });
    if (membership?.role?.name === "Owner" && membership.orgId) {
      await Promise.all(
        Object.values(Permissions).map((code) =>
          this.prisma.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: `System permission: ${code}` },
          }),
        ),
      );
      await this.prisma.rolePermission.createMany({
        data: Object.values(Permissions).map((permissionCode) => ({
          roleId: membership.roleId,
          permissionCode,
        })),
        skipDuplicates: true,
      });
    }
    const accessToken = this.signAccessToken({
      sub: user.id,
      orgId: membership?.orgId,
      membershipId: membership?.id,
      roleId: membership?.roleId,
    });
    const refreshToken = await this.createRefreshToken(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (membership?.orgId) {
      await this.audit.log({
        orgId: membership.orgId,
        actorUserId: user.id,
        entityType: "AUTH",
        entityId: user.id,
        action: AuditAction.LOGIN,
        after: { email: user.email },
      });
    }

    return {
      accessToken,
      refreshToken,
      userId: user.id,
      orgId: membership?.orgId ?? null,
    };
  }

  async refresh(token: string) {
    const payload = this.verifyRefreshToken(token);
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.tokenId },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }
    const valid = await argon2.verify(record.tokenHash, token);
    if (!valid) {
      throw new UnauthorizedException("Refresh token invalid");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
      include: { role: true },
    });
    const accessToken = this.signAccessToken({
      sub: user.id,
      orgId: membership?.orgId,
      membershipId: membership?.id,
      roleId: membership?.roleId,
    });
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
    };
  }

  async logout(token: string) {
    const payload = this.verifyRefreshToken(token);
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(payload: AuthTokenPayload) {
    return this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.accessTtl,
    });
  }

  private verifyRefreshToken(token: string) {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalid");
    }
  }

  private async createRefreshToken(userId: string) {
    const tokenId = randomUUID();
    const token = this.jwtService.sign(
      { sub: userId, tokenId },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: this.refreshTtl,
      },
    );
    const tokenHash = await argon2.hash(token);
    const expiresAt = new Date(Date.now() + this.refreshTtl * 1000);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }
}
