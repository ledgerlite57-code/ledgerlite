import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type VendorCreateInput, type VendorUpdateInput, type PaginationInput } from "@ledgerlite/shared";

type VendorRecord = Prisma.VendorGetPayload<Prisma.VendorDefaultArgs>;
type VendorListParams = PaginationInput & { isActive?: boolean };

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listVendors(orgId?: string, params?: VendorListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.VendorWhereInput = { orgId };
    if (typeof params?.isActive === "boolean") {
      where.isActive = params.isActive;
    }
    if (params?.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
        { phone: { contains: params.q, mode: "insensitive" } },
      ];
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const orderBy = this.resolveSort(params?.sortBy, params?.sortDir);

    const [data, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.vendor.count({ where }),
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

  async getVendor(orgId?: string, vendorId?: string) {
    if (!orgId || !vendorId) {
      throw new NotFoundException("Vendor not found");
    }
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
    });
    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }
    return vendor;
  }

  async createVendor(
    orgId?: string,
    actorUserId?: string,
    input?: VendorCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "vendors.create",
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
        return existingKey.response as unknown as VendorRecord;
      }
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        orgId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address ? { formatted: input.address } : undefined,
        trn: input.trn,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "VENDOR",
      entityId: vendor.id,
      action: AuditAction.CREATE,
      after: vendor,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: vendor as unknown as object,
          statusCode: 201,
        },
      });
    }

    return vendor;
  }

  async updateVendor(orgId?: string, vendorId?: string, actorUserId?: string, input?: VendorUpdateInput) {
    if (!orgId || !vendorId) {
      throw new NotFoundException("Vendor not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, orgId },
    });
    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        name: input.name ?? vendor.name,
        email: input.email ?? vendor.email,
        phone: input.phone ?? vendor.phone,
        address: input.address !== undefined ? { formatted: input.address } : undefined,
        trn: input.trn ?? vendor.trn,
        paymentTermsDays: input.paymentTermsDays ?? vendor.paymentTermsDays,
        isActive: input.isActive ?? vendor.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "VENDOR",
      entityId: vendorId,
      action: AuditAction.UPDATE,
      before: vendor,
      after: updated,
    });

    return updated;
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.VendorOrderByWithRelationInput {
    if (sortBy && ["name", "createdAt"].includes(sortBy)) {
      return { [sortBy]: sortDir ?? "asc" } as Prisma.VendorOrderByWithRelationInput;
    }
    return { name: "asc" };
  }
}
