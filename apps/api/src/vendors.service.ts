import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./common/audit.service";
import { hashRequestBody } from "./common/idempotency";
import { type VendorCreateInput, type VendorUpdateInput } from "@ledgerlite/shared";

type VendorRecord = Prisma.VendorGetPayload<{}>;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listVendors(orgId?: string, search?: string, isActive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.VendorWhereInput = { orgId };
    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
    });
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

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
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

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
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
}
