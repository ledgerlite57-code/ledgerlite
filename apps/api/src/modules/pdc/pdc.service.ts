import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, PaymentStatus, Prisma, PdcDirection, PdcStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type PdcCreateInput, type PdcUpdateInput } from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { dec, eq, round2, type MoneyValue } from "../../common/money";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";

type PdcRecord = Prisma.PdcGetPayload<{
  include: {
    customer: true;
    vendor: true;
    bankAccount: { include: { glAccount: true } };
    allocations: { include: { invoice: true; bill: true } };
  };
}>;

type PdcListParams = {
  q?: string;
  status?: string;
  direction?: string;
  customerId?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

type IncomingAllocationInput = { invoiceId?: string; amount: MoneyValue };
type OutgoingAllocationInput = { billId?: string; amount: MoneyValue };

@Injectable()
export class PdcService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listPdc(orgId?: string, params?: PdcListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.PdcWhereInput = { orgId };
    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (Object.values(PdcStatus).includes(normalized as PdcStatus)) {
        where.status = normalized as PdcStatus;
      }
    }
    if (params?.direction) {
      const normalized = params.direction.toUpperCase();
      if (Object.values(PdcDirection).includes(normalized as PdcDirection)) {
        where.direction = normalized as PdcDirection;
      }
    }
    if (params?.customerId) {
      where.customerId = params.customerId;
    }
    if (params?.vendorId) {
      where.vendorId = params.vendorId;
    }
    if (params?.q) {
      where.OR = [
        { number: { contains: params.q, mode: "insensitive" } },
        { chequeNumber: { contains: params.q, mode: "insensitive" } },
        { reference: { contains: params.q, mode: "insensitive" } },
        { customer: { name: { contains: params.q, mode: "insensitive" } } },
        { vendor: { name: { contains: params.q, mode: "insensitive" } } },
      ];
    }
    if (params?.dateFrom || params?.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (params.dateFrom) {
        dateFilter.gte = toStartOfDayUtc(params.dateFrom);
      }
      if (params.dateTo) {
        dateFilter.lte = toEndOfDayUtc(params.dateTo);
      }
      where.expectedClearDate = dateFilter;
    }
    if (params?.amountMin !== undefined || params?.amountMax !== undefined) {
      const amountFilter: Prisma.DecimalFilter = {};
      if (params.amountMin !== undefined) {
        amountFilter.gte = params.amountMin;
      }
      if (params.amountMax !== undefined) {
        amountFilter.lte = params.amountMax;
      }
      where.amountTotal = amountFilter;
    }

    return this.prisma.pdc.findMany({
      where,
      include: {
        customer: true,
        vendor: true,
        bankAccount: true,
      },
      orderBy: [{ expectedClearDate: "desc" }, { createdAt: "desc" }],
    });
  }

  async getPdc(orgId?: string, pdcId?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }

    const pdc = await this.prisma.pdc.findFirst({
      where: { id: pdcId, orgId },
      include: {
        customer: true,
        vendor: true,
        bankAccount: { include: { glAccount: true } },
        allocations: { include: { invoice: true, bill: true } },
      },
    });
    if (!pdc) {
      throw new NotFoundException("PDC not found");
    }
    return pdc;
  }

  async createPdc(
    orgId?: string,
    actorUserId?: string,
    input?: PdcCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const createKey = buildIdempotencyKey(idempotencyKey, {
      scope: "pdc.create",
      actorUserId,
    });
    const requestHash = createKey ? hashRequestBody(input) : null;
    if (createKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: createKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as PdcRecord;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const direction = input.direction as PdcDirection;
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, orgId, isActive: true },
      include: { glAccount: true },
    });
    if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
      throw new BadRequestException("Bank account is not available");
    }

    const chequeDate = new Date(input.chequeDate);
    const expectedClearDate = new Date(input.expectedClearDate);
    if (expectedClearDate.getTime() < chequeDate.getTime()) {
      throw new BadRequestException("Expected clear date cannot be before cheque date");
    }

    const currency = input.currency ?? bankAccount.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }
    if (bankAccount.currency && bankAccount.currency !== currency) {
      throw new BadRequestException("PDC currency must match bank account currency");
    }

    let customerId: string | undefined;
    let vendorId: string | undefined;
    let amountTotal = dec(0);
    let allocationData: Array<{ invoiceId?: string; billId?: string; amount: MoneyValue }> = [];

    if (direction === PdcDirection.INCOMING) {
      if (!input.customerId) {
        throw new BadRequestException("Customer is required for incoming PDC");
      }
      const customer = await this.prisma.customer.findFirst({
        where: { id: input.customerId, orgId },
      });
      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
      if (!customer.isActive) {
        throw new BadRequestException("Customer must be active");
      }
      customerId = customer.id;

      const allocationsByInvoice = this.normalizeIncomingAllocations(input.allocations);
      const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, customer.id);
      this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);
      amountTotal = this.sumAllocationMap(allocationsByInvoice);
      allocationData = Array.from(allocationsByInvoice.entries()).map(([invoiceId, amount]) => ({
        invoiceId,
        amount,
      }));
    } else {
      if (!input.vendorId) {
        throw new BadRequestException("Vendor is required for outgoing PDC");
      }
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: input.vendorId, orgId },
      });
      if (!vendor) {
        throw new NotFoundException("Vendor not found");
      }
      if (!vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }
      vendorId = vendor.id;

      const allocationsByBill = this.normalizeOutgoingAllocations(input.allocations);
      const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, vendor.id);
      this.validateAllocationsAgainstBills(allocationsByBill, bills);
      amountTotal = this.sumAllocationMap(allocationsByBill);
      allocationData = Array.from(allocationsByBill.entries()).map(([billId, amount]) => ({
        billId,
        amount,
      }));
    }

    let pdc: PdcRecord;
    try {
      pdc = await this.prisma.pdc.create({
        data: {
          orgId,
          direction,
          status: PdcStatus.DRAFT,
          customerId,
          vendorId,
          bankAccountId: bankAccount.id,
          chequeNumber: input.chequeNumber,
          chequeDate,
          expectedClearDate,
          currency,
          exchangeRate: input.exchangeRate ?? 1,
          amountTotal,
          reference: input.reference ?? undefined,
          memo: input.memo ?? undefined,
          createdByUserId: actorUserId,
          allocations: {
            createMany: {
              data: allocationData,
            },
          },
        },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { invoice: true, bill: true } },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Cheque number already exists for this bank account");
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PDC",
      entityId: pdc.id,
      action: AuditAction.CREATE,
      after: pdc,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: pdc as unknown as object,
          statusCode: 201,
        },
      });
    }

    return pdc;
  }

  async updatePdc(orgId?: string, pdcId?: string, actorUserId?: string, input?: PdcUpdateInput) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pdc.findFirst({
        where: { id: pdcId, orgId },
        include: { allocations: true },
      });
      if (!existing) {
        throw new NotFoundException("PDC not found");
      }
      if (existing.status !== PdcStatus.DRAFT && existing.status !== PdcStatus.SCHEDULED) {
        throw new ConflictException("Only draft or scheduled PDC can be edited");
      }

      if (input.direction && input.direction !== existing.direction) {
        throw new ConflictException("PDC direction cannot be changed");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const direction = existing.direction;
      const bankAccountId = input.bankAccountId ?? existing.bankAccountId;
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, orgId, isActive: true },
        include: { glAccount: true },
      });
      if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
        throw new BadRequestException("Bank account is not available");
      }

      const chequeDate = input.chequeDate ? new Date(input.chequeDate) : existing.chequeDate;
      const expectedClearDate = input.expectedClearDate ? new Date(input.expectedClearDate) : existing.expectedClearDate;
      if (expectedClearDate.getTime() < chequeDate.getTime()) {
        throw new BadRequestException("Expected clear date cannot be before cheque date");
      }

      const currency = input.currency ?? existing.currency ?? bankAccount.currency ?? org.baseCurrency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }
      if (bankAccount.currency && bankAccount.currency !== currency) {
        throw new BadRequestException("PDC currency must match bank account currency");
      }

      let customerId = existing.customerId ?? undefined;
      let vendorId = existing.vendorId ?? undefined;
      let amountTotal = dec(0);
      let allocationsData: Array<{ invoiceId?: string; billId?: string; amount: Prisma.Decimal }>;

      const inputAllocations = input.allocations?.map((allocation) => ({
        invoiceId: allocation.invoiceId ?? undefined,
        billId: allocation.billId ?? undefined,
        amount: allocation.amount,
      }));

      if (direction === PdcDirection.INCOMING) {
        if (input.vendorId) {
          throw new BadRequestException("Vendor is not allowed for incoming PDC");
        }
        const nextCustomerId = input.customerId ?? customerId;
        if (!nextCustomerId) {
          throw new BadRequestException("Customer is required for incoming PDC");
        }
        const customer = await tx.customer.findFirst({
          where: { id: nextCustomerId, orgId },
        });
        if (!customer) {
          throw new NotFoundException("Customer not found");
        }
        if (!customer.isActive) {
          throw new BadRequestException("Customer must be active");
        }
        customerId = customer.id;
        vendorId = undefined;

        const allocationsByInvoice = inputAllocations
          ? this.normalizeIncomingAllocations(inputAllocations)
          : this.normalizeIncomingAllocations(
              existing.allocations.map((allocation) => ({
                invoiceId: allocation.invoiceId ?? undefined,
                amount: allocation.amount,
              })),
            );
        const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, customer.id, tx);
        this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);
        amountTotal = this.sumAllocationMap(allocationsByInvoice);
        allocationsData = Array.from(allocationsByInvoice.entries()).map(([invoiceId, amount]) => ({
          invoiceId,
          amount,
        }));
      } else {
        if (input.customerId) {
          throw new BadRequestException("Customer is not allowed for outgoing PDC");
        }
        const nextVendorId = input.vendorId ?? vendorId;
        if (!nextVendorId) {
          throw new BadRequestException("Vendor is required for outgoing PDC");
        }
        const vendor = await tx.vendor.findFirst({
          where: { id: nextVendorId, orgId },
        });
        if (!vendor) {
          throw new NotFoundException("Vendor not found");
        }
        if (!vendor.isActive) {
          throw new BadRequestException("Vendor must be active");
        }
        vendorId = vendor.id;
        customerId = undefined;

        const allocationsByBill = inputAllocations
          ? this.normalizeOutgoingAllocations(inputAllocations)
          : this.normalizeOutgoingAllocations(
              existing.allocations.map((allocation) => ({
                billId: allocation.billId ?? undefined,
                amount: allocation.amount,
              })),
            );
        const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, vendor.id, tx);
        this.validateAllocationsAgainstBills(allocationsByBill, bills);
        amountTotal = this.sumAllocationMap(allocationsByBill);
        allocationsData = Array.from(allocationsByBill.entries()).map(([billId, amount]) => ({
          billId,
          amount,
        }));
      }

      if (input.allocations) {
        await tx.pdcAllocation.deleteMany({ where: { pdcId } });
        await tx.pdcAllocation.createMany({
          data: allocationsData.map((allocation) => ({
            pdcId,
            invoiceId: allocation.invoiceId,
            billId: allocation.billId,
            amount: allocation.amount,
          })),
        });
      }

      let updated;
      try {
        updated = await tx.pdc.update({
          where: { id: pdcId },
          data: {
            customerId,
            vendorId,
            bankAccountId,
            chequeNumber: input.chequeNumber ?? existing.chequeNumber,
            chequeDate,
            expectedClearDate,
            currency,
            exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
            amountTotal,
            reference: input.reference ?? existing.reference,
            memo: input.memo ?? existing.memo,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictException("Cheque number already exists for this bank account");
        }
        throw err;
      }

      const after = await tx.pdc.findFirst({
        where: { id: pdcId, orgId },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { invoice: true, bill: true } },
        },
      });

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PDC",
      entityId: pdcId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async schedulePdc(orgId?: string, pdcId?: string, actorUserId?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }

    const pdc = await this.prisma.pdc.findFirst({
      where: { id: pdcId, orgId },
    });
    if (!pdc) {
      throw new NotFoundException("PDC not found");
    }
    if (pdc.status === PdcStatus.SCHEDULED) {
      return this.getPdc(orgId, pdcId);
    }
    if (pdc.status !== PdcStatus.DRAFT) {
      throw new ConflictException("Only draft PDC can be scheduled");
    }

    const updated = await this.prisma.pdc.update({
      where: { id: pdc.id },
      data: { status: PdcStatus.SCHEDULED },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PDC",
      entityId: pdc.id,
      action: AuditAction.UPDATE,
      before: pdc,
      after: updated,
    });

    return this.getPdc(orgId, pdcId);
  }

  async depositPdc(orgId?: string, pdcId?: string, actorUserId?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }

    const pdc = await this.prisma.pdc.findFirst({
      where: { id: pdcId, orgId },
    });
    if (!pdc) {
      throw new NotFoundException("PDC not found");
    }
    if (pdc.status === PdcStatus.DEPOSITED) {
      return this.getPdc(orgId, pdcId);
    }
    if (pdc.status !== PdcStatus.SCHEDULED) {
      throw new ConflictException("Only scheduled PDC can be marked as deposited");
    }

    const updated = await this.prisma.pdc.update({
      where: { id: pdc.id },
      data: { status: PdcStatus.DEPOSITED, depositedAt: new Date() },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PDC",
      entityId: pdc.id,
      action: AuditAction.UPDATE,
      before: pdc,
      after: updated,
    });

    return this.getPdc(orgId, pdcId);
  }

  async clearPdc(orgId?: string, pdcId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const clearKey = buildIdempotencyKey(idempotencyKey, {
      scope: "pdc.clear",
      actorUserId,
    });
    const requestHash = clearKey ? hashRequestBody({ pdcId, action: "CLEAR" }) : null;
    if (clearKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: clearKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const pdc = await tx.pdc.findFirst({
        where: { id: pdcId, orgId },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: true,
        },
      });
      if (!pdc) {
        throw new NotFoundException("PDC not found");
      }
      if (pdc.status === PdcStatus.CLEARED) {
        throw new ConflictException("PDC is already cleared");
      }
      if (pdc.status !== PdcStatus.SCHEDULED && pdc.status !== PdcStatus.DEPOSITED) {
        throw new ConflictException("Only scheduled or deposited PDC can be cleared");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      ensureBaseCurrencyOnly(org.baseCurrency, pdc.currency);
      const clearDate = new Date();
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, clearDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "PDC",
          entityId: pdc.id,
          action: AuditAction.UPDATE,
          before: { status: pdc.status, expectedClearDate: pdc.expectedClearDate },
          after: {
            blockedAction: "clear PDC",
            docDate: clearDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, clearDate, "clear PDC");

      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: pdc.bankAccountId, orgId, isActive: true },
        include: { glAccount: true },
      });
      if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
        throw new BadRequestException("Bank account is not available");
      }
      if (bankAccount.currency && bankAccount.currency !== pdc.currency) {
        throw new BadRequestException("PDC currency must match bank account currency");
      }

      await tx.$queryRaw`
        SELECT "id" FROM "Pdc"
        WHERE "id" = ${pdc.id}
        FOR UPDATE
      `;

      let lines: Array<{
        lineNo: number;
        accountId: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        description: string;
        customerId?: string;
        vendorId?: string;
      }> = [];

      if (pdc.direction === PdcDirection.INCOMING) {
        if (!pdc.customerId) {
          throw new BadRequestException("Incoming PDC is missing customer");
        }

        const arAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AR", isActive: true },
        });
        if (!arAccount) {
          throw new BadRequestException("Accounts Receivable account is not configured");
        }

        const allocationsByInvoice = this.normalizeIncomingAllocations(
          pdc.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId ?? undefined,
            amount: allocation.amount,
          })),
        );
        const invoiceIds = Array.from(allocationsByInvoice.keys());
        if (invoiceIds.length === 0) {
          throw new BadRequestException("Incoming PDC must include invoice allocations");
        }

        await tx.$queryRaw`
          SELECT "id" FROM "Invoice"
          WHERE "id" IN (${Prisma.join(invoiceIds)})
          FOR UPDATE
        `;
        const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, pdc.customerId, tx);
        this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);

        const allocatedTotal = this.sumAllocationMap(allocationsByInvoice);
        if (!eq(round2(pdc.amountTotal), round2(allocatedTotal))) {
          throw new BadRequestException("PDC total does not match allocations");
        }

        await Promise.all(
          invoices.map((invoice) => {
            const allocation = allocationsByInvoice.get(invoice.id) ?? dec(0);
            const total = round2(invoice.total);
            const currentPaid = round2(invoice.amountPaid ?? 0);
            const newPaid = round2(currentPaid.add(allocation));
            if (newPaid.greaterThan(total)) {
              throw new BadRequestException("Allocation exceeds invoice outstanding");
            }

            let paymentStatus: PaymentStatus = "UNPAID";
            if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
              paymentStatus = "PARTIAL";
            } else if (newPaid.equals(total)) {
              paymentStatus = "PAID";
            }

            return tx.invoice.update({
              where: { id: invoice.id },
              data: { amountPaid: newPaid, paymentStatus },
            });
          }),
        );

        lines = [
          {
            lineNo: 1,
            accountId: bankAccount.glAccountId,
            debit: round2(pdc.amountTotal),
            credit: dec(0),
            description: `PDC ${pdc.chequeNumber} cleared`,
            customerId: pdc.customerId,
          },
          {
            lineNo: 2,
            accountId: arAccount.id,
            debit: dec(0),
            credit: round2(pdc.amountTotal),
            description: `PDC ${pdc.chequeNumber} cleared`,
            customerId: pdc.customerId,
          },
        ];
      } else {
        if (!pdc.vendorId) {
          throw new BadRequestException("Outgoing PDC is missing vendor");
        }

        const apAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AP", isActive: true },
        });
        if (!apAccount) {
          throw new BadRequestException("Accounts Payable account is not configured");
        }

        const allocationsByBill = this.normalizeOutgoingAllocations(
          pdc.allocations.map((allocation) => ({
            billId: allocation.billId ?? undefined,
            amount: allocation.amount,
          })),
        );
        const billIds = Array.from(allocationsByBill.keys());
        if (billIds.length === 0) {
          throw new BadRequestException("Outgoing PDC must include bill allocations");
        }

        await tx.$queryRaw`
          SELECT "id" FROM "Bill"
          WHERE "id" IN (${Prisma.join(billIds)})
          FOR UPDATE
        `;
        const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, pdc.vendorId, tx);
        this.validateAllocationsAgainstBills(allocationsByBill, bills);

        const allocatedTotal = this.sumAllocationMap(allocationsByBill);
        if (!eq(round2(pdc.amountTotal), round2(allocatedTotal))) {
          throw new BadRequestException("PDC total does not match allocations");
        }

        await Promise.all(
          bills.map((bill) => {
            const allocation = allocationsByBill.get(bill.id) ?? dec(0);
            const total = round2(bill.total);
            const currentPaid = round2(bill.amountPaid ?? 0);
            const newPaid = round2(currentPaid.add(allocation));
            if (newPaid.greaterThan(total)) {
              throw new BadRequestException("Allocation exceeds bill outstanding");
            }

            let paymentStatus: PaymentStatus = "UNPAID";
            if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
              paymentStatus = "PARTIAL";
            } else if (newPaid.equals(total)) {
              paymentStatus = "PAID";
            }

            return tx.bill.update({
              where: { id: bill.id },
              data: { amountPaid: newPaid, paymentStatus },
            });
          }),
        );

        lines = [
          {
            lineNo: 1,
            accountId: apAccount.id,
            debit: round2(pdc.amountTotal),
            credit: dec(0),
            description: `PDC ${pdc.chequeNumber} cleared`,
            vendorId: pdc.vendorId,
          },
          {
            lineNo: 2,
            accountId: bankAccount.glAccountId,
            debit: dec(0),
            credit: round2(pdc.amountTotal),
            description: `PDC ${pdc.chequeNumber} cleared`,
            vendorId: pdc.vendorId,
          },
        ];
      }

      assertGlLinesValid(lines);
      assertMoneyEq(lines[0]?.debit ?? dec(0), lines[1]?.credit ?? dec(0), "PDC posting");

      const sourceType = this.sourceTypeForDirection(pdc.direction);
      const glHeader = await tx.gLHeader.create({
        data: {
          orgId,
          sourceType,
          sourceId: pdc.id,
          postingDate: clearDate,
          currency: pdc.currency,
          exchangeRate: pdc.exchangeRate,
          totalDebit: round2(pdc.amountTotal),
          totalCredit: round2(pdc.amountTotal),
          status: "POSTED",
          createdByUserId: actorUserId,
          memo: `PDC ${pdc.chequeNumber} cleared`,
          lines: {
            createMany: {
              data: lines.map((line) => ({
                lineNo: line.lineNo,
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
                customerId: line.customerId,
                vendorId: line.vendorId,
              })),
            },
          },
        },
        include: { lines: true },
      });

      const updated = await tx.pdc.update({
        where: { id: pdc.id },
        data: {
          status: PdcStatus.CLEARED,
          clearedAt: clearDate,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "PDC",
          entityId: pdc.id,
          action: AuditAction.POST,
          before: pdc,
          after: updated,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      const fullPdc = await tx.pdc.findFirst({
        where: { id: pdc.id, orgId },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { invoice: true, bill: true } },
        },
      });

      return {
        pdc: fullPdc ?? updated,
        glHeader,
      };
    });

    if (clearKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: clearKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  async bouncePdc(orgId?: string, pdcId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const bounceKey = buildIdempotencyKey(idempotencyKey, {
      scope: "pdc.bounce",
      actorUserId,
    });
    const requestHash = bounceKey ? hashRequestBody({ pdcId, action: "BOUNCE" }) : null;
    if (bounceKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: bounceKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const pdc = await tx.pdc.findFirst({
        where: { id: pdcId, orgId },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: true,
        },
      });
      if (!pdc) {
        throw new NotFoundException("PDC not found");
      }
      if (pdc.status === PdcStatus.BOUNCED) {
        throw new ConflictException("PDC is already bounced");
      }
      if (
        pdc.status !== PdcStatus.SCHEDULED &&
        pdc.status !== PdcStatus.DEPOSITED &&
        pdc.status !== PdcStatus.CLEARED
      ) {
        throw new ConflictException("Only scheduled, deposited, or cleared PDC can be bounced");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const bounceDate = new Date();
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, bounceDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "PDC",
          entityId: pdc.id,
          action: AuditAction.UPDATE,
          before: { status: pdc.status, expectedClearDate: pdc.expectedClearDate },
          after: {
            blockedAction: "bounce PDC",
            docDate: bounceDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, bounceDate, "bounce PDC");

      let reversalHeader: object | null = null;
      if (pdc.status === PdcStatus.CLEARED) {
        const sourceType = this.sourceTypeForDirection(pdc.direction);
        const glHeader = await tx.gLHeader.findUnique({
          where: {
            orgId_sourceType_sourceId: {
              orgId,
              sourceType,
              sourceId: pdc.id,
            },
          },
          include: {
            lines: true,
            reversedBy: { include: { lines: true } },
          },
        });
        if (!glHeader) {
          throw new ConflictException("Ledger header is missing for this cleared PDC");
        }
        if (glHeader.reversedBy) {
          reversalHeader = glHeader.reversedBy;
        } else {
          const reversal = await createGlReversal(tx, glHeader.id, actorUserId, {
            memo: `Bounce PDC ${pdc.chequeNumber}`,
            reversalDate: bounceDate,
          });
          reversalHeader = reversal.reversalHeader;
        }

        if (pdc.direction === PdcDirection.INCOMING) {
          const allocationsByInvoice = this.normalizeIncomingAllocations(
            pdc.allocations.map((allocation) => ({
              invoiceId: allocation.invoiceId ?? undefined,
              amount: allocation.amount,
            })),
          );
          const invoiceIds = Array.from(allocationsByInvoice.keys());
          const invoices = invoiceIds.length
            ? await (async () => {
                await tx.$queryRaw`
                  SELECT "id" FROM "Invoice"
                  WHERE "id" IN (${Prisma.join(invoiceIds)})
                  FOR UPDATE
                `;
                return tx.invoice.findMany({
                  where: { id: { in: invoiceIds }, orgId },
                  select: { id: true, total: true, amountPaid: true },
                });
              })()
            : [];
          if (invoices.length !== invoiceIds.length) {
            throw new NotFoundException("Invoice not found");
          }

          await Promise.all(
            invoices.map((invoice) => {
              const allocation = allocationsByInvoice.get(invoice.id) ?? dec(0);
              const total = round2(invoice.total);
              const currentPaid = round2(invoice.amountPaid ?? 0);
              let newPaid = round2(currentPaid.sub(allocation));
              if (newPaid.lessThan(0)) {
                newPaid = dec(0);
              }

              let paymentStatus: PaymentStatus = "UNPAID";
              if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
                paymentStatus = "PARTIAL";
              } else if (newPaid.equals(total)) {
                paymentStatus = "PAID";
              }

              return tx.invoice.update({
                where: { id: invoice.id },
                data: { amountPaid: newPaid, paymentStatus },
              });
            }),
          );
        } else {
          const allocationsByBill = this.normalizeOutgoingAllocations(
            pdc.allocations.map((allocation) => ({
              billId: allocation.billId ?? undefined,
              amount: allocation.amount,
            })),
          );
          const billIds = Array.from(allocationsByBill.keys());
          const bills = billIds.length
            ? await (async () => {
                await tx.$queryRaw`
                  SELECT "id" FROM "Bill"
                  WHERE "id" IN (${Prisma.join(billIds)})
                  FOR UPDATE
                `;
                return tx.bill.findMany({
                  where: { id: { in: billIds }, orgId },
                  select: { id: true, total: true, amountPaid: true },
                });
              })()
            : [];
          if (bills.length !== billIds.length) {
            throw new NotFoundException("Bill not found");
          }

          await Promise.all(
            bills.map((bill) => {
              const allocation = allocationsByBill.get(bill.id) ?? dec(0);
              const total = round2(bill.total);
              const currentPaid = round2(bill.amountPaid ?? 0);
              let newPaid = round2(currentPaid.sub(allocation));
              if (newPaid.lessThan(0)) {
                newPaid = dec(0);
              }

              let paymentStatus: PaymentStatus = "UNPAID";
              if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
                paymentStatus = "PARTIAL";
              } else if (newPaid.equals(total)) {
                paymentStatus = "PAID";
              }

              return tx.bill.update({
                where: { id: bill.id },
                data: { amountPaid: newPaid, paymentStatus },
              });
            }),
          );
        }
      }

      const updated = await tx.pdc.update({
        where: { id: pdc.id },
        data: {
          status: PdcStatus.BOUNCED,
          bouncedAt: bounceDate,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "PDC",
          entityId: pdc.id,
          action: AuditAction.VOID,
          before: pdc,
          after: updated,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      const fullPdc = await tx.pdc.findFirst({
        where: { id: pdc.id, orgId },
        include: {
          customer: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { invoice: true, bill: true } },
        },
      });

      return {
        pdc: fullPdc ?? updated,
        reversalHeader,
      };
    });

    if (bounceKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: bounceKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  async cancelPdc(orgId?: string, pdcId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !pdcId) {
      throw new NotFoundException("PDC not found");
    }

    const cancelKey = buildIdempotencyKey(idempotencyKey, {
      scope: "pdc.cancel",
      actorUserId,
    });
    const requestHash = cancelKey ? hashRequestBody({ pdcId, action: "CANCEL" }) : null;
    if (cancelKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: cancelKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const pdc = await this.prisma.pdc.findFirst({
      where: { id: pdcId, orgId },
    });
    if (!pdc) {
      throw new NotFoundException("PDC not found");
    }
    if (pdc.status === PdcStatus.CANCELLED) {
      return this.getPdc(orgId, pdc.id);
    }
    if (
      pdc.status !== PdcStatus.DRAFT &&
      pdc.status !== PdcStatus.SCHEDULED &&
      pdc.status !== PdcStatus.DEPOSITED
    ) {
      throw new ConflictException("Only draft, scheduled, or deposited PDC can be cancelled");
    }

    const updated = await this.prisma.pdc.update({
      where: { id: pdc.id },
      data: {
        status: PdcStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PDC",
      entityId: pdc.id,
      action: AuditAction.UPDATE,
      before: pdc,
      after: updated,
    });

    const full = await this.getPdc(orgId, pdc.id);
    if (cancelKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: cancelKey,
          requestHash,
          response: full as unknown as object,
          statusCode: 200,
        },
      });
    }
    return full;
  }

  private sourceTypeForDirection(direction: PdcDirection): "PDC_INCOMING" | "PDC_OUTGOING" {
    return direction === PdcDirection.INCOMING ? "PDC_INCOMING" : "PDC_OUTGOING";
  }

  private sumAllocationMap(allocationMap: Map<string, Prisma.Decimal>) {
    let total = dec(0);
    for (const amount of allocationMap.values()) {
      total = round2(total.add(round2(amount)));
    }
    return total;
  }

  private normalizeIncomingAllocations(allocations: Array<IncomingAllocationInput>) {
    const allocationMap = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      if (!allocation.invoiceId) {
        throw new BadRequestException("Incoming PDC allocations must reference invoices");
      }
      const amount = round2(allocation.amount);
      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException("Allocation amount must be greater than zero");
      }
      if (allocationMap.has(allocation.invoiceId)) {
        throw new BadRequestException("Duplicate invoice allocation is not allowed");
      }
      allocationMap.set(allocation.invoiceId, amount);
    }
    return allocationMap;
  }

  private normalizeOutgoingAllocations(allocations: Array<OutgoingAllocationInput>) {
    const allocationMap = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      if (!allocation.billId) {
        throw new BadRequestException("Outgoing PDC allocations must reference bills");
      }
      const amount = round2(allocation.amount);
      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException("Allocation amount must be greater than zero");
      }
      if (allocationMap.has(allocation.billId)) {
        throw new BadRequestException("Duplicate bill allocation is not allowed");
      }
      allocationMap.set(allocation.billId, amount);
    }
    return allocationMap;
  }

  private async loadInvoicesForAllocations(
    orgId: string,
    allocationsByInvoice: Map<string, Prisma.Decimal>,
    customerId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const invoiceIds = Array.from(allocationsByInvoice.keys());
    const client = tx ?? this.prisma;

    const invoices = invoiceIds.length
      ? await client.invoice.findMany({
          where: { id: { in: invoiceIds }, orgId },
          select: {
            id: true,
            customerId: true,
            status: true,
            total: true,
            amountPaid: true,
          },
        })
      : [];

    if (invoices.length !== invoiceIds.length) {
      throw new NotFoundException("Invoice not found");
    }
    for (const invoice of invoices) {
      if (invoice.customerId !== customerId) {
        throw new BadRequestException("Invoice does not belong to selected customer");
      }
      if (invoice.status !== "POSTED") {
        throw new BadRequestException("Only posted invoices can be allocated");
      }
    }

    return invoices;
  }

  private async loadBillsForAllocations(
    orgId: string,
    allocationsByBill: Map<string, Prisma.Decimal>,
    vendorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const billIds = Array.from(allocationsByBill.keys());
    const client = tx ?? this.prisma;

    const bills = billIds.length
      ? await client.bill.findMany({
          where: { id: { in: billIds }, orgId },
          select: {
            id: true,
            vendorId: true,
            status: true,
            total: true,
            amountPaid: true,
          },
        })
      : [];

    if (bills.length !== billIds.length) {
      throw new NotFoundException("Bill not found");
    }
    for (const bill of bills) {
      if (bill.vendorId !== vendorId) {
        throw new BadRequestException("Bill does not belong to selected vendor");
      }
      if (bill.status !== "POSTED") {
        throw new BadRequestException("Only posted bills can be allocated");
      }
    }

    return bills;
  }

  private validateAllocationsAgainstInvoices(
    allocationsByInvoice: Map<string, Prisma.Decimal>,
    invoices: Array<{ id: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal }>,
  ) {
    for (const invoice of invoices) {
      const allocation = allocationsByInvoice.get(invoice.id) ?? dec(0);
      const total = round2(invoice.total);
      const paid = round2(invoice.amountPaid ?? 0);
      const outstanding = round2(total.sub(paid));

      if (outstanding.lessThanOrEqualTo(0)) {
        throw new BadRequestException("Invoice is already fully paid");
      }
      if (allocation.greaterThan(outstanding)) {
        throw new BadRequestException("Allocation exceeds invoice outstanding");
      }
    }
  }

  private validateAllocationsAgainstBills(
    allocationsByBill: Map<string, Prisma.Decimal>,
    bills: Array<{ id: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal }>,
  ) {
    for (const bill of bills) {
      const allocation = allocationsByBill.get(bill.id) ?? dec(0);
      const total = round2(bill.total);
      const paid = round2(bill.amountPaid ?? 0);
      const outstanding = round2(total.sub(paid));

      if (outstanding.lessThanOrEqualTo(0)) {
        throw new BadRequestException("Bill is already fully paid");
      }
      if (allocation.greaterThan(outstanding)) {
        throw new BadRequestException("Allocation exceeds bill outstanding");
      }
    }
  }
}
