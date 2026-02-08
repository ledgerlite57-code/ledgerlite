import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { dec, round2 } from "../../common/money";
import { type CustomerCreateInput, type CustomerUpdateInput, type PaginationInput } from "@ledgerlite/shared";
import { CustomersRepository } from "./customers.repo";

type CustomerRecord = Prisma.CustomerGetPayload<Prisma.CustomerDefaultArgs>;
type CustomerListParams = PaginationInput & { isActive?: boolean };

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customersRepo: CustomersRepository,
  ) {}

  async listCustomers(orgId?: string, params?: CustomerListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const { data, total } = await this.customersRepo.list({
      orgId,
      q: params?.q,
      isActive: params?.isActive,
      page,
      pageSize,
      sortBy: params?.sortBy,
      sortDir: params?.sortDir,
    });
    const creditBalances = await this.computeCustomerCreditBalances(
      orgId,
      data.map((customer) => customer.id),
    );

    return {
      data: data.map((customer) => ({
        ...customer,
        unappliedCreditBalance: creditBalances.get(customer.id) ?? "0.00",
      })),
      pageInfo: {
        page,
        pageSize,
        total,
      },
    };
  }

  async getCustomer(orgId?: string, customerId?: string) {
    if (!orgId || !customerId) {
      throw new NotFoundException("Customer not found");
    }
    const customer = await this.customersRepo.findById(orgId, customerId);
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const creditBalances = await this.computeCustomerCreditBalances(orgId, [customer.id]);
    return {
      ...customer,
      unappliedCreditBalance: creditBalances.get(customer.id) ?? "0.00",
    };
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

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "customers.create",
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
        return existingKey.response as unknown as CustomerRecord;
      }
    }

    const customer = await this.customersRepo.create({
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
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "CUSTOMER",
      entityId: customer.id,
      action: AuditAction.CREATE,
      after: customer,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
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

    const customer = await this.customersRepo.findById(orgId, customerId);
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const updated = await this.customersRepo.update(customerId, {
      name: input.name ?? customer.name,
      email: input.email ?? customer.email,
      phone: input.phone ?? customer.phone,
      billingAddress: input.billingAddress !== undefined ? { formatted: input.billingAddress } : undefined,
      shippingAddress: input.shippingAddress !== undefined ? { formatted: input.shippingAddress } : undefined,
      trn: input.trn ?? customer.trn,
      paymentTermsDays: input.paymentTermsDays ?? customer.paymentTermsDays,
      creditLimit: input.creditLimit ?? customer.creditLimit,
      isActive: input.isActive ?? customer.isActive,
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

  private async computeCustomerCreditBalances(orgId: string, customerIds: string[]) {
    const balances = new Map<string, Prisma.Decimal>();
    if (customerIds.length === 0) {
      return new Map<string, string>();
    }

    const creditNotes = await this.prisma.creditNote.findMany({
      where: {
        orgId,
        status: "POSTED",
        customerId: { in: customerIds },
      },
      select: {
        customerId: true,
        total: true,
        allocations: { select: { amount: true } },
        refunds: { select: { amount: true } },
      },
    });

    for (const creditNote of creditNotes) {
      const applied = round2(creditNote.allocations.reduce((sum, allocation) => dec(sum).add(allocation.amount), dec(0)));
      const refunded = round2(creditNote.refunds.reduce((sum, refund) => dec(sum).add(refund.amount), dec(0)));
      const remaining = round2(dec(creditNote.total).sub(applied).sub(refunded));
      if (!remaining.greaterThan(0)) {
        continue;
      }
      const current = balances.get(creditNote.customerId) ?? dec(0);
      balances.set(creditNote.customerId, round2(dec(current).add(remaining)));
    }

    return new Map(Array.from(balances.entries()).map(([customerId, amount]) => [customerId, amount.toFixed(2)]));
  }
}
