import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, TaxType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { type TaxCodeCreateInput, type TaxCodeUpdateInput } from "@ledgerlite/shared";

type TaxCodeRecord = Prisma.TaxCodeGetPayload<Prisma.TaxCodeDefaultArgs>;

@Injectable()
export class TaxCodesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listTaxCodes(orgId?: string, search?: string, isActive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.TaxCodeWhereInput = { orgId };
    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    return this.prisma.taxCode.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async getTaxCode(orgId?: string, taxCodeId?: string) {
    if (!orgId || !taxCodeId) {
      throw new NotFoundException("Tax code not found");
    }
    const taxCode = await this.prisma.taxCode.findFirst({
      where: { id: taxCodeId, orgId },
    });
    if (!taxCode) {
      throw new NotFoundException("Tax code not found");
    }
    return taxCode;
  }

  async createTaxCode(
    orgId?: string,
    actorUserId?: string,
    input?: TaxCodeCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org?.vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
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
        return existingKey.response as unknown as TaxCodeRecord;
      }
    }

    const existing = await this.prisma.taxCode.findFirst({
      where: { orgId, name: input.name },
    });
    if (existing) {
      throw new ConflictException("Tax code name already exists");
    }

    const taxCode = await this.prisma.taxCode.create({
      data: {
        orgId,
        name: input.name,
        rate: input.rate,
        type: input.type as TaxType,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "TAX_CODE",
      entityId: taxCode.id,
      action: AuditAction.CREATE,
      after: taxCode,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: taxCode as unknown as object,
          statusCode: 201,
        },
      });
    }

    return taxCode;
  }

  async updateTaxCode(orgId?: string, taxCodeId?: string, actorUserId?: string, input?: TaxCodeUpdateInput) {
    if (!orgId || !taxCodeId) {
      throw new NotFoundException("Tax code not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org?.vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCode = await this.prisma.taxCode.findFirst({
      where: { id: taxCodeId, orgId },
    });
    if (!taxCode) {
      throw new NotFoundException("Tax code not found");
    }

    if (input.name && input.name !== taxCode.name) {
      const existing = await this.prisma.taxCode.findFirst({
        where: { orgId, name: input.name },
      });
      if (existing) {
        throw new ConflictException("Tax code name already exists");
      }
    }

    const updated = await this.prisma.taxCode.update({
      where: { id: taxCodeId },
      data: {
        name: input.name ?? taxCode.name,
        rate: input.rate ?? taxCode.rate,
        type: input.type ? (input.type as TaxType) : taxCode.type,
        isActive: input.isActive ?? taxCode.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "TAX_CODE",
      entityId: taxCodeId,
      action: AuditAction.UPDATE,
      before: taxCode,
      after: updated,
    });

    return updated;
  }
}
