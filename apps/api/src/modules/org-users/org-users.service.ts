import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { MailerService } from "../../common/mailer.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { getApiEnv } from "../../common/env";

type InviteCreateInput = {
  email: string;
  roleId: string;
  expiresInDays?: number;
};

type InviteResendInput = {
  expiresInDays?: number;
};

type InviteAcceptInput = {
  token: string;
  password: string;
};

type InviteLifecycleStatus = "SENT" | "ACCEPTED" | "EXPIRED" | "REVOKED";

type InviteCreateResponse = {
  inviteId: string;
  token: string;
  expiresAt: Date;
  status: InviteLifecycleStatus;
  lastSentAt: Date;
  sendCount: number;
};

type InviteStatusRecord = {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  lastSentAt: Date;
  sendCount: number;
  createdAt: Date;
  createdByUserId: string | null;
  createdByEmail?: string | null;
  status: InviteLifecycleStatus;
};

type MembershipUpdateInput = {
  roleId?: string;
  isActive?: boolean;
};

const DEFAULT_INVITE_EXPIRY_DAYS = 2;

const deriveInviteStatus = (invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InviteLifecycleStatus => {
  if (invite.revokedAt) {
    return "REVOKED";
  }
  if (invite.acceptedAt) {
    return "ACCEPTED";
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return "SENT";
};

@Injectable()
export class OrgUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  async listUsers(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    return this.prisma.membership.findMany({
      where: { orgId },
      include: {
        user: true,
        role: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listInvites(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    const invites = await this.prisma.invite.findMany({
      where: { orgId },
      include: {
        role: { select: { id: true, name: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return invites.map((invite) => this.toInviteStatusRecord(invite));
  }

  async createInvite(
    orgId?: string,
    actorUserId?: string,
    input?: InviteCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }
    const email = input.email.trim().toLowerCase();

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "org-users.invite",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody(input) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as InviteCreateResponse;
      }
    }

    const role = await this.prisma.role.findFirst({
      where: { id: input.roleId, orgId },
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }

    const existing = await this.prisma.invite.findFirst({
      where: {
        orgId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw new ConflictException("Active invite already exists");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = this.resolveInviteExpiry(input.expiresInDays);

    const invite = await this.prisma.invite.create({
      data: {
        orgId,
        email,
        roleId: input.roleId,
        tokenHash,
        expiresAt,
        lastSentAt: new Date(),
        sendCount: 1,
        createdByUserId: actorUserId ?? undefined,
      },
    });

    const inviteStatus = this.toInviteStatusRecord({
      ...invite,
      role: { id: role.id, name: role.name },
      createdBy: null,
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.CREATE,
      after: inviteStatus,
    });

    const baseUrl = getApiEnv().WEB_BASE_URL.replace(/\/+$/, "");
    const inviteLink = `${baseUrl}/invite?token=${encodeURIComponent(token)}`;
    await this.mailer.sendInviteEmail(invite.email, inviteLink, {
      orgName: await this.resolveOrgName(orgId),
      inviterEmail: actorUserId ? await this.resolveUserEmail(actorUserId) : undefined,
      roleName: role.name,
      expiresAt: invite.expiresAt,
      sendCount: invite.sendCount,
      isResend: false,
    });
    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.UPDATE,
      after: {
        event: "EMAIL_SENT",
        status: deriveInviteStatus(invite),
        roleName: role.name,
        sendCount: invite.sendCount,
        lastSentAt: invite.lastSentAt,
      },
    });

    const response = {
      inviteId: invite.id,
      token,
      expiresAt: invite.expiresAt,
      status: deriveInviteStatus(invite),
      lastSentAt: invite.lastSentAt,
      sendCount: invite.sendCount,
    };

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }

    return response;
  }

  async resendInvite(
    orgId?: string,
    inviteId?: string,
    actorUserId?: string,
    input?: InviteResendInput,
    idempotencyKey?: string,
  ) {
    if (!orgId || !inviteId) {
      throw new NotFoundException("Invite not found");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "org-users.invite.resend",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody({ inviteId, expiresInDays: input?.expiresInDays ?? null }) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as InviteCreateResponse;
      }
    }

    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, orgId },
      include: {
        role: { select: { id: true, name: true } },
        createdBy: { select: { email: true } },
      },
    });
    if (!invite) {
      throw new NotFoundException("Invite not found");
    }
    const currentStatus = deriveInviteStatus(invite);
    if (currentStatus === "ACCEPTED") {
      throw new ConflictException("Invite already accepted");
    }
    if (currentStatus === "REVOKED") {
      throw new ConflictException("Invite revoked");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const updated = await this.prisma.invite.update({
      where: { id: invite.id },
      data: {
        tokenHash,
        expiresAt: this.resolveInviteExpiry(input?.expiresInDays),
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
      include: {
        role: { select: { id: true, name: true } },
        createdBy: { select: { email: true } },
      },
    });

    const beforeStatus = this.toInviteStatusRecord(invite);
    const afterStatus = this.toInviteStatusRecord(updated);

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.UPDATE,
      before: beforeStatus,
      after: {
        ...afterStatus,
        event: "RESEND",
      },
    });

    const baseUrl = getApiEnv().WEB_BASE_URL.replace(/\/+$/, "");
    const inviteLink = `${baseUrl}/invite?token=${encodeURIComponent(token)}`;
    await this.mailer.sendInviteEmail(updated.email, inviteLink, {
      orgName: await this.resolveOrgName(orgId),
      inviterEmail: actorUserId ? await this.resolveUserEmail(actorUserId) : updated.createdBy?.email ?? undefined,
      roleName: updated.role.name,
      expiresAt: updated.expiresAt,
      sendCount: updated.sendCount,
      isResend: true,
    });
    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVITE",
      entityId: updated.id,
      action: AuditAction.UPDATE,
      after: {
        event: "EMAIL_SENT",
        status: afterStatus.status,
        roleName: updated.role.name,
        sendCount: updated.sendCount,
        lastSentAt: updated.lastSentAt,
      },
    });

    const response: InviteCreateResponse = {
      inviteId: updated.id,
      token,
      expiresAt: updated.expiresAt,
      status: afterStatus.status,
      lastSentAt: updated.lastSentAt,
      sendCount: updated.sendCount,
    };

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 200,
        },
      });
    }

    return response;
  }

  async revokeInvite(orgId?: string, inviteId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !inviteId) {
      throw new NotFoundException("Invite not found");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "org-users.invite.revoke",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody({ inviteId, action: "REVOKE" }) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as InviteStatusRecord;
      }
    }

    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, orgId },
      include: {
        role: { select: { id: true, name: true } },
        createdBy: { select: { email: true } },
      },
    });
    if (!invite) {
      throw new NotFoundException("Invite not found");
    }
    const currentStatus = deriveInviteStatus(invite);
    if (currentStatus === "ACCEPTED") {
      throw new ConflictException("Invite already accepted");
    }

    const beforeStatus = this.toInviteStatusRecord(invite);
    const updated = invite.revokedAt
      ? invite
      : await this.prisma.invite.update({
          where: { id: invite.id },
          data: { revokedAt: new Date() },
          include: {
            role: { select: { id: true, name: true } },
            createdBy: { select: { email: true } },
          },
        });
    const afterStatus = this.toInviteStatusRecord(updated);

    if (!invite.revokedAt) {
      await this.audit.log({
        orgId,
        actorUserId,
        entityType: "INVITE",
        entityId: invite.id,
        action: AuditAction.UPDATE,
        before: beforeStatus,
        after: {
          ...afterStatus,
          event: "REVOKE",
        },
      });
    }

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: afterStatus as unknown as object,
          statusCode: 200,
        },
      });
    }

    return afterStatus;
  }

  async acceptInvite(input?: InviteAcceptInput) {
    if (!input) {
      throw new BadRequestException("Missing payload");
    }
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const invite = await this.prisma.invite.findFirst({
      where: { tokenHash },
    });
    if (!invite) {
      throw new NotFoundException("Invite not found");
    }
    if (invite.revokedAt) {
      throw new ConflictException("Invite revoked");
    }
    if (invite.acceptedAt) {
      throw new ConflictException("Invite already accepted");
    }
    if (invite.expiresAt < new Date()) {
      throw new ConflictException("Invite expired");
    }

    const acceptedAt = new Date();
    const passwordHash = await argon2.hash(input.password);

    let user = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          isActive: true,
          verificationStatus: "VERIFIED",
          emailVerifiedAt: acceptedAt,
        },
      });
    } else if (
      !user.passwordHash ||
      user.verificationStatus !== "VERIFIED" ||
      !user.emailVerifiedAt ||
      !user.isActive
    ) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          verificationStatus: "VERIFIED",
          emailVerifiedAt: acceptedAt,
        },
      });
    }

    const membership = await this.prisma.membership.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
      update: { roleId: invite.roleId, isActive: true },
      create: {
        orgId: invite.orgId,
        userId: user.id,
        roleId: invite.roleId,
        isActive: true,
      },
    });

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt },
    });

    await this.audit.log({
      orgId: invite.orgId,
      actorUserId: user.id,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.UPDATE,
      after: { acceptedAt: acceptedAt.toISOString(), status: "ACCEPTED" },
    });

    return { status: "ok", membershipId: membership.id };
  }

  private toInviteStatusRecord(invite: {
    id: string;
    email: string;
    roleId: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    lastSentAt: Date;
    sendCount: number;
    createdAt: Date;
    createdByUserId: string | null;
    role: { id: string; name: string };
    createdBy?: { email: string } | null;
  }): InviteStatusRecord {
    return {
      id: invite.id,
      email: invite.email,
      roleId: invite.roleId,
      roleName: invite.role.name,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      lastSentAt: invite.lastSentAt,
      sendCount: invite.sendCount,
      createdAt: invite.createdAt,
      createdByUserId: invite.createdByUserId,
      createdByEmail: invite.createdBy?.email ?? null,
      status: deriveInviteStatus(invite),
    };
  }

  private resolveInviteExpiry(expiresInDays?: number) {
    return new Date(Date.now() + (expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS) * 24 * 60 * 60 * 1000);
  }

  private async resolveOrgName(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    return org?.name;
  }

  private async resolveUserEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email;
  }

  async updateMembership(orgId?: string, membershipId?: string, actorUserId?: string, input?: MembershipUpdateInput) {
    if (!orgId || !membershipId) {
      throw new NotFoundException("Membership not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });
    if (!membership) {
      throw new NotFoundException("Membership not found");
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        roleId: input.roleId ?? membership.roleId,
        isActive: input.isActive ?? membership.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "MEMBERSHIP",
      entityId: membershipId,
      action: AuditAction.UPDATE,
      before: membership,
      after: updated,
    });

    return updated;
  }
}
