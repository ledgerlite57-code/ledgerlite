import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, DocumentStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { applyNumberingUpdate, nextNumbering, resolveNumberingFormats } from "../../common/numbering";
import { buildPaymentPostingLines, calculatePaymentTotal } from "../../payments-received.utils";
import { type PaymentReceivedCreateInput, type PaymentReceivedUpdateInput } from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { dec, eq, round2, type MoneyValue } from "../../common/money";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";

type PaymentRecord = Prisma.PaymentReceivedGetPayload<{
  include: {
    customer: true;
    bankAccount: { include: { glAccount: true } };
    allocations: { include: { invoice: true } };
  };
}>;
type AllocationInput = { invoiceId: string; amount: MoneyValue };
type PaymentListParams = {
  q?: string;
  status?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

@Injectable()
export class PaymentsReceivedService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listPayments(orgId?: string, params?: PaymentListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.PaymentReceivedWhereInput = { orgId };
    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (Object.values(DocumentStatus).includes(normalized as DocumentStatus)) {
        where.status = normalized as DocumentStatus;
      }
    }
    if (params?.customerId) {
      where.customerId = params.customerId;
    }
    if (params?.q) {
      where.OR = [
        { number: { contains: params.q, mode: "insensitive" } },
        { customer: { name: { contains: params.q, mode: "insensitive" } } },
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

    return this.prisma.paymentReceived.findMany({
      where,
      include: { customer: true, bankAccount: true },
      orderBy: { paymentDate: "desc" },
    });
  }

  async getPayment(orgId?: string, paymentId?: string) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Payment not found");
    }

    const payment = await this.prisma.paymentReceived.findFirst({
      where: { id: paymentId, orgId },
      include: {
        customer: true,
        bankAccount: { include: { glAccount: true } },
        allocations: { include: { invoice: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    return payment;
  }

  async createPayment(
    orgId?: string,
    actorUserId?: string,
    input?: PaymentReceivedCreateInput,
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
      scope: "payments-received.create",
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
        return existingKey.response as unknown as PaymentRecord;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
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

    const allocationsByInvoice = this.normalizeAllocations(input.allocations);
    const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, customer.id);

    this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);

    const amountTotal = calculatePaymentTotal(input.allocations);

    const payment = await this.prisma.paymentReceived.create({
      data: {
        orgId,
        customerId: customer.id,
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
              invoiceId: allocation.invoiceId,
              amount: allocation.amount,
            })),
          },
        },
      },
      include: {
        customer: true,
        bankAccount: { include: { glAccount: true } },
        allocations: { include: { invoice: true } },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PAYMENT_RECEIVED",
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
    input?: PaymentReceivedUpdateInput,
  ) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Payment not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentReceived.findFirst({
        where: { id: paymentId, orgId },
        include: { allocations: true },
      });
      if (!existing) {
        throw new NotFoundException("Payment not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted payments cannot be edited");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const customerId = input.customerId ?? existing.customerId;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, orgId },
      });
      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
      if (!customer.isActive) {
        throw new BadRequestException("Customer must be active");
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
          entityType: "PAYMENT_RECEIVED",
          entityId: paymentId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, paymentDate: existing.paymentDate },
          after: {
            blockedAction: "update payment",
            docDate: paymentDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, paymentDate, "update payment");

      const allocationsInput: AllocationInput[] = input.allocations
        ? input.allocations
        : existing.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          }));

      const allocationsByInvoice = this.normalizeAllocations(allocationsInput);
      const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, customer.id, tx);

      this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);

      const amountTotal = calculatePaymentTotal(allocationsInput);

      if (input.allocations) {
        await tx.paymentReceivedAllocation.deleteMany({ where: { paymentReceivedId: paymentId } });
        await tx.paymentReceivedAllocation.createMany({
          data: allocationsInput.map((allocation) => ({
            paymentReceivedId: paymentId,
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          })),
        });
      }

      const updated = await tx.paymentReceived.update({
        where: { id: paymentId },
        data: {
          customerId,
          bankAccountId,
          paymentDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          amountTotal,
          reference: input.reference ?? existing.reference,
          memo: input.memo ?? existing.memo,
        },
      });

      const after = await tx.paymentReceived.findFirst({
        where: { id: paymentId, orgId },
        include: {
          customer: true,
          bankAccount: { include: { glAccount: true } },
          allocations: { include: { invoice: true } },
        },
      });

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PAYMENT_RECEIVED",
      entityId: paymentId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postPayment(orgId?: string, paymentId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !paymentId) {
      throw new NotFoundException("Payment not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "payments-received.post",
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
        const payment = await tx.paymentReceived.findFirst({
          where: { id: paymentId, orgId },
          include: {
            allocations: true,
            customer: true,
            bankAccount: { include: { glAccount: true } },
          },
        });

        if (!payment) {
          throw new NotFoundException("Payment not found");
        }
        if (payment.status !== "DRAFT") {
          throw new ConflictException("Payment is already posted");
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
            entityType: "PAYMENT_RECEIVED",
            entityId: payment.id,
            action: AuditAction.UPDATE,
            before: { status: payment.status, paymentDate: payment.paymentDate },
            after: {
              blockedAction: "post payment",
              docDate: payment.paymentDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, payment.paymentDate, "post payment");

        const arAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AR", isActive: true },
        });
        if (!arAccount) {
          throw new BadRequestException("Accounts Receivable account is not configured");
        }

        const allocationsByInvoice = this.normalizeAllocations(
          payment.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          })),
        );

        if (allocationsByInvoice.size === 0) {
          throw new BadRequestException("Payment must include allocations");
        }

        const invoiceIds = Array.from(allocationsByInvoice.keys());
        await tx.$queryRaw`
          SELECT "id" FROM "Invoice"
          WHERE "id" IN (${Prisma.join(invoiceIds)})
          FOR UPDATE
        `;

        const invoices = await this.loadInvoicesForAllocations(orgId, allocationsByInvoice, payment.customerId, tx);

        this.validateAllocationsAgainstInvoices(allocationsByInvoice, invoices);

        const allocatedTotal = calculatePaymentTotal(
          Array.from(allocationsByInvoice.entries()).map(([invoiceId, amount]) => ({
            invoiceId,
            amount,
          })),
        );

        if (!eq(round2(payment.amountTotal), round2(allocatedTotal))) {
          throw new BadRequestException("Payment total does not match allocations");
        }

        const formats = resolveNumberingFormats(org.orgSettings);
        const { assignedNumber, nextFormats } = nextNumbering(formats, "payment");
        await tx.orgSettings.upsert({
          where: { orgId },
          update: applyNumberingUpdate(nextFormats),
          create: {
            orgId,
            ...applyNumberingUpdate(nextFormats),
          },
          select: { orgId: true },
        });

        const updatedPayment = await tx.paymentReceived.update({
          where: { id: paymentId },
          data: {
            status: "POSTED",
            number: payment.number ?? assignedNumber,
            postedAt: new Date(),
          },
        });

        const invoiceUpdates = invoices.map((invoice) => {
          const allocation = allocationsByInvoice.get(invoice.id) ?? dec(0);
          const total = round2(invoice.total);
          const currentPaid = round2(invoice.amountPaid ?? 0);
          const newPaid = round2(currentPaid.add(allocation));

          if (newPaid.greaterThan(total)) {
            throw new BadRequestException("Allocation exceeds invoice outstanding");
          }

          let paymentStatus: "UNPAID" | "PARTIAL" | "PAID" = "UNPAID";
          if (newPaid.greaterThan(0) && newPaid.lessThan(total)) {
            paymentStatus = "PARTIAL";
          } else if (newPaid.equals(total)) {
            paymentStatus = "PAID";
          }

          return tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: newPaid,
              paymentStatus,
            },
          });
        });

        await Promise.all(invoiceUpdates);

        const posting = buildPaymentPostingLines({
          paymentNumber: updatedPayment.number ?? assignedNumber,
          customerId: payment.customerId,
          amountTotal: payment.amountTotal,
          arAccountId: arAccount.id,
          bankAccountId: bankAccount.glAccountId,
        });

        assertGlLinesValid(posting.lines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Payment posting");

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "PAYMENT_RECEIVED",
            sourceId: payment.id,
            postingDate: updatedPayment.postedAt ?? new Date(),
            currency: payment.currency,
            exchangeRate: payment.exchangeRate,
            totalDebit: posting.totalDebit,
            totalCredit: posting.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Payment ${updatedPayment.number ?? assignedNumber}`,
            lines: {
              createMany: {
                data: posting.lines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  customerId: line.customerId ?? undefined,
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
            entityType: "PAYMENT_RECEIVED",
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
            customer: payment.customer,
            bankAccount: payment.bankAccount,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Payment is already posted");
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
      throw new NotFoundException("Payment not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "payments-received.void",
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
      const payment = await tx.paymentReceived.findFirst({
        where: { id: paymentId, orgId },
        include: {
          allocations: true,
          customer: true,
          bankAccount: { include: { glAccount: true } },
        },
      });

      if (!payment) {
        throw new NotFoundException("Payment not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "PAYMENT_RECEIVED",
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
          throw new ConflictException("Payment is already voided");
        }
        return {
          payment,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (payment.status !== "POSTED") {
        throw new ConflictException("Only posted payments can be voided");
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
          entityType: "PAYMENT_RECEIVED",
          entityId: payment.id,
          action: AuditAction.UPDATE,
          before: { status: payment.status, paymentDate: payment.paymentDate },
          after: {
            blockedAction: "void payment",
            docDate: payment.paymentDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, payment.paymentDate, "void payment");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this payment");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void payment ${payment.number ?? payment.id}`,
        reversalDate: new Date(),
      });

      const updatedPayment = await tx.paymentReceived.update({
        where: { id: paymentId },
        data: {
          status: "VOID",
        },
      });

      const allocationsByInvoice = this.normalizeAllocations(
        payment.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: allocation.amount,
        })),
      );

      const invoiceIds = Array.from(allocationsByInvoice.keys());
      const invoices = invoiceIds.length
        ? await tx.invoice.findMany({
            where: { id: { in: invoiceIds }, orgId },
            select: { id: true, total: true, amountPaid: true },
          })
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

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "PAYMENT_RECEIVED",
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
          customer: payment.customer,
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
      if (allocationMap.has(allocation.invoiceId)) {
        throw new BadRequestException("Duplicate invoice allocation is not allowed");
      }
      allocationMap.set(allocation.invoiceId, amount);
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
}
