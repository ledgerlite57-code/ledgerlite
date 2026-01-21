import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./common/audit.service";
import { hashRequestBody } from "./common/idempotency";

type AccountCreateInput = {
  code: string;
  name: string;
  type: string;
  subtype?: string;
  isActive?: boolean;
};

type AccountUpdateInput = Partial<AccountCreateInput>;
type AccountRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  isSystem: boolean;
  isActive: boolean;
};

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listAccounts(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    return this.prisma.account.findMany({
      where: { orgId },
      orderBy: [{ code: "asc" }],
    });
  }

  async createAccount(
    orgId?: string,
    actorUserId?: string,
    input?: AccountCreateInput,
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
        return existingKey.response as unknown as AccountRecord;
      }
    }

    const exists = await this.prisma.account.findFirst({
      where: { orgId, code: input.code },
    });
    if (exists) {
      throw new ConflictException("Account code already exists");
    }

    const account = await this.prisma.account.create({
      data: {
        orgId,
        code: input.code,
        name: input.name,
        type: input.type as any,
        subtype: input.subtype as any,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ACCOUNT",
      entityId: account.id,
      action: AuditAction.CREATE,
      after: account,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: account as unknown as object,
          statusCode: 201,
        },
      });
    }

    return account;
  }

  async updateAccount(orgId?: string, accountId?: string, actorUserId?: string, input?: AccountUpdateInput) {
    if (!orgId || !accountId) {
      throw new NotFoundException("Account not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, orgId },
    });
    if (!account) {
      throw new NotFoundException("Account not found");
    }

    if (input.code && input.code !== account.code) {
      const existing = await this.prisma.account.findFirst({
        where: { orgId, code: input.code },
      });
      if (existing) {
        throw new ConflictException("Account code already exists");
      }
    }

    if (account.isSystem) {
      if (input.type && input.type !== account.type) {
        throw new ConflictException("System account type cannot be changed");
      }
      if (input.subtype && input.subtype !== account.subtype) {
        throw new ConflictException("System account subtype cannot be changed");
      }
      if (input.isActive === false) {
        throw new ConflictException("System account cannot be deactivated");
      }
    }

    if (input.isActive === false && account.isActive) {
      const glCount = await this.prisma.gLLine.count({ where: { accountId } });
      if (glCount > 0) {
        throw new ConflictException("Account in use cannot be deactivated");
      }
    }

    if ((input.type && input.type !== account.type) || (input.subtype && input.subtype !== account.subtype)) {
      const glCount = await this.prisma.gLLine.count({ where: { accountId } });
      if (glCount > 0) {
        throw new ConflictException("Account in use cannot change type/subtype");
      }
    }

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        code: input.code ?? account.code,
        name: input.name ?? account.name,
        type: (input.type as any) ?? account.type,
        subtype: (input.subtype as any) ?? account.subtype,
        isActive: input.isActive ?? account.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ACCOUNT",
      entityId: accountId,
      action: AuditAction.UPDATE,
      before: account,
      after: updated,
    });

    return updated;
  }
}
