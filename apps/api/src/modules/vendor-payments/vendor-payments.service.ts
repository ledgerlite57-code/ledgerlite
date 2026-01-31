import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, DocumentStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { applyNumberingUpdate, nextNumbering, resolveNumberingFormats } from "../../common/numbering";
import { buildVendorPaymentPostingLines, calculateVendorPaymentTotal } from "../../vendor-payments.utils";
import { type VendorPaymentCreateInput, type VendorPaymentUpdateInput } from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { dec, eq, round2, type MoneyValue } from "../../common/money";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";

type VendorPaymentRecord = Prisma.VendorPaymentGetPayload<{
  include: {
    vendor: true;
    bankAccount: { include: { glAccount: true } };
    allocations: { include: { bill: true } };
  };
}>;

type AllocationInput = { billId: string; amount: MoneyValue };
type VendorPaymentListParams = {
  q?: string;
  status?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

@Injectable()
export class VendorPaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listPayments(orgId?: string, params?: VendorPaymentListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.VendorPaymentWhereInput = { orgId };
    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (Object.values(DocumentStatus).includes(normalized as DocumentStatus)) {
        where.status = normalized as DocumentStatus;
      }
    }
    if (params?.vendorId) {
      where.vendorId = params.vendorId;
    }
    if (params?.q) {
      where.OR = [
        { number: { contains: params.q, mode: "insensitive" } },
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
      where.paymentDate = dateFilter;
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

    return this.prisma.vendorPayment.findMany({
      where,
      include: { vendor: true, bankAccount: true },
      orderBy: { paymentDate: "desc" },
    });
  }

  async getPayment(orgId?: string, paymentId?: string) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Vendor payment not found");
    }

    const payment = await this.prisma.vendorPayment.findFirst({
      where: { id: paymentId, orgId },
      include: {
        vendor: true,
        bankAccount: { include: { glAccount: true } },
        allocations: { include: { bill: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException("Vendor payment not found");
    }

    return payment;
  }

  async createPayment(
    orgId?: string,
    actorUserId?: string,
    input?: VendorPaymentCreateInput,
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
      scope: "vendor-payments.create",
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
        return existingKey.response as unknown as VendorPaymentRecord;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
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

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, orgId, isActive: true },
      include: { glAccount: true },
    });
    if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
      throw new BadRequestException("Bank account is not available");
    }

    const paymentDate = new Date(input.paymentDate);
    const currency = input.currency ?? bankAccount.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }
    if (bankAccount.currency && bankAccount.currency !== currency) {
      throw new BadRequestException("Payment currency must match bank account currency");
    }

    const allocationsByBill = this.normalizeAllocations(input.allocations);
    const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, vendor.id);

    this.validateAllocationsAgainstBills(allocationsByBill, bills);

    const amountTotal = calculateVendorPaymentTotal(input.allocations);

    const payment = await this.prisma.vendorPayment.create({
      data: {
        orgId,
        vendorId: vendor.id,
        bankAccountId: bankAccount.id,
        status: "DRAFT",
        paymentDate,
        currency,
        exchangeRate: input.exchangeRate ?? 1,
        amountTotal,
        reference: input.reference,
        memo: input.memo,
        createdByUserId: actorUserId,
        allocations: {
          createMany: {
            data: input.allocations.map((allocation) => ({
              billId: allocation.billId,
              amount: allocation.amount,
            })),
          },
        },
      },
      include: {
        vendor: true,
        bankAccount: { include: { glAccount: true } },
        allocations: { include: { bill: true } },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "VENDOR_PAYMENT",
      entityId: payment.id,
      action: AuditAction.CREATE,
      after: payment,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: payment as unknown as object,
          statusCode: 201,
        },
      });
    }

    return payment;
  }

  async updatePayment(
    orgId?: string,
    paymentId?: string,
    actorUserId?: string,
    input?: VendorPaymentUpdateInput,
  ) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Vendor payment not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.vendorPayment.findFirst({
        where: { id: paymentId, orgId },
        include: { allocations: true },
      });
      if (!existing) {
        throw new NotFoundException("Vendor payment not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted vendor payments cannot be edited");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const vendorId = input.vendorId ?? existing.vendorId;
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, orgId },
      });
      if (!vendor) {
        throw new NotFoundException("Vendor not found");
      }
      if (!vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }

      const bankAccountId = input.bankAccountId ?? existing.bankAccountId;
      if (!bankAccountId) {
        throw new BadRequestException("Bank account is required");
      }

      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, orgId, isActive: true },
        include: { glAccount: true },
      });
      if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
        throw new BadRequestException("Bank account is not available");
      }

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : existing.paymentDate;
      const currency = input.currency ?? existing.currency ?? bankAccount.currency ?? org.baseCurrency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }
      if (bankAccount.currency && bankAccount.currency !== currency) {
        throw new BadRequestException("Payment currency must match bank account currency");
      }
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, paymentDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "VENDOR_PAYMENT",
          entityId: paymentId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, paymentDate: existing.paymentDate },
          after: {
            blockedAction: "update vendor payment",
            docDate: paymentDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, paymentDate, "update vendor payment");

      const allocationsInput: AllocationInput[] = input.allocations
        ? input.allocations
        : existing.allocations.map((allocation) => ({
            billId: allocation.billId,
            amount: allocation.amount,
          }));

      const allocationsByBill = this.normalizeAllocations(allocationsInput);
      const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, vendor.id, tx);

      this.validateAllocationsAgainstBills(allocationsByBill, bills);

      const amountTotal = calculateVendorPaymentTotal(allocationsInput);

      if (input.allocations) {
        await tx.vendorPaymentAllocation.deleteMany({ where: { vendorPaymentId: paymentId } });
        await tx.vendorPaymentAllocation.createMany({
          data: allocationsInput.map((allocation) => ({
            vendorPaymentId: paymentId,
            billId: allocation.billId,
            amount: allocation.amount,
          })),
        });
      }

      const updated = await tx.vendorPayment.update({
        where: { id: paymentId },
        data: {
          vendorId,
          bankAccountId,
          paymentDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          amountTotal,
          reference: input.reference ?? existing.reference,
          memo: input.memo ?? existing.memo,
        },
      });

      const after = await tx.vendorPayment.findFirst({
        where: { id: paymentId, orgId },
        include: {
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { bill: true } },
        },
      });

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "VENDOR_PAYMENT",
      entityId: paymentId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postPayment(orgId?: string, paymentId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Vendor payment not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "vendor-payments.post",
      actorUserId,
    });
    const requestHash = postKey ? hashRequestBody({ paymentId }) : null;
    if (postKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: postKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    let result: { payment: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.vendorPayment.findFirst({
          where: { id: paymentId, orgId },
          include: {
            allocations: true,
            vendor: true,
            bankAccount: { include: { glAccount: true } },
          },
        });

        if (!payment) {
          throw new NotFoundException("Vendor payment not found");
        }
        if (payment.status !== "DRAFT") {
          throw new ConflictException("Vendor payment is already posted");
        }

        if (!payment.bankAccountId) {
          throw new BadRequestException("Bank account is required to post");
        }

        const bankAccount = await tx.bankAccount.findFirst({
          where: { id: payment.bankAccountId, orgId, isActive: true },
          include: { glAccount: true },
        });
        if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
          throw new BadRequestException("Bank account is not available");
        }
        if (bankAccount.currency && bankAccount.currency !== payment.currency) {
          throw new BadRequestException("Payment currency must match bank account currency");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        ensureBaseCurrencyOnly(org.baseCurrency, payment.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, payment.paymentDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "VENDOR_PAYMENT",
            entityId: payment.id,
            action: AuditAction.UPDATE,
            before: { status: payment.status, paymentDate: payment.paymentDate },
            after: {
              blockedAction: "post vendor payment",
              docDate: payment.paymentDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, payment.paymentDate, "post vendor payment");

        const apAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AP", isActive: true },
        });
        if (!apAccount) {
          throw new BadRequestException("Accounts Payable account is not configured");
        }

        const allocationsByBill = this.normalizeAllocations(
          payment.allocations.map((allocation) => ({
            billId: allocation.billId,
            amount: allocation.amount,
          })),
        );

        if (allocationsByBill.size === 0) {
          throw new BadRequestException("Vendor payment must include allocations");
        }

        const billIds = Array.from(allocationsByBill.keys());
        await tx.$queryRaw`
          SELECT "id" FROM "Bill"
          WHERE "id" IN (${Prisma.join(billIds)})
          FOR UPDATE
        `;

        const bills = await this.loadBillsForAllocations(orgId, allocationsByBill, payment.vendorId, tx);

        this.validateAllocationsAgainstBills(allocationsByBill, bills);

        const allocatedTotal = calculateVendorPaymentTotal(
          Array.from(allocationsByBill.entries()).map(([billId, amount]) => ({
            billId,
            amount,
          })),
        );

        if (!eq(round2(payment.amountTotal), round2(allocatedTotal))) {
          throw new BadRequestException("Payment total does not match allocations");
        }

        const formats = resolveNumberingFormats(org.orgSettings);
        const { assignedNumber, nextFormats } = nextNumbering(formats, "vendorPayment");
        await tx.orgSettings.upsert({
          where: { orgId },
          update: applyNumberingUpdate(nextFormats),
          create: {
            orgId,
            ...applyNumberingUpdate(nextFormats),
          },
          select: { orgId: true },
        });

        const updatedPayment = await tx.vendorPayment.update({
          where: { id: paymentId },
          data: {
            status: "POSTED",
            number: payment.number ?? assignedNumber,
            postedAt: new Date(),
          },
        });

        const billUpdates = bills.map((bill) => {
          const allocation = allocationsByBill.get(bill.id) ?? dec(0);
          const total = round2(bill.total);
          const currentPaid = round2(bill.amountPaid ?? 0);
          const newPaid = round2(currentPaid.add(allocation));

          if (newPaid.greaterThan(total)) {
            throw new BadRequestException("Allocation exceeds bill outstanding");
          }

          let paymentStatus: "UNPAID" | "PARTIAL" | "PAID" = "UNPAID";
          if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
            paymentStatus = "PARTIAL";
          } else if (newPaid.equals(total)) {
            paymentStatus = "PAID";
          }

          return tx.bill.update({
            where: { id: bill.id },
            data: {
              amountPaid: newPaid,
              paymentStatus,
            },
          });
        });

        await Promise.all(billUpdates);

        const posting = buildVendorPaymentPostingLines({
          paymentNumber: updatedPayment.number ?? assignedNumber,
          vendorId: payment.vendorId,
          amountTotal: payment.amountTotal,
          apAccountId: apAccount.id,
          bankAccountId: bankAccount.glAccountId,
        });

        assertGlLinesValid(posting.lines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Vendor payment posting");

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "VENDOR_PAYMENT",
            sourceId: payment.id,
            postingDate: updatedPayment.postedAt ?? new Date(),
            currency: payment.currency,
            exchangeRate: payment.exchangeRate,
            totalDebit: posting.totalDebit,
            totalCredit: posting.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Vendor payment ${updatedPayment.number ?? assignedNumber}`,
            lines: {
              createMany: {
                data: posting.lines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  vendorId: line.vendorId ?? undefined,
                })),
              },
            },
          },
          include: { lines: true },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "VENDOR_PAYMENT",
            entityId: payment.id,
            action: AuditAction.POST,
            before: payment,
            after: updatedPayment,
            requestId: RequestContext.get()?.requestId,
            ip: RequestContext.get()?.ip,
            userAgent: RequestContext.get()?.userAgent,
          },
        });

        const response = {
          payment: {
            ...updatedPayment,
            allocations: payment.allocations,
            vendor: payment.vendor,
            bankAccount: payment.bankAccount,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Vendor payment is already posted");
      }
      throw err;
    }

    if (postKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: postKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 201,
        },
      });
    }

    return result;
  }

  async voidPayment(orgId?: string, paymentId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Vendor payment not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "vendor-payments.void",
      actorUserId,
    });
    const requestHash = voidKey ? hashRequestBody({ paymentId, action: "VOID" }) : null;
    if (voidKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: voidKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.vendorPayment.findFirst({
        where: { id: paymentId, orgId },
        include: {
          allocations: true,
          vendor: true,
          bankAccount: { include: { glAccount: true } },
        },
      });

      if (!payment) {
        throw new NotFoundException("Vendor payment not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "VENDOR_PAYMENT",
            sourceId: payment.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (payment.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Vendor payment is already voided");
        }
        return {
          payment,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (payment.status !== "POSTED") {
        throw new ConflictException("Only posted vendor payments can be voided");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, payment.paymentDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "VENDOR_PAYMENT",
          entityId: payment.id,
          action: AuditAction.UPDATE,
          before: { status: payment.status, paymentDate: payment.paymentDate },
          after: {
            blockedAction: "void vendor payment",
            docDate: payment.paymentDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, payment.paymentDate, "void vendor payment");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this vendor payment");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void vendor payment ${payment.number ?? payment.id}`,
        reversalDate: new Date(),
      });

      const updatedPayment = await tx.vendorPayment.update({
        where: { id: paymentId },
        data: {
          status: "VOID",
        },
      });

      const allocationsByBill = this.normalizeAllocations(
        payment.allocations.map((allocation) => ({
          billId: allocation.billId,
          amount: allocation.amount,
        })),
      );

      const billIds = Array.from(allocationsByBill.keys());
      const bills = billIds.length
        ? await tx.bill.findMany({
            where: { id: { in: billIds }, orgId },
            select: { id: true, total: true, amountPaid: true },
          })
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

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "VENDOR_PAYMENT",
          entityId: payment.id,
          action: AuditAction.VOID,
          before: payment,
          after: updatedPayment,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return {
        payment: {
          ...updatedPayment,
          allocations: payment.allocations,
          vendor: payment.vendor,
          bankAccount: payment.bankAccount,
        },
        reversalHeader,
      };
    });

    if (voidKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: voidKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  private normalizeAllocations(allocations: AllocationInput[]) {
    const allocationMap = new Map<string, Prisma.Decimal>();

    for (const allocation of allocations) {
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
