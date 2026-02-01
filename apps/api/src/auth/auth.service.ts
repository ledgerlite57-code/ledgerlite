import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AuditAction } from "@prisma/client";
import { AuthTokenPayload, RefreshTokenPayload } from "./auth.types";
import { getApiEnv } from "../common/env";
import { ErrorCodes, Permissions } from "@ledgerlite/shared";

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
    const user = await this.prisma.user.findFirst({
      where: { email },
    });
    if (!user || !user.passwordHash || user.isInternal || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }

  async login(email: string, password: string, orgId?: string) {
    const user = await this.validateUser(email, password);
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, isActive: true },
      include: { role: true, org: true },
      orderBy: { createdAt: "asc" },
    });
    if (memberships.length === 0) {
      const accessToken = this.signAccessToken({ sub: user.id });
      const refreshToken = await this.createRefreshToken(user.id);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return {
        accessToken,
        refreshToken,
        userId: user.id,
        orgId: null,
      };
    }
    if (!orgId && memberships.length > 1) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: "Multiple organizations found",
        details: {
          orgs: memberships.map((membership) => ({
            id: membership.orgId,
            name: membership.org?.name ?? "Unknown",
          })),
        },
        hint: "Select an organization to continue.",
      });
    }
    const membership = orgId
      ? memberships.find((item) => item.orgId === orgId)
      : memberships[0];
    if (!membership) {
      throw new UnauthorizedException("Membership is inactive or invalid");
    }
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
    const refreshToken = await this.createRefreshToken(user.id, {
      membershipId: membership.id,
      orgId: membership.orgId,
    });

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

    let membership = null;
    if (payload.membershipId) {
      membership = await this.prisma.membership.findFirst({
        where: { id: payload.membershipId, userId: user.id, isActive: true },
        include: { role: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
    } else if (payload.orgId) {
      membership = await this.prisma.membership.findFirst({
        where: { orgId: payload.orgId, userId: user.id, isActive: true },
        include: { role: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
    } else {
      const membershipCount = await this.prisma.membership.count({
        where: { userId: user.id, isActive: true },
      });
      if (membershipCount > 1) {
        throw new UnauthorizedException("Multiple organizations found. Please sign in again.");
      }
      if (membershipCount === 0) {
        const accessToken = this.signAccessToken({ sub: user.id });
        const refreshToken = await this.createRefreshToken(user.id);
        return { accessToken, refreshToken };
      }
      membership = await this.prisma.membership.findFirst({
        where: { userId: user.id, isActive: true },
        include: { role: true },
      });
    }
    if (!membership) {
      throw new UnauthorizedException("Membership is inactive or invalid");
    }
    const accessToken = this.signAccessToken({
      sub: user.id,
      orgId: membership?.orgId,
      membershipId: membership?.id,
      roleId: membership?.roleId,
    });
    const refreshToken = await this.createRefreshToken(user.id, {
      membershipId: membership.id,
      orgId: membership.orgId,
    });

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

  async getMe(payload: AuthTokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, isInternal: true },
    });

    if (!user || !user.isActive || user.isInternal) {
      throw new UnauthorizedException("Invalid user");
    }

    let membership = null;
    if (payload.membershipId) {
      membership = await this.prisma.membership.findFirst({
        where: { id: payload.membershipId, userId: user.id, isActive: true },
        include: { org: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
    }

    if (!membership && payload.orgId) {
      membership = await this.prisma.membership.findFirst({
        where: { orgId: payload.orgId, userId: user.id, isActive: true },
        include: { org: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
    }

    const roleId = membership?.roleId ?? payload.roleId;
    const permissions = roleId
      ? await this.prisma.rolePermission.findMany({
          where: { roleId },
          select: { permissionCode: true },
        })
      : [];

    return {
      user: { id: user.id, email: user.email },
      org: membership
        ? {
            id: membership.org.id,
            name: membership.org.name,
            vatEnabled: membership.org.vatEnabled,
            baseCurrency: membership.org.baseCurrency ?? undefined,
          }
        : null,
      permissions: permissions.map((item) => item.permissionCode),
    };
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

  private async createRefreshToken(
    userId: string,
    context?: { membershipId?: string; orgId?: string },
  ) {
    const tokenId = randomUUID();
    const token = this.jwtService.sign(
      { sub: userId, tokenId, membershipId: context?.membershipId, orgId: context?.orgId },
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
