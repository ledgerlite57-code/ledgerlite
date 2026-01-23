import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { buildInvoicePostingLines, calculateInvoiceLines } from "../../invoices.utils";
import { dec, gt } from "../../common/money";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";
import {
  type InvoiceCreateInput,
  type InvoiceUpdateInput,
  type InvoiceLineCreateInput,
  type PaginationInput,
} from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { InvoicesRepository } from "./invoices.repo";

type InvoiceRecord = Prisma.InvoiceGetPayload<{
  include: {
    customer: true;
    lines: { include: { item: true; taxCode: true } };
  };
}>;
type InvoiceListParams = PaginationInput & {
  status?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoicesRepo: InvoicesRepository,
  ) {}

  async listInvoices(orgId?: string, params?: InvoiceListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const { data, total } = await this.invoicesRepo.list({
      orgId,
      q: params?.q,
      status: params?.status,
      customerId: params?.customerId,
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo,
      amountMin: params?.amountMin,
      amountMax: params?.amountMax,
      page,
      pageSize,
      sortBy: params?.sortBy,
      sortDir: params?.sortDir,
    });

    return {
      data,
      pageInfo: {
        page,
        pageSize,
        total,
      },
    };
  }

  async getInvoice(orgId?: string, invoiceId?: string) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    const invoice = await this.invoicesRepo.findForDetail(orgId, invoiceId);
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  async createInvoice(
    orgId?: string,
    actorUserId?: string,
    input?: InvoiceCreateInput,
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

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as InvoiceRecord;
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

    const { itemsById, taxCodesById } = await this.resolveInvoiceRefs(orgId, input.lines, org.vatEnabled);
    let calculated;
    try {
      calculated = calculateInvoiceLines({
        lines: input.lines,
        itemsById,
        taxCodesById,
        vatEnabled: org.vatEnabled,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid invoice lines");
    }

    const invoiceDate = new Date(input.invoiceDate);
    const dueDate = input.dueDate ? new Date(input.dueDate) : this.addDays(invoiceDate, customer.paymentTermsDays ?? 0);
    if (dueDate < invoiceDate) {
      throw new BadRequestException("Due date cannot be before invoice date");
    }

    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    const invoice = await this.invoicesRepo.create({
      orgId,
      customerId: customer.id,
      status: "DRAFT",
      invoiceDate,
      dueDate,
      currency,
      exchangeRate: input.exchangeRate,
      subTotal: calculated.subTotal,
      taxTotal: calculated.taxTotal,
      total: calculated.total,
      reference: input.reference,
      notes: input.notes,
      terms: input.terms,
      createdByUserId: actorUserId,
      lines: {
        createMany: {
          data: calculated.lines.map((line) => ({
            lineNo: line.lineNo,
            itemId: line.itemId,
            incomeAccountId: line.incomeAccountId ?? undefined,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            lineSubTotal: line.lineSubTotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          })),
        },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: AuditAction.CREATE,
      after: invoice,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: invoice as unknown as object,
          statusCode: 201,
        },
      });
    }

    return invoice;
  }

  async updateInvoice(orgId?: string, invoiceId?: string, actorUserId?: string, input?: InvoiceUpdateInput) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.invoicesRepo.findForUpdate(orgId, invoiceId, tx);
      if (!existing) {
        throw new NotFoundException("Invoice not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted invoices cannot be edited");
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

      const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : existing.invoiceDate;
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, invoiceDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "INVOICE",
          entityId: invoiceId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, invoiceDate: existing.invoiceDate },
          after: {
            blockedAction: "update invoice",
            docDate: invoiceDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, invoiceDate, "update invoice");
      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : input.invoiceDate
          ? this.addDays(invoiceDate, customer.paymentTermsDays ?? 0)
          : existing.dueDate;
      if (dueDate < invoiceDate) {
        throw new BadRequestException("Due date cannot be before invoice date");
      }

      const currency = input.currency ?? existing.currency ?? org.baseCurrency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }

      let totals = {
        subTotal: dec(existing.subTotal),
        taxTotal: dec(existing.taxTotal),
        total: dec(existing.total),
      };

      if (input.lines) {
        const { itemsById, taxCodesById } = await this.resolveInvoiceRefs(orgId, input.lines, org.vatEnabled);
        let calculated;
        try {
          calculated = calculateInvoiceLines({
            lines: input.lines,
            itemsById,
            taxCodesById,
            vatEnabled: org.vatEnabled,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Invalid invoice lines");
        }
        totals = calculated;

        await this.invoicesRepo.deleteLines(invoiceId, tx);
        await this.invoicesRepo.createLines(
          calculated.lines.map((line) => ({
            invoiceId,
            lineNo: line.lineNo,
            itemId: line.itemId,
            incomeAccountId: line.incomeAccountId ?? undefined,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            lineSubTotal: line.lineSubTotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          })),
          tx,
        );
      }

      const updated = await this.invoicesRepo.update(
        invoiceId,
        {
          customerId,
          invoiceDate,
          dueDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate,
          reference: input.reference ?? existing.reference,
          notes: input.notes ?? existing.notes,
          terms: input.terms ?? existing.terms,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
        tx,
      );

      const after = await this.invoicesRepo.findForDetail(orgId, invoiceId, tx);

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "INVOICE",
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postInvoice(orgId?: string, invoiceId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const requestHash = idempotencyKey ? hashRequestBody({ invoiceId }) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    let result: { invoice: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const invoice = await this.invoicesRepo.findForPosting(orgId, invoiceId, tx);
        if (!invoice) {
          throw new NotFoundException("Invoice not found");
        }
        if (invoice.status !== "DRAFT") {
          throw new ConflictException("Invoice is already posted");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        ensureBaseCurrencyOnly(org.baseCurrency, invoice.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, invoice.invoiceDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "INVOICE",
            entityId: invoice.id,
            action: AuditAction.UPDATE,
            before: { status: invoice.status, invoiceDate: invoice.invoiceDate },
            after: {
              blockedAction: "post invoice",
              docDate: invoice.invoiceDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, invoice.invoiceDate, "post invoice");

        if (!org.vatEnabled && gt(invoice.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const arAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AR", isActive: true },
        });
        if (!arAccount) {
          throw new BadRequestException("Accounts Receivable account is not configured");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(invoice.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_PAYABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Payable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const itemIds = invoice.lines.map((line) => line.itemId).filter(Boolean) as string[];
        const items = itemIds.length
          ? await tx.item.findMany({
              where: { orgId, id: { in: itemIds } },
              select: { id: true, incomeAccountId: true },
            })
          : [];

        const itemsById = new Map(items.map((item) => [item.id, item]));

        const lineIncomeAccountIds = invoice.lines
          .map((line) => line.incomeAccountId)
          .filter(Boolean) as string[];
        const incomeAccountIds = Array.from(
          new Set([...items.map((item) => item.incomeAccountId).filter(Boolean), ...lineIncomeAccountIds]),
        );
        const incomeAccounts = incomeAccountIds.length
          ? await tx.account.findMany({ where: { orgId, id: { in: incomeAccountIds } } })
          : [];
        if (incomeAccounts.length !== incomeAccountIds.length) {
          throw new BadRequestException("Income account is missing or inactive");
        }
        if (incomeAccounts.some((account) => !account.isActive)) {
          throw new BadRequestException("Income account must be active");
        }
        if (incomeAccounts.some((account) => account.type !== "INCOME")) {
          throw new BadRequestException("Income account must be INCOME type");
        }

        const numbering = await tx.orgSettings.upsert({
          where: { orgId },
          update: {
            invoicePrefix: org.orgSettings?.invoicePrefix ?? "INV-",
            invoiceNextNumber: { increment: 1 },
          },
          create: {
            orgId,
            invoicePrefix: "INV-",
            invoiceNextNumber: 2,
            billPrefix: org.orgSettings?.billPrefix ?? "BILL-",
            billNextNumber: org.orgSettings?.billNextNumber ?? 1,
            paymentPrefix: org.orgSettings?.paymentPrefix ?? "PAY-",
            paymentNextNumber: org.orgSettings?.paymentNextNumber ?? 1,
            vendorPaymentPrefix: org.orgSettings?.vendorPaymentPrefix ?? "VPAY-",
            vendorPaymentNextNumber: org.orgSettings?.vendorPaymentNextNumber ?? 1,
          },
          select: { invoicePrefix: true, invoiceNextNumber: true },
        });

        const nextNumber = Math.max(1, (numbering.invoiceNextNumber ?? 1) - 1);
        const assignedNumber = `${numbering.invoicePrefix ?? "INV-"}${nextNumber}`;

        let posting;
        try {
          posting = buildInvoicePostingLines({
            invoiceNumber: assignedNumber,
            customerId: invoice.customerId,
            total: invoice.total,
            lines: invoice.lines.map((line) => ({
              itemId: line.itemId ?? undefined,
              incomeAccountId: line.incomeAccountId ?? undefined,
              lineSubTotal: line.lineSubTotal,
              lineTax: line.lineTax,
              taxCodeId: line.taxCodeId ?? undefined,
            })),
            itemsById,
            arAccountId: arAccount.id,
            vatAccountId,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post invoice");
        }

        assertGlLinesValid(posting.lines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Invoice posting");

        const updatedInvoice = await this.invoicesRepo.update(
          invoiceId,
          {
            status: "POSTED",
            number: invoice.number ?? assignedNumber,
            postedAt: new Date(),
          },
          tx,
        );

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "INVOICE",
            sourceId: invoice.id,
            postingDate: updatedInvoice.postedAt ?? new Date(),
            currency: invoice.currency,
            exchangeRate: invoice.exchangeRate,
            totalDebit: posting.totalDebit,
            totalCredit: posting.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Invoice ${updatedInvoice.number ?? assignedNumber}`,
            lines: {
              createMany: {
                data: posting.lines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  customerId: line.customerId ?? undefined,
                  taxCodeId: line.taxCodeId ?? undefined,
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
            entityType: "INVOICE",
            entityId: invoice.id,
            action: AuditAction.POST,
            before: invoice,
            after: updatedInvoice,
            requestId: RequestContext.get()?.requestId,
          },
        });

        const response = {
          invoice: {
            ...updatedInvoice,
            lines: invoice.lines,
            customer: invoice.customer,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Invoice is already posted");
      }
      throw err;
    }

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 201,
        },
      });
    }

    return result;
  }

  async voidInvoice(orgId?: string, invoiceId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const requestHash = idempotencyKey ? hashRequestBody({ invoiceId, action: "VOID" }) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.invoicesRepo.findForPosting(orgId, invoiceId, tx);
      if (!invoice) {
        throw new NotFoundException("Invoice not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "INVOICE",
            sourceId: invoice.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (invoice.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Invoice is already voided");
        }
        return {
          invoice,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (invoice.status !== "POSTED") {
        throw new ConflictException("Only posted invoices can be voided");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, invoice.invoiceDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "INVOICE",
          entityId: invoice.id,
          action: AuditAction.UPDATE,
          before: { status: invoice.status, invoiceDate: invoice.invoiceDate },
          after: {
            blockedAction: "void invoice",
            docDate: invoice.invoiceDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, invoice.invoiceDate, "void invoice");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this invoice");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void invoice ${invoice.number ?? invoice.id}`,
        reversalDate: new Date(),
      });

      const updatedInvoice = await this.invoicesRepo.update(
        invoiceId,
        {
          status: "VOID",
          voidedAt: new Date(),
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "INVOICE",
          entityId: invoice.id,
          action: AuditAction.VOID,
          before: invoice,
          after: updatedInvoice,
          requestId: RequestContext.get()?.requestId,
        },
      });

      return {
        invoice: {
          ...updatedInvoice,
          lines: invoice.lines,
          customer: invoice.customer,
        },
        reversalHeader,
      };
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  private async resolveInvoiceRefs(orgId: string, lines: InvoiceLineCreateInput[], vatEnabled: boolean) {
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const incomeAccountIds = Array.from(
      new Set(lines.map((line) => line.incomeAccountId).filter(Boolean)),
    ) as string[];

    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { orgId, id: { in: itemIds } },
          select: { id: true, incomeAccountId: true, defaultTaxCodeId: true, isActive: true },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }
    if (items.some((item) => !item.isActive)) {
      throw new BadRequestException("Item must be active");
    }

    const defaultTaxIds = items
      .map((item) => item.defaultTaxCodeId)
      .filter(Boolean) as string[];
    const allTaxIds = Array.from(new Set([...taxCodeIds, ...defaultTaxIds]));

    if (allTaxIds.length > 0 && !vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCodes = allTaxIds.length
      ? await this.prisma.taxCode.findMany({
          where: { orgId, id: { in: allTaxIds } },
          select: { id: true, rate: true, type: true, isActive: true },
        })
      : [];
    if (taxCodes.length !== allTaxIds.length) {
      throw new NotFoundException("Tax code not found");
    }
    if (taxCodes.some((tax) => !tax.isActive)) {
      throw new BadRequestException("Tax code must be active");
    }

    if (incomeAccountIds.length > 0) {
      const incomeAccounts = await this.prisma.account.findMany({
        where: { orgId, id: { in: incomeAccountIds } },
        select: { id: true, type: true, isActive: true },
      });
      if (incomeAccounts.length !== incomeAccountIds.length) {
        throw new NotFoundException("Income account not found");
      }
      if (incomeAccounts.some((account) => !account.isActive)) {
        throw new BadRequestException("Income account must be active");
      }
      if (incomeAccounts.some((account) => account.type !== "INCOME")) {
        throw new BadRequestException("Income account must be INCOME type");
      }
    }

    return {
      itemsById: new Map(items.map((item) => [item.id, item])),
      taxCodesById: new Map(taxCodes.map((tax) => [tax.id, { ...tax, rate: Number(tax.rate) }])),
    };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
