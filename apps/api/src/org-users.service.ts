import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./common/audit.service";
import { hashRequestBody } from "./common/idempotency";

type InviteCreateInput = {
  email: string;
  roleId: string;
  expiresInDays?: number;
};

type InviteAcceptInput = {
  token: string;
  password: string;
};

type MembershipUpdateInput = {
  roleId?: string;
  isActive?: boolean;
};

@Injectable()
export class OrgUsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

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

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as { inviteId: string; token: string; expiresAt: Date };
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
        email: input.email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw new ConflictException("Pending invite already exists");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.invite.create({
      data: {
        orgId,
        email: input.email,
        roleId: input.roleId,
        tokenHash,
        expiresAt,
        createdByUserId: actorUserId ?? undefined,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.CREATE,
      after: { email: invite.email, roleId: invite.roleId, expiresAt: invite.expiresAt },
    });

    const response = {
      inviteId: invite.id,
      token,
      expiresAt: invite.expiresAt,
    };

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }

    return response;
  }

  async acceptInvite(input?: InviteAcceptInput) {
    if (!input) {
      throw new BadRequestException("Missing payload");
    }
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const invite = await this.prisma.invite.findFirst({
      where: { tokenHash, acceptedAt: null },
    });
    if (!invite) {
      throw new NotFoundException("Invite not found");
    }
    if (invite.expiresAt < new Date()) {
      throw new ConflictException("Invite expired");
    }

    let user = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (!user) {
      const passwordHash = await argon2.hash(input.password);
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          isActive: true,
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
      data: { acceptedAt: new Date() },
    });

    await this.audit.log({
      orgId: invite.orgId,
      actorUserId: user.id,
      entityType: "INVITE",
      entityId: invite.id,
      action: AuditAction.UPDATE,
      after: { acceptedAt: new Date().toISOString() },
    });

    return { status: "ok", membershipId: membership.id };
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
