import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AuditAction } from "@prisma/client";
import { AuthTokenPayload, RefreshTokenPayload } from "./auth.types";
import { getApiEnv } from "../common/env";
import { ErrorCodes, Permissions } from "@ledgerlite/shared";
import { MailerService } from "../common/mailer.service";

const LEDGERLITE_PRODUCT_MANAGER = "LEDGERLITE_PRODUCT_MANAGER" as const;

const PRODUCT_MANAGER_PERMISSIONS = [
  Permissions.PLATFORM_ORG_READ,
  Permissions.PLATFORM_ORG_WRITE,
  Permissions.PLATFORM_IMPERSONATE,
] as const;

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly emailVerificationTtlHours: number;
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {
    const env = getApiEnv();
    this.accessTtl = env.API_JWT_ACCESS_TTL;
    this.refreshTtl = env.API_JWT_REFRESH_TTL;
    this.emailVerificationTtlHours = env.EMAIL_VERIFICATION_TTL_HOURS;
    this.jwtSecret = env.API_JWT_SECRET;
    this.jwtRefreshSecret = env.API_JWT_REFRESH_SECRET;
  }

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.isInternal && !this.isLedgerliteProductManagerUser(user)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isInternal && user.verificationStatus !== "VERIFIED") {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: "Please verify your email.",
        hint: "Open the verification link sent to your inbox, then try again.",
      });
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }

  async login(email: string, password: string, orgId?: string) {
    const user = await this.validateUser(email, password);
    if (this.isLedgerliteProductManagerUser(user)) {
      const accessToken = this.signAccessToken({
        sub: user.id,
        isInternal: true,
        internalRole: LEDGERLITE_PRODUCT_MANAGER,
      });
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
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, isActive: true, org: { isActive: true } },
      include: { role: true, org: true },
      orderBy: { createdAt: "asc" },
    });
    if (memberships.length === 0) {
      const disabledOrgMembership = await this.prisma.membership.findFirst({
        where: { userId: user.id, isActive: true, org: { isActive: false } },
        include: { org: true },
      });
      if (disabledOrgMembership) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Organization is deactivated.",
          hint: "Contact support to re-enable your organization.",
        });
      }
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
      if (orgId) {
        const disabledOrgMembership = await this.prisma.membership.findFirst({
          where: { userId: user.id, orgId, isActive: true },
          include: { org: true },
        });
        if (disabledOrgMembership && disabledOrgMembership.org && !disabledOrgMembership.org.isActive) {
          throw new UnauthorizedException({
            code: ErrorCodes.UNAUTHORIZED,
            message: "Organization is deactivated.",
            hint: "Contact support to re-enable your organization.",
          });
        }
      }
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

  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: "Email is already registered",
        hint: "Sign in or use a different email address.",
      });
    }

    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        isActive: true,
        isInternal: false,
        verificationStatus: "UNVERIFIED",
        emailVerifiedAt: null,
      },
    });

    const { token, expiresAt } = await this.createEmailVerificationToken(user.id);
    const verificationLink = this.buildVerificationLink(token);
    const exposeDevVerificationLink = this.shouldExposeDevVerificationLink();
    if (!exposeDevVerificationLink) {
      await this.mailer.sendEmailVerificationEmail(user.email, verificationLink, { expiresAt });
    }

    return {
      userId: user.id,
      email: user.email,
      verificationRequired: true,
      verificationLink: exposeDevVerificationLink ? verificationLink : undefined,
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verificationToken) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Verification link is invalid.",
        hint: "Request a new verification email and try again.",
      });
    }
    if (verificationToken.usedAt) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: "Verification link has already been used.",
        hint: "Sign in to continue.",
      });
    }
    if (verificationToken.expiresAt < new Date()) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: "Verification link has expired.",
        hint: "Request a new verification email and try again.",
      });
    }

    const verifiedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: verifiedAt },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId: verificationToken.userId, usedAt: null },
        data: { usedAt: verifiedAt },
      });
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: {
          verificationStatus: "VERIFIED",
          emailVerifiedAt: verifiedAt,
          lastLoginAt: verifiedAt,
        },
      });
    });

    const accessToken = this.signAccessToken({ sub: verificationToken.userId });
    const refreshToken = await this.createRefreshToken(verificationToken.userId);

    return {
      accessToken,
      refreshToken,
      userId: verificationToken.userId,
      orgId: null,
    };
  }

  async resendVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Keep response generic to avoid leaking account state.
    if (!user || user.verificationStatus === "VERIFIED" || !user.isActive || user.isInternal) {
      return { accepted: true };
    }

    const { token, expiresAt } = await this.createEmailVerificationToken(user.id);
    const verificationLink = this.buildVerificationLink(token);
    const exposeDevVerificationLink = this.shouldExposeDevVerificationLink();
    if (!exposeDevVerificationLink) {
      await this.mailer.sendEmailVerificationEmail(user.email, verificationLink, { expiresAt });
    }

    return {
      accepted: true,
      verificationLink: exposeDevVerificationLink ? verificationLink : undefined,
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
    if (!user.isInternal && user.verificationStatus !== "VERIFIED") {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: "Please verify your email.",
        hint: "Open the verification link sent to your inbox, then try again.",
      });
    }

    if (this.isLedgerliteProductManagerUser(user)) {
      const accessToken = this.signAccessToken({
        sub: user.id,
        isInternal: true,
        internalRole: LEDGERLITE_PRODUCT_MANAGER,
      });
      const refreshToken = await this.createRefreshToken(user.id);
      return { accessToken, refreshToken };
    }

    let membership = null;
    if (payload.membershipId) {
      membership = await this.prisma.membership.findFirst({
        where: { id: payload.membershipId, userId: user.id, isActive: true },
        include: { role: true, org: { select: { isActive: true } } },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
      if (!membership.org?.isActive) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Organization is deactivated.",
          hint: "Contact support to re-enable your organization.",
        });
      }
    } else if (payload.orgId) {
      membership = await this.prisma.membership.findFirst({
        where: { orgId: payload.orgId, userId: user.id, isActive: true },
        include: { role: true, org: { select: { isActive: true } } },
      });
      if (!membership) {
        throw new UnauthorizedException("Membership is inactive or invalid");
      }
      if (!membership.org?.isActive) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Organization is deactivated.",
          hint: "Contact support to re-enable your organization.",
        });
      }
    } else {
      const membershipCount = await this.prisma.membership.count({
        where: { userId: user.id, isActive: true, org: { isActive: true } },
      });
      if (membershipCount > 1) {
        throw new UnauthorizedException("Multiple organizations found. Please sign in again.");
      }
      if (membershipCount === 0) {
        const disabledOrgMembership = await this.prisma.membership.findFirst({
          where: { userId: user.id, isActive: true, org: { isActive: false } },
          include: { org: true },
        });
        if (disabledOrgMembership) {
          throw new UnauthorizedException({
            code: ErrorCodes.UNAUTHORIZED,
            message: "Organization is deactivated.",
            hint: "Contact support to re-enable your organization.",
          });
        }
        const accessToken = this.signAccessToken({ sub: user.id });
        const refreshToken = await this.createRefreshToken(user.id);
        return { accessToken, refreshToken };
      }
      membership = await this.prisma.membership.findFirst({
        where: { userId: user.id, isActive: true, org: { isActive: true } },
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
      select: { id: true, email: true, isActive: true, isInternal: true, internalRole: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid user");
    }
    if (user.isInternal && !this.isLedgerliteProductManagerUser(user)) {
      throw new UnauthorizedException("Invalid user");
    }

    if (this.isLedgerliteProductManagerUser(user)) {
      return {
        user: { id: user.id, email: user.email, isInternal: true, internalRole: LEDGERLITE_PRODUCT_MANAGER },
        org: null,
        onboardingSetupStatus: null,
        permissions: [...PRODUCT_MANAGER_PERMISSIONS],
      };
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
      if (!membership.org?.isActive) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Organization is deactivated.",
          hint: "Contact support to re-enable your organization.",
        });
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
      if (!membership.org?.isActive) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Organization is deactivated.",
          hint: "Contact support to re-enable your organization.",
        });
      }
    }

    const onboardingSetupStatus = membership
      ? await this.resolveOnboardingSetupStatus(membership.id, membership.orgId, user.id)
      : null;

    const roleId = membership?.roleId ?? payload.roleId;
    const permissions = roleId
      ? await this.prisma.rolePermission.findMany({
          where: { roleId },
          select: { permissionCode: true },
        })
      : [];

    return {
      user: { id: user.id, email: user.email, isInternal: false, internalRole: null },
      org: membership
        ? {
            id: membership.org.id,
            name: membership.org.name,
            vatEnabled: membership.org.vatEnabled,
            baseCurrency: membership.org.baseCurrency ?? undefined,
          }
        : null,
      onboardingSetupStatus,
      permissions: permissions.map((item) => item.permissionCode),
    };
  }

  private async resolveOnboardingSetupStatus(
    membershipId: string,
    orgId: string,
    userId: string,
  ): Promise<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"> {
    const progress = await this.prisma.onboardingProgress.findUnique({
      where: { membershipId },
      select: {
        completedAt: true,
        steps: {
          select: { status: true },
        },
      },
    });

    if (!progress) {
      const fallbackProgress = await this.prisma.onboardingProgress.findUnique({
        where: { orgId_userId: { orgId, userId } },
        select: {
          completedAt: true,
          steps: {
            select: { status: true },
          },
        },
      });
      if (!fallbackProgress) {
        const [org, settings] = await Promise.all([
          this.prisma.organization.findUnique({
            where: { id: orgId },
            select: {
              name: true,
              countryCode: true,
              baseCurrency: true,
              vatEnabled: true,
              vatTrn: true,
            },
          }),
          this.prisma.orgSettings.findUnique({
            where: { orgId },
            select: {
              defaultVatBehavior: true,
            },
          }),
        ]);

        const hasAnySetupData = Boolean(
          org?.countryCode?.trim() ||
            org?.baseCurrency?.trim() ||
            org?.vatTrn?.trim() ||
            settings?.defaultVatBehavior,
        );
        const hasCoreSetupData = Boolean(
          org?.name?.trim() &&
            org?.countryCode?.trim() &&
            org?.baseCurrency?.trim() &&
            settings?.defaultVatBehavior &&
            (!org?.vatEnabled || Boolean(org.vatTrn?.trim())),
        );

        if (hasCoreSetupData) {
          return "COMPLETED";
        }
        return hasAnySetupData ? "IN_PROGRESS" : "NOT_STARTED";
      }
      if (fallbackProgress.completedAt) {
        return "COMPLETED";
      }
      return fallbackProgress.steps.some((step) => step.status !== "PENDING") ? "IN_PROGRESS" : "NOT_STARTED";
    }

    if (progress.completedAt) {
      return "COMPLETED";
    }

    return progress.steps.some((step) => step.status !== "PENDING") ? "IN_PROGRESS" : "NOT_STARTED";
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

  private async createEmailVerificationToken(userId: string) {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + this.emailVerificationTtlHours * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private buildVerificationLink(token: string) {
    const baseUrl = getApiEnv().WEB_BASE_URL.replace(/\/+$/, "");
    return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private shouldExposeDevVerificationLink() {
    return getApiEnv().SENTRY_ENVIRONMENT === "development" && process.env.NODE_ENV !== "test";
  }

  private isLedgerliteProductManagerUser(user: {
    isInternal: boolean;
    internalRole?: "MANAGER" | null;
  }) {
    return user.isInternal && user.internalRole === "MANAGER";
  }
}
