import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InventorySourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { applyNumberingUpdate, nextNumbering, resolveNumberingFormats } from "../../common/numbering";
import { buildInvoicePostingLines, calculateInvoiceLines } from "../../invoices.utils";
import { dec, gt, round2 } from "../../common/money";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { getApiEnv } from "../../common/env";
import {
  assertNegativeStockPolicy,
  detectNegativeStockIssues,
  normalizeNegativeStockPolicy,
  serializeNegativeStockIssues,
  type NegativeStockIssue,
} from "../../common/negative-stock-policy";
import { createGlReversal } from "../../common/gl-reversal";
import {
  type InventoryCostItem,
  type InventoryPostingLine,
  buildInventoryCostPostingLines,
  resolveInventoryCostLines,
} from "../../common/inventory-cost";
import {
  type InvoiceCreateInput,
  type InvoiceUpdateInput,
  type InvoiceLineCreateInput,
  type PaginationInput,
  Permissions,
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

type InvoicePostActionInput = {
  negativeStockOverride?: boolean;
  negativeStockOverrideReason?: string;
};

type NegativeStockWarningPayload = {
  policy: "WARN" | "BLOCK";
  overrideApplied: boolean;
  overrideReason?: string | null;
  items: ReturnType<typeof serializeNegativeStockIssues>;
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
    const customerUnappliedCredit = await this.computeCustomerUnappliedCreditBalance(orgId, invoice.customerId);
    return {
      ...invoice,
      customerUnappliedCredit,
    };
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

    const createKey = buildIdempotencyKey(idempotencyKey, {
      scope: "invoices.create",
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
        return existingKey.response as unknown as InvoiceRecord;
      }
    }

    const [org, orgSettings] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.orgSettings.findUnique({ where: { orgId }, select: { defaultVatBehavior: true } }),
    ]);
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

    const { itemsById, taxCodesById, unitsById, baseUnitId } = await this.resolveInvoiceRefs(
      orgId,
      input.lines,
      org.vatEnabled,
    );
    const resolvedLines = input.lines.map((line) => ({
      ...line,
      unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
    }));
    const vatBehavior = orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
    let calculated;
    try {
      calculated = calculateInvoiceLines({
        lines: resolvedLines,
        itemsById,
        taxCodesById,
        unitsById,
        vatEnabled: org.vatEnabled,
        vatBehavior,
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
      exchangeRate: input.exchangeRate ?? 1,
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
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
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

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
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
        const { itemsById, taxCodesById, unitsById, baseUnitId } = await this.resolveInvoiceRefs(
          orgId,
          input.lines,
          org.vatEnabled,
        );
        const resolvedLines = input.lines.map((line) => ({
          ...line,
          unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
        }));
        const vatBehavior = org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
        let calculated;
        try {
          calculated = calculateInvoiceLines({
            lines: resolvedLines,
            itemsById,
            taxCodesById,
            unitsById,
            vatEnabled: org.vatEnabled,
            vatBehavior,
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
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
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
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
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

  async postInvoice(
    orgId?: string,
    invoiceId?: string,
    actorUserId?: string,
    idempotencyKey?: string,
    options?: InvoicePostActionInput,
  ) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const negativeStockOverrideRequested = Boolean(options?.negativeStockOverride);
    const negativeStockOverrideReason =
      options?.negativeStockOverrideReason && options.negativeStockOverrideReason.trim().length > 0
        ? options.negativeStockOverrideReason.trim()
        : undefined;

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "invoices.post",
      actorUserId,
    });
    const requestHash = postKey
      ? hashRequestBody({
          invoiceId,
          negativeStockOverrideRequested,
          negativeStockOverrideReason: negativeStockOverrideReason ?? null,
        })
      : null;
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

    let result: { invoice: object; glHeader: object; warnings?: { negativeStock: NegativeStockWarningPayload } };
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

        const canOverrideNegativeStock = negativeStockOverrideRequested
          ? await this.hasOrgPermission(tx, orgId, actorUserId, Permissions.INVENTORY_NEGATIVE_STOCK_OVERRIDE)
          : false;
        if (negativeStockOverrideRequested && !canOverrideNegativeStock) {
          throw new ForbiddenException("You do not have permission to override negative stock policy");
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
              select: {
                id: true,
                incomeAccountId: true,
                expenseAccountId: true,
                inventoryAccountId: true,
                purchasePrice: true,
                trackInventory: true,
                type: true,
                unitOfMeasureId: true,
              },
            })
          : [];

        const itemsById = new Map(items.map((item) => [item.id, item]));

        const lineIncomeAccountIds = invoice.lines
          .map((line) => line.incomeAccountId)
          .filter((accountId): accountId is string => Boolean(accountId));
        const incomeAccountIds = Array.from(
          new Set([
            ...items
              .map((item) => item.incomeAccountId)
              .filter((accountId): accountId is string => Boolean(accountId)),
            ...lineIncomeAccountIds,
          ]),
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

        const formats = resolveNumberingFormats(org.orgSettings);
        const { assignedNumber, nextFormats } = nextNumbering(formats, "invoice");
        await tx.orgSettings.upsert({
          where: { orgId },
          update: applyNumberingUpdate(nextFormats),
          create: {
            orgId,
            ...applyNumberingUpdate(nextFormats),
          },
          select: { orgId: true },
        });

        let posting;
        let inventoryPosting: {
          lines: InventoryPostingLine[];
          totalDebit: Prisma.Decimal;
          totalCredit: Prisma.Decimal;
        } = { lines: [], totalDebit: dec(0), totalCredit: dec(0) };
        let unitCostByLineId: Map<string, Prisma.Decimal> | undefined;
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

        const inventoryItems = items.filter((item) => item.trackInventory && item.type === "INVENTORY");
        if (inventoryItems.length > 0) {
          const defaultInventoryAccountId =
            org.orgSettings?.defaultInventoryAccountId ??
            (await tx.account.findFirst({ where: { orgId, code: "1400" }, select: { id: true } }))?.id ??
            null;
          const resolvedInventoryAccountIds = new Set<string>();
          for (const item of inventoryItems) {
            const resolvedInventoryAccountId = item.inventoryAccountId ?? defaultInventoryAccountId;
            if (!resolvedInventoryAccountId) {
              throw new BadRequestException("Inventory account is not configured");
            }
            resolvedInventoryAccountIds.add(resolvedInventoryAccountId);
            itemsById.set(item.id, { ...item, inventoryAccountId: resolvedInventoryAccountId });
          }

          if (resolvedInventoryAccountIds.size > 0) {
            const inventoryAccounts = await tx.account.findMany({
              where: { orgId, id: { in: Array.from(resolvedInventoryAccountIds) }, isActive: true },
            });
            if (inventoryAccounts.length !== resolvedInventoryAccountIds.size) {
              throw new BadRequestException("Inventory account is missing or inactive");
            }
            if (inventoryAccounts.some((account) => account.type !== "ASSET")) {
              throw new BadRequestException("Inventory account must be ASSET type");
            }
          }

          const cogsAccountIds = Array.from(
            new Set(
              inventoryItems
                .map((item) => item.expenseAccountId)
                .filter((accountId): accountId is string => Boolean(accountId)),
            ),
          );
          const cogsAccounts = cogsAccountIds.length
            ? await tx.account.findMany({ where: { orgId, id: { in: cogsAccountIds }, isActive: true } })
            : [];
          if (cogsAccounts.length !== cogsAccountIds.length) {
            throw new BadRequestException("COGS account is missing or inactive");
          }
          if (cogsAccounts.some((account) => account.type !== "EXPENSE")) {
            throw new BadRequestException("COGS account must be EXPENSE type");
          }

          const costResolution = await resolveInventoryCostLines({
            tx,
            orgId,
            effectiveAt: invoice.invoiceDate,
            useEffectiveDateCutoff: getApiEnv().INVENTORY_COST_EFFECTIVE_DATE_ENABLED,
            lines: invoice.lines.map((line) => ({
              id: line.id,
              itemId: line.itemId,
              qty: line.qty,
              unitOfMeasureId: line.unitOfMeasureId,
            })),
            itemsById: itemsById as Map<string, InventoryCostItem>,
          });
          unitCostByLineId = costResolution.unitCostByLineId;
          if (unitCostByLineId.size > 0) {
            await Promise.all(
              Array.from(unitCostByLineId.entries()).map(([lineId, unitCost]) =>
                tx.invoiceLine.update({
                  where: { id: lineId },
                  data: { inventoryUnitCost: unitCost },
                }),
              ),
            );
          }
          inventoryPosting = buildInventoryCostPostingLines({
            costLines: costResolution.costLines,
            description: assignedNumber ? `COGS Invoice ${assignedNumber}` : "COGS Invoice",
            customerId: invoice.customerId,
            direction: "ISSUE",
            startingLineNo: posting.lines.length + 1,
          });
        }

        const combinedLines = [...posting.lines, ...inventoryPosting.lines];
        const combinedTotals = assertGlLinesValid(combinedLines);
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
            postingDate: updatedInvoice.invoiceDate,
            currency: invoice.currency,
            exchangeRate: invoice.exchangeRate,
            totalDebit: combinedTotals.totalDebit,
            totalCredit: combinedTotals.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Invoice ${updatedInvoice.number ?? assignedNumber}`,
            lines: {
              createMany: {
                data: combinedLines.map((line) => ({
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

        const negativeStockCheck = await this.createInventoryMovements(tx, {
          orgId,
          sourceId: invoice.id,
          lines: invoice.lines,
          itemsById,
          sourceType: "INVOICE",
          createdByUserId: actorUserId,
          effectiveAt: updatedInvoice.invoiceDate,
          useEffectiveDateCutoff: getApiEnv().INVENTORY_COST_EFFECTIVE_DATE_ENABLED,
          reverse: true,
          unitCostByLineId,
          negativeStockPolicy: org.orgSettings?.negativeStockPolicy,
          allowNegativeStockOverride: negativeStockOverrideRequested,
        });

        const negativeStockWarning =
          negativeStockCheck && negativeStockCheck.issues.length > 0
            ? {
                policy: negativeStockCheck.policy,
                overrideApplied: negativeStockCheck.overrideApplied,
                overrideReason: negativeStockCheck.overrideApplied ? negativeStockOverrideReason ?? null : null,
                items: serializeNegativeStockIssues(negativeStockCheck.issues),
              }
            : null;

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "INVOICE",
            entityId: invoice.id,
            action: AuditAction.POST,
            before: invoice,
            after: negativeStockWarning
              ? {
                  ...updatedInvoice,
                  negativeStockWarning,
                }
              : updatedInvoice,
            requestId: RequestContext.get()?.requestId,
            ip: RequestContext.get()?.ip,
            userAgent: RequestContext.get()?.userAgent,
          },
        });

        const response = {
          invoice: {
            ...updatedInvoice,
            lines: invoice.lines,
            customer: invoice.customer,
          },
          glHeader,
          ...(negativeStockWarning ? { warnings: { negativeStock: negativeStockWarning } } : {}),
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Invoice is already posted");
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

  async voidInvoice(orgId?: string, invoiceId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !invoiceId) {
      throw new NotFoundException("Invoice not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "invoices.void",
      actorUserId,
    });
    const requestHash = voidKey ? hashRequestBody({ invoiceId, action: "VOID" }) : null;
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

      if (gt(invoice.amountPaid ?? 0, 0)) {
        throw new ConflictException("Cannot void an invoice that has received payments");
      }

      const allocationCount = await tx.paymentReceivedAllocation.count({
        where: { invoiceId: invoice.id, paymentReceived: { status: "POSTED" } },
      });
      if (allocationCount > 0) {
        throw new ConflictException("Cannot void an invoice that has received payments");
      }

      const creditAllocationCount = await tx.creditNoteAllocation.count({
        where: { invoiceId: invoice.id, creditNote: { status: "POSTED" } },
      });
      if (creditAllocationCount > 0) {
        throw new ConflictException("Cannot void an invoice with applied credit notes");
      }

      const creditNoteCount = await tx.creditNote.count({
        where: { invoiceId: invoice.id, status: "POSTED" },
      });
      if (creditNoteCount > 0) {
        throw new ConflictException("Cannot void an invoice with posted credit notes");
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

      const itemIds = invoice.lines.map((line) => line.itemId).filter(Boolean) as string[];
      const items = itemIds.length
        ? await tx.item.findMany({
            where: { orgId, id: { in: itemIds } },
            select: { id: true, trackInventory: true, type: true, unitOfMeasureId: true },
          })
        : [];
      const itemsById = new Map(items.map((item) => [item.id, item]));

      const priorMovements = await tx.inventoryMovement.findMany({
        where: { orgId, sourceType: "INVOICE", sourceId: invoice.id, unitCost: { not: null } },
        select: { sourceLineId: true, unitCost: true },
      });
      const unitCostByLineId = new Map(
        priorMovements
          .filter((movement) => movement.sourceLineId && movement.unitCost)
          .map((movement) => [movement.sourceLineId as string, movement.unitCost as Prisma.Decimal]),
      );

      await this.createInventoryMovements(tx, {
        orgId,
        sourceId: invoice.id,
        lines: invoice.lines,
        itemsById,
        sourceType: "INVOICE_VOID",
        createdByUserId: actorUserId,
        effectiveAt: updatedInvoice.voidedAt ?? new Date(),
        unitCostByLineId,
      });

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
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
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

  private async resolveInvoiceRefs(orgId: string, lines: InvoiceLineCreateInput[], vatEnabled: boolean) {
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const incomeAccountIds = Array.from(
      new Set(lines.map((line) => line.incomeAccountId).filter(Boolean)),
    ) as string[];
    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { orgId, id: { in: itemIds } },
          select: {
            id: true,
            incomeAccountId: true,
            defaultTaxCodeId: true,
            unitOfMeasureId: true,
            isActive: true,
            type: true,
          },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }
    if (items.some((item) => !item.isActive)) {
      throw new BadRequestException("Item must be active");
    }
    if (items.some((item) => !["SERVICE", "INVENTORY"].includes(item.type))) {
      throw new BadRequestException("Only service or inventory items can be used on invoices");
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

    const baseUnit =
      (await this.prisma.unitOfMeasure.findFirst({
        where: { orgId, baseUnitId: null, isActive: true, name: "Each" },
        select: { id: true },
      })) ??
      (await this.prisma.unitOfMeasure.findFirst({
        where: { orgId, baseUnitId: null, isActive: true },
        select: { id: true },
      }));
    if (!baseUnit) {
      throw new BadRequestException("Base unit of measure is required");
    }

    const unitIds = Array.from(
      new Set(
        lines
          .map((line) => line.unitOfMeasureId)
          .concat(items.map((item) => item.unitOfMeasureId ?? undefined))
          .filter(Boolean),
      ),
    ) as string[];

    const units = unitIds.length
      ? await this.prisma.unitOfMeasure.findMany({
          where: { orgId, id: { in: unitIds }, isActive: true },
          select: { id: true, baseUnitId: true, conversionRate: true },
        })
      : [];
    if (units.length !== unitIds.length) {
      throw new NotFoundException("Unit of measure not found");
    }

    return {
      itemsById: new Map(items.map((item) => [item.id, item])),
      taxCodesById: new Map(taxCodes.map((tax) => [tax.id, { ...tax, rate: Number(tax.rate) }])),
      unitsById: new Map(
        units.map((unit) => [
          unit.id,
          { ...unit, conversionRate: unit.conversionRate ? Number(unit.conversionRate) : 1 },
        ]),
      ),
      baseUnitId: baseUnit.id,
    };
  }

  private resolveLineUom(
    itemId: string | undefined,
    requestedUnitId: string | undefined,
    itemsById: Map<string, { id: string; unitOfMeasureId: string | null }>,
    unitsById: Map<string, { id: string; baseUnitId: string | null }>,
    baseUnitId: string,
  ) {
    if (!itemId) {
      return baseUnitId;
    }
    const item = itemsById.get(itemId);
    if (!item) {
      throw new NotFoundException("Item not found");
    }
    const itemUnitId = item.unitOfMeasureId ?? baseUnitId;
    if (!requestedUnitId) {
      return itemUnitId;
    }
    const requestedUnit = unitsById.get(requestedUnitId);
    if (!requestedUnit) {
      throw new NotFoundException("Unit of measure not found");
    }
    const requestedBaseId = requestedUnit.baseUnitId ?? requestedUnit.id;
    const itemBaseUnitId = item.unitOfMeasureId
      ? (unitsById.get(item.unitOfMeasureId)?.baseUnitId ?? item.unitOfMeasureId)
      : baseUnitId;
    if (requestedBaseId !== itemBaseUnitId) {
      throw new BadRequestException("Unit of measure is not compatible with item");
    }
    return requestedUnitId;
  }

  private async createInventoryMovements(
    tx: Prisma.TransactionClient,
    params: {
      orgId: string;
      sourceId: string;
      lines: Array<{
        id: string;
        itemId: string | null;
        qty: Prisma.Decimal;
        unitOfMeasureId: string | null;
      }>;
      itemsById: Map<string, { id: string; trackInventory: boolean; type: string; unitOfMeasureId: string | null }>;
      sourceType: InventorySourceType;
      createdByUserId: string;
      effectiveAt: Date;
      useEffectiveDateCutoff?: boolean;
      reverse?: boolean;
      unitCostByLineId?: Map<string, Prisma.Decimal>;
      negativeStockPolicy?: string | null;
      allowNegativeStockOverride?: boolean;
    },
  ): Promise<{ policy: "WARN" | "BLOCK"; issues: NegativeStockIssue[]; overrideApplied: boolean } | null> {
    const unitIds = Array.from(
      new Set(
        params.lines
          .map((line) => line.unitOfMeasureId ?? params.itemsById.get(line.itemId ?? "")?.unitOfMeasureId)
          .filter(Boolean),
      ),
    ) as string[];
    const units = unitIds.length
      ? await tx.unitOfMeasure.findMany({
          where: { orgId: params.orgId, id: { in: unitIds } },
          select: { id: true, baseUnitId: true, conversionRate: true },
        })
      : [];
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));

    const movements: Prisma.InventoryMovementCreateManyInput[] = [];
    for (const line of params.lines) {
      if (!line.itemId) {
        continue;
      }
      const item = params.itemsById.get(line.itemId);
      if (!item || !item.trackInventory || item.type !== "INVENTORY") {
        continue;
      }
      const unitId = line.unitOfMeasureId ?? item.unitOfMeasureId ?? undefined;
      const unit = unitId ? unitsById.get(unitId) : undefined;
      const conversion = unit && unit.baseUnitId ? dec(unit.conversionRate ?? 1) : dec(1);
      const qtyBase = dec(line.qty).mul(conversion);
      if (qtyBase.equals(0)) {
        continue;
      }
      const direction = params.reverse ? dec(0).sub(qtyBase) : qtyBase;
      movements.push({
        orgId: params.orgId,
        itemId: item.id,
        quantity: direction,
        unitCost: params.unitCostByLineId?.get(line.id),
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        sourceLineId: line.id,
        createdByUserId: params.createdByUserId,
        effectiveAt: params.effectiveAt,
      });
    }

    let negativeStockCheck: { policy: "WARN" | "BLOCK"; issues: NegativeStockIssue[]; overrideApplied: boolean } | null =
      null;
    if (params.reverse && movements.length > 0) {
      const policy = normalizeNegativeStockPolicy(params.negativeStockPolicy);
      if (policy !== "ALLOW") {
        const issueQtyByItem = new Map<string, Prisma.Decimal>();
        for (const movement of movements) {
          const current = issueQtyByItem.get(movement.itemId) ?? dec(0);
          const movementQty = dec(movement.quantity as Prisma.Decimal.Value);
          issueQtyByItem.set(movement.itemId, dec(current).add(movementQty.abs()));
        }

        const itemIds = Array.from(issueQtyByItem.keys());
        const onHandRows = itemIds.length
          ? await tx.inventoryMovement.groupBy({
              by: ["itemId"],
              where: {
                orgId: params.orgId,
                itemId: { in: itemIds },
                ...(params.useEffectiveDateCutoff
                  ? {
                      effectiveAt: {
                        lte: params.effectiveAt,
                      },
                    }
                  : {}),
              },
              _sum: { quantity: true },
            })
          : [];
        const onHandByItem = new Map(onHandRows.map((row) => [row.itemId, dec(row._sum.quantity ?? 0)]));
        const issues = detectNegativeStockIssues(
          itemIds.map((itemId) => ({
            itemId,
            onHandQty: onHandByItem.get(itemId) ?? dec(0),
            issueQty: issueQtyByItem.get(itemId) ?? dec(0),
          })),
        );
        const overrideApplied = policy === "BLOCK" && issues.length > 0 && Boolean(params.allowNegativeStockOverride);
        if (!overrideApplied) {
          assertNegativeStockPolicy(policy, issues);
        }
        if (issues.length > 0) {
          negativeStockCheck = {
            policy,
            issues,
            overrideApplied,
          };
        }
      }
    }

    if (movements.length > 0) {
      await tx.inventoryMovement.createMany({ data: movements });
    }
    return negativeStockCheck;
  }

  private async hasOrgPermission(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    permissionCode: string,
  ) {
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { roleId: true, isActive: true },
    });
    if (!membership?.isActive) {
      return false;
    }
    const count = await tx.rolePermission.count({
      where: {
        roleId: membership.roleId,
        permissionCode,
      },
    });
    return count > 0;
  }

  private async computeCustomerUnappliedCreditBalance(orgId: string, customerId: string) {
    const postedCreditNotes = await this.prisma.creditNote.findMany({
      where: {
        orgId,
        customerId,
        status: "POSTED",
      },
      select: {
        total: true,
        allocations: { select: { amount: true } },
        refunds: { select: { amount: true } },
      },
    });

    let totalRemaining = dec(0);
    for (const creditNote of postedCreditNotes) {
      const applied = round2(creditNote.allocations.reduce((sum, allocation) => dec(sum).add(allocation.amount), dec(0)));
      const refunded = round2(creditNote.refunds.reduce((sum, refund) => dec(sum).add(refund.amount), dec(0)));
      const remaining = round2(dec(creditNote.total).sub(applied).sub(refunded));
      if (remaining.greaterThan(0)) {
        totalRemaining = round2(dec(totalRemaining).add(remaining));
      }
    }
    return totalRemaining.toFixed(2);
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
