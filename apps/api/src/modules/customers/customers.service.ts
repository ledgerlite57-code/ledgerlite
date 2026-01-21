import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { type CustomerCreateInput, type CustomerUpdateInput } from "@ledgerlite/shared";

type CustomerRecord = Prisma.CustomerGetPayload<Prisma.CustomerDefaultArgs>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listCustomers(orgId?: string, search?: string, isActive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.CustomerWhereInput = { orgId };
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

    return this.prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async getCustomer(orgId?: string, customerId?: string) {
    if (!orgId || !customerId) {
      throw new NotFoundException("Customer not found");
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, orgId },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  async createCustomer(
    orgId?: string,
    actorUserId?: string,
    input?: CustomerCreateInput,
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
        return existingKey.response as unknown as CustomerRecord;
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        orgId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        billingAddress: input.billingAddress ? { formatted: input.billingAddress } : undefined,
        shippingAddress: input.shippingAddress ? { formatted: input.shippingAddress } : undefined,
        trn: input.trn,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        creditLimit: input.creditLimit,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "CUSTOMER",
      entityId: customer.id,
      action: AuditAction.CREATE,
      after: customer,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: customer as unknown as object,
          statusCode: 201,
        },
      });
    }

    return customer;
  }

  async updateCustomer(
    orgId?: string,
    customerId?: string,
    actorUserId?: string,
    input?: CustomerUpdateInput,
  ) {
    if (!orgId || !customerId) {
      throw new NotFoundException("Customer not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, orgId },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        name: input.name ?? customer.name,
        email: input.email ?? customer.email,
        phone: input.phone ?? customer.phone,
        billingAddress: input.billingAddress !== undefined ? { formatted: input.billingAddress } : undefined,
        shippingAddress: input.shippingAddress !== undefined ? { formatted: input.shippingAddress } : undefined,
        trn: input.trn ?? customer.trn,
        paymentTermsDays: input.paymentTermsDays ?? customer.paymentTermsDays,
        creditLimit: input.creditLimit ?? customer.creditLimit,
        isActive: input.isActive ?? customer.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "CUSTOMER",
      entityId: customerId,
      action: AuditAction.UPDATE,
      before: customer,
      after: updated,
    });

    return updated;
  }
}
