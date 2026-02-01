import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, TaxType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type TaxCodeCreateInput, type TaxCodeUpdateInput, type PaginationInput } from "@ledgerlite/shared";

type TaxCodeRecord = Prisma.TaxCodeGetPayload<Prisma.TaxCodeDefaultArgs>;
type TaxCodeListParams = PaginationInput & { isActive?: boolean };

@Injectable()
export class TaxCodesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listTaxCodes(orgId?: string, params?: TaxCodeListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.TaxCodeWhereInput = { orgId };
    if (typeof params?.isActive === "boolean") {
      where.isActive = params.isActive;
    }
    if (params?.q) {
      where.name = { contains: params.q, mode: "insensitive" };
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const orderBy = this.resolveSort(params?.sortBy, params?.sortDir);

    const [data, total] = await Promise.all([
      this.prisma.taxCode.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.taxCode.count({ where }),
    ]);

    return {
      data,
      pageInfo: {
        page,
        pageSize,
        total,
      },
    };
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

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "tax-codes.create",
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

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
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

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.TaxCodeOrderByWithRelationInput {
    if (sortBy && ["name", "createdAt"].includes(sortBy)) {
      return { [sortBy]: sortDir ?? "asc" } as Prisma.TaxCodeOrderByWithRelationInput;
    }
    return { name: "asc" };
  }
}
