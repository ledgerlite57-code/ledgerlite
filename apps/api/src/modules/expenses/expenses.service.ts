import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { applyNumberingUpdate, nextNumbering, resolveNumberingFormats } from "../../common/numbering";
import { buildExpensePostingLines, calculateExpenseLines } from "../../expenses.utils";
import { gt, round2 } from "../../common/money";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";
import {
  type ExpenseCreateInput,
  type ExpenseLineCreateInput,
  type ExpenseUpdateInput,
  type PaginationInput,
} from "@ledgerlite/shared";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type ExpenseRecord = Prisma.ExpenseGetPayload<{
  include: {
    vendor: true;
    bankAccount: { include: { glAccount: true } };
    lines: { include: { item: true; taxCode: true; expenseAccount: true } };
  };
}>;

type ExpenseListParams = PaginationInput & {
  status?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  q?: string;
};

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listExpenses(orgId?: string, params?: ExpenseListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const where: Prisma.ExpenseWhereInput = { orgId };

    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (["DRAFT", "POSTED", "VOID"].includes(normalized)) {
        where.status = normalized as Prisma.ExpenseWhereInput["status"];
      }
    }

    if (params?.vendorId) {
      where.vendorId = params.vendorId;
    }

    if (params?.q) {
      where.OR = [
        { number: { contains: params.q, mode: "insensitive" } },
        { reference: { contains: params.q, mode: "insensitive" } },
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
      where.expenseDate = dateFilter;
    }

    if (params?.amountMin !== undefined || params?.amountMax !== undefined) {
      const amountFilter: Prisma.DecimalFilter = {};
      if (params.amountMin !== undefined) {
        amountFilter.gte = params.amountMin;
      }
      if (params.amountMax !== undefined) {
        amountFilter.lte = params.amountMax;
      }
      where.total = amountFilter;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: { vendor: true, bankAccount: true },
        orderBy: { expenseDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
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

  async getExpense(orgId?: string, expenseId?: string) {
    if (!orgId || !expenseId) {
      throw new NotFoundException("Expense not found");
    }

    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, orgId },
      include: {
        vendor: true,
        bankAccount: { include: { glAccount: true } },
        lines: { include: { item: true, taxCode: true, expenseAccount: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException("Expense not found");
    }

    return expense;
  }

  async createExpense(
    orgId?: string,
    actorUserId?: string,
    input?: ExpenseCreateInput,
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
      scope: "expenses.create",
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
        return existingKey.response as unknown as ExpenseRecord;
      }
    }

    const [org, orgSettings] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.orgSettings.findUnique({ where: { orgId }, select: { defaultVatBehavior: true } }),
    ]);
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    let vendorId: string | undefined;
    if (input.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({ where: { id: input.vendorId, orgId } });
      if (!vendor) {
        throw new NotFoundException("Vendor not found");
      }
      if (!vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }
      vendorId = vendor.id;
    }

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, orgId, isActive: true },
      include: { glAccount: true },
    });
    if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
      throw new BadRequestException("Bank account is not available");
    }

    const { itemsById, taxCodesById, expenseAccountsById, unitsById, baseUnitId } =
      await this.resolveExpenseRefs(orgId, input.lines, org.vatEnabled);

    const vatBehavior = orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
    let calculated;
    try {
      calculated = calculateExpenseLines({
        lines: input.lines.map((line) => ({
          ...line,
          unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
        })),
        itemsById,
        taxCodesById,
        unitsById,
        vatEnabled: org.vatEnabled,
        vatBehavior,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid expense lines");
    }

    for (const line of calculated.lines) {
      if (!expenseAccountsById.has(line.expenseAccountId)) {
        throw new BadRequestException("Expense account is missing or inactive");
      }
    }

    const expenseDate = new Date(input.expenseDate);
    const currency = input.currency ?? bankAccount.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }
    if (bankAccount.currency && bankAccount.currency !== currency) {
      throw new BadRequestException("Expense currency must match bank account currency");
    }

    const expense = await this.prisma.expense.create({
      data: {
        orgId,
        vendorId: vendorId ?? null,
        bankAccountId: bankAccount.id,
        status: "DRAFT",
        expenseDate,
        currency,
        exchangeRate: input.exchangeRate ?? 1,
        reference: input.reference,
        subTotal: calculated.subTotal,
        taxTotal: calculated.taxTotal,
        total: calculated.total,
        notes: input.notes,
        createdByUserId: actorUserId,
        lines: {
          createMany: {
            data: calculated.lines.map((line) => ({
              lineNo: line.lineNo,
              expenseAccountId: line.expenseAccountId,
              itemId: line.itemId,
              unitOfMeasureId: line.unitOfMeasureId ?? undefined,
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
      },
      include: {
        vendor: true,
        bankAccount: { include: { glAccount: true } },
        lines: { include: { item: true, taxCode: true, expenseAccount: true } },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "EXPENSE",
      entityId: expense.id,
      action: AuditAction.CREATE,
      after: expense,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: expense as unknown as object,
          statusCode: 201,
        },
      });
    }

    return expense;
  }

  async updateExpense(orgId?: string, expenseId?: string, actorUserId?: string, input?: ExpenseUpdateInput) {
    if (!orgId || !expenseId) {
      throw new NotFoundException("Expense not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id: expenseId, orgId },
        include: { lines: true },
      });
      if (!existing) {
        throw new NotFoundException("Expense not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Only draft expenses can be updated");
      }

      const org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      let vendorId = existing.vendorId ?? null;
      if (Object.prototype.hasOwnProperty.call(input, "vendorId")) {
        if (!input.vendorId) {
          vendorId = null;
        } else {
          const vendor = await tx.vendor.findFirst({ where: { id: input.vendorId, orgId } });
          if (!vendor) {
            throw new NotFoundException("Vendor not found");
          }
          if (!vendor.isActive) {
            throw new BadRequestException("Vendor must be active");
          }
          vendorId = vendor.id;
        }
      }

      const bankAccountId = input.bankAccountId ?? existing.bankAccountId;
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, orgId, isActive: true },
        include: { glAccount: true },
      });
      if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
        throw new BadRequestException("Bank account is not available");
      }

      const lines = input.lines ?? existing.lines.map((line) => ({
        expenseAccountId: line.expenseAccountId,
        itemId: line.itemId ?? undefined,
        unitOfMeasureId: line.unitOfMeasureId ?? undefined,
        description: line.description,
        qty: Number(line.qty),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount ?? 0),
        taxCodeId: line.taxCodeId ?? undefined,
      }));

      const { itemsById, taxCodesById, expenseAccountsById, unitsById, baseUnitId } =
        await this.resolveExpenseRefs(orgId, lines, org.vatEnabled, tx);

      const vatBehavior =
        (await tx.orgSettings.findUnique({ where: { orgId }, select: { defaultVatBehavior: true } }))?.defaultVatBehavior ??
        "EXCLUSIVE";

      let calculated;
      try {
        calculated = calculateExpenseLines({
          lines: lines.map((line) => ({
            ...line,
            unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
          })),
          itemsById,
          taxCodesById,
          unitsById,
          vatEnabled: org.vatEnabled,
          vatBehavior,
        });
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : "Invalid expense lines");
      }

      for (const line of calculated.lines) {
        if (!expenseAccountsById.has(line.expenseAccountId)) {
          throw new BadRequestException("Expense account is missing or inactive");
        }
      }

      const expenseDate = input.expenseDate ? new Date(input.expenseDate) : existing.expenseDate;
      const currency = input.currency ?? existing.currency ?? bankAccount.currency ?? org.baseCurrency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }
      if (bankAccount.currency && bankAccount.currency !== currency) {
        throw new BadRequestException("Expense currency must match bank account currency");
      }

      await tx.expenseLine.deleteMany({ where: { expenseId } });

      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          vendorId,
          bankAccountId: bankAccount.id,
          expenseDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          reference: input.reference ?? existing.reference,
          notes: input.notes ?? existing.notes,
          subTotal: calculated.subTotal,
          taxTotal: calculated.taxTotal,
          total: calculated.total,
          lines: {
            createMany: {
              data: calculated.lines.map((line) => ({
                lineNo: line.lineNo,
                expenseAccountId: line.expenseAccountId,
                itemId: line.itemId,
                unitOfMeasureId: line.unitOfMeasureId ?? undefined,
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
        },
        include: {
          vendor: true,
          bankAccount: { include: { glAccount: true } },
          lines: { include: { item: true, taxCode: true, expenseAccount: true } },
        },
      });

      return { before: existing, after: updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "EXPENSE",
      entityId: expenseId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postExpense(orgId?: string, expenseId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !expenseId) {
      throw new NotFoundException("Expense not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "expenses.post",
      actorUserId,
    });
    const requestHash = postKey ? hashRequestBody({ expenseId }) : null;
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

    let result: { expense: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.findFirst({
          where: { id: expenseId, orgId },
          include: { lines: true },
        });
        if (!expense) {
          throw new NotFoundException("Expense not found");
        }
        if (expense.status !== "DRAFT") {
          throw new ConflictException("Expense is already posted");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        ensureBaseCurrencyOnly(org.baseCurrency, expense.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, expense.expenseDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "EXPENSE",
            entityId: expense.id,
            action: AuditAction.UPDATE,
            before: { status: expense.status, expenseDate: expense.expenseDate },
            after: {
              blockedAction: "post expense",
              docDate: expense.expenseDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, expense.expenseDate, "post expense");

        if (!org.vatEnabled && gt(expense.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const bankAccount = await tx.bankAccount.findFirst({
          where: { id: expense.bankAccountId, orgId, isActive: true },
          include: { glAccount: true },
        });
        if (!bankAccount || !bankAccount.glAccount || !bankAccount.glAccount.isActive) {
          throw new BadRequestException("Bank account is not available");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(expense.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_RECEIVABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Receivable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const expenseAccountIds = Array.from(new Set(expense.lines.map((line) => line.expenseAccountId)));
        const expenseAccounts = expenseAccountIds.length
          ? await tx.account.findMany({ where: { orgId, id: { in: expenseAccountIds }, isActive: true } })
          : [];
        if (expenseAccounts.length !== expenseAccountIds.length) {
          throw new BadRequestException("Expense account is missing or inactive");
        }

        const formats = resolveNumberingFormats(org.orgSettings);
        const { assignedNumber, nextFormats } = nextNumbering(formats, "expense");
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
        try {
          posting = buildExpensePostingLines({
            expenseNumber: assignedNumber,
            vendorId: expense.vendorId,
            total: expense.total,
            lines: expense.lines.map((line) => ({
              expenseAccountId: line.expenseAccountId,
              lineSubTotal: line.lineSubTotal,
              lineTax: line.lineTax,
              taxCodeId: line.taxCodeId,
            })),
            bankAccountId: bankAccount.glAccountId,
            vatAccountId,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post expense");
        }

        const totals = assertGlLinesValid(posting.lines);
        assertMoneyEq(round2(totals.totalDebit), round2(posting.totalDebit), "Expense debit mismatch");
        assertMoneyEq(round2(totals.totalCredit), round2(posting.totalCredit), "Expense credit mismatch");

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "EXPENSE",
            sourceId: expense.id,
            postingDate: expense.expenseDate,
            currency: expense.currency,
            exchangeRate: expense.exchangeRate ?? 1,
            totalDebit: totals.totalDebit,
            totalCredit: totals.totalCredit,
            status: "POSTED",
            memo: assignedNumber ? `Expense ${assignedNumber}` : "Expense",
            createdByUserId: actorUserId,
            lines: {
              createMany: {
                data: posting.lines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  vendorId: line.vendorId ?? undefined,
                  taxCodeId: line.taxCodeId ?? undefined,
                })),
              },
            },
          },
          include: { lines: true },
        });

        const updated = await tx.expense.update({
          where: { id: expense.id },
          data: {
            status: "POSTED",
            postedAt: new Date(),
            number: assignedNumber,
          },
          include: {
            vendor: true,
            bankAccount: { include: { glAccount: true } },
            lines: { include: { item: true, taxCode: true, expenseAccount: true } },
          },
        });

        return { expense: updated, glHeader };
      });
    } catch (err) {
      if (err instanceof ConflictException || err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "EXPENSE",
      entityId: (result.expense as { id?: string }).id ?? expenseId,
      action: AuditAction.POST,
      after: result.expense,
    });

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

  async voidExpense(orgId?: string, expenseId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !expenseId) {
      throw new NotFoundException("Expense not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "expenses.void",
      actorUserId,
    });
    const requestHash = voidKey ? hashRequestBody({ expenseId, action: "VOID" }) : null;
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
      const expense = await tx.expense.findFirst({
        where: { id: expenseId, orgId },
      });
      if (!expense) {
        throw new NotFoundException("Expense not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "EXPENSE",
            sourceId: expense.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (expense.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Expense is already voided");
        }
        return {
          expense,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (expense.status !== "POSTED") {
        throw new ConflictException("Only posted expenses can be voided");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, expense.expenseDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "EXPENSE",
          entityId: expense.id,
          action: AuditAction.UPDATE,
          before: { status: expense.status, expenseDate: expense.expenseDate },
          after: {
            blockedAction: "void expense",
            docDate: expense.expenseDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, expense.expenseDate, "void expense");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this expense");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void expense ${expense.number ?? expense.id}`,
        reversalDate: new Date(),
      });

      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: "VOID",
          voidedAt: new Date(),
        },
      });

      return { expense: updated, reversalHeader };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "EXPENSE",
      entityId: expenseId,
      action: AuditAction.VOID,
      after: result,
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

  private async resolveExpenseRefs(
    orgId: string,
    lines: ExpenseLineCreateInput[],
    vatEnabled: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const expenseAccountIds = Array.from(new Set(lines.map((line) => line.expenseAccountId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const unitIds = Array.from(new Set(lines.map((line) => line.unitOfMeasureId).filter(Boolean))) as string[];
    const client = tx ?? this.prisma;

    const items = itemIds.length
      ? await client.item.findMany({
          where: { orgId, id: { in: itemIds } },
          select: {
            id: true,
            expenseAccountId: true,
            defaultTaxCodeId: true,
            unitOfMeasureId: true,
            trackInventory: true,
            isActive: true,
          },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }
    if (items.some((item) => !item.isActive)) {
      throw new BadRequestException("Item must be active");
    }
    if (items.some((item) => item.trackInventory)) {
      throw new BadRequestException("Inventory items must be purchased via Bills");
    }

    const defaultTaxIds = items
      .map((item) => item.defaultTaxCodeId)
      .filter(Boolean) as string[];
    const allTaxIds = Array.from(new Set([...taxCodeIds, ...defaultTaxIds]));

    if (allTaxIds.length > 0 && !vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCodes = allTaxIds.length
      ? await client.taxCode.findMany({
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

    const expenseAccounts = expenseAccountIds.length
      ? await client.account.findMany({
          where: { orgId, id: { in: expenseAccountIds }, isActive: true },
          select: { id: true },
        })
      : [];

    const baseUnit =
      (await client.unitOfMeasure.findFirst({
        where: { orgId, baseUnitId: null, isActive: true, name: "Each" },
        select: { id: true },
      })) ??
      (await client.unitOfMeasure.findFirst({
        where: { orgId, baseUnitId: null, isActive: true },
        select: { id: true },
      }));
    if (!baseUnit) {
      throw new BadRequestException("Base unit of measure is required");
    }

    const itemUnitIds = items
      .map((item) => item.unitOfMeasureId ?? undefined)
      .filter((unitId): unitId is string => Boolean(unitId));
    const unitLookupIds = Array.from(new Set([...unitIds, ...itemUnitIds]));
    const units = unitLookupIds.length
      ? await client.unitOfMeasure.findMany({
          where: { orgId, id: { in: unitLookupIds }, isActive: true },
          select: { id: true, baseUnitId: true, conversionRate: true },
        })
      : [];
    if (units.length !== unitLookupIds.length) {
      throw new NotFoundException("Unit of measure not found");
    }

    return {
      itemsById: new Map(items.map((item) => [item.id, item])),
      taxCodesById: new Map(taxCodes.map((tax) => [tax.id, { ...tax, rate: Number(tax.rate) }])),
      expenseAccountsById: new Set(expenseAccounts.map((account) => account.id)),
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
}
