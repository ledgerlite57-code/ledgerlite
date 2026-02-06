import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InventorySourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { calculateBillLines } from "../../bills.utils";
import { buildDebitNotePostingLines } from "../../debit-notes.utils";
import { dec, gt, round2, type MoneyValue } from "../../common/money";
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
import { deriveBillMovementUnitCost, roundInventoryQty } from "../bills/bills.service";
import {
  type DebitNoteCreateInput,
  type DebitNoteApplyInput,
  type DebitNoteUnapplyInput,
  type DebitNoteUpdateInput,
  type DebitNoteLineCreateInput,
  type PaginationInput,
  Permissions,
} from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { DebitNotesRepository } from "./debit-notes.repo";

type DebitNoteRecord = Prisma.DebitNoteGetPayload<{
  include: {
    vendor: true;
    lines: { include: { item: true; taxCode: true } };
  };
}>;

type DebitNoteListParams = PaginationInput & {
  status?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

type DebitNoteVoidActionInput = {
  negativeStockOverride?: boolean;
  negativeStockOverrideReason?: string;
};

@Injectable()
export class DebitNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly debitNotesRepo: DebitNotesRepository,
  ) {}

  async listDebitNotes(orgId?: string, params?: DebitNoteListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const { data, total } = await this.debitNotesRepo.list({
      orgId,
      q: params?.q,
      status: params?.status,
      vendorId: params?.vendorId,
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

  async getDebitNote(orgId?: string, debitNoteId?: string) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
    }
    const debitNote = await this.debitNotesRepo.findForDetail(orgId, debitNoteId);
    if (!debitNote) {
      throw new NotFoundException("Debit note not found");
    }
    return debitNote;
  }

  async createDebitNote(
    orgId?: string,
    actorUserId?: string,
    input?: DebitNoteCreateInput,
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
      scope: "debit-notes.create",
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
        return existingKey.response as unknown as DebitNoteRecord;
      }
    }

    const [org, orgSettings] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.orgSettings.findUnique({ where: { orgId }, select: { defaultVatBehavior: true } }),
    ]);
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

    if (input.billId) {
      const bill = await this.prisma.bill.findFirst({ where: { id: input.billId, orgId } });
      if (!bill) {
        throw new NotFoundException("Bill not found");
      }
    }

    const { itemsById, taxCodesById, accountsById, unitsById, baseUnitId } = await this.resolveDebitNoteRefs(
      orgId,
      input.lines,
      org.vatEnabled,
    );
    const resolvedLines = input.lines.map((line) => ({
      ...line,
      expenseAccountId: this.resolveLineExpenseAccount(line, itemsById),
      unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
    }));
    this.validateDebitNoteLineAccounts({
      lines: resolvedLines.map((line) => ({
        itemId: line.itemId ?? null,
        expenseAccountId: line.expenseAccountId,
      })),
      itemsById,
      accountsById,
    });
    const vatBehavior = orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
    let calculated;
    try {
      calculated = calculateBillLines({
        lines: resolvedLines,
        itemsById,
        taxCodesById,
        unitsById,
        vatEnabled: org.vatEnabled,
        vatBehavior,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid debit note lines");
    }

    const debitNoteDate = new Date(input.debitNoteDate);
    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    const debitNote = await this.debitNotesRepo.create({
      orgId,
      vendorId: vendor.id,
      billId: input.billId ?? null,
      status: "DRAFT",
      debitNoteDate,
      currency,
      exchangeRate: input.exchangeRate ?? 1,
      subTotal: calculated.subTotal,
      taxTotal: calculated.taxTotal,
      total: calculated.total,
      reference: input.reference,
      notes: input.notes,
      createdByUserId: actorUserId,
      lines: {
        createMany: {
          data: calculated.lines.map((line) => ({
            lineNo: line.lineNo,
            itemId: line.itemId,
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            expenseAccountId: line.expenseAccountId,
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
      entityType: "DEBIT_NOTE",
      entityId: debitNote.id,
      action: AuditAction.CREATE,
      after: debitNote,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: debitNote as unknown as object,
          statusCode: 201,
        },
      });
    }

    return debitNote;
  }

  async updateDebitNote(orgId?: string, debitNoteId?: string, actorUserId?: string, input?: DebitNoteUpdateInput) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result: {
      before: object;
      after: object;
    } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.debitNotesRepo.findForUpdate(orgId, debitNoteId, tx);
      if (!existing) {
        throw new NotFoundException("Debit note not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted debit notes cannot be edited");
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

      if (input.billId) {
        const bill = await tx.bill.findFirst({ where: { id: input.billId, orgId } });
        if (!bill) {
          throw new NotFoundException("Bill not found");
        }
      }

      const debitNoteDate = input.debitNoteDate ? new Date(input.debitNoteDate) : existing.debitNoteDate;
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, debitNoteDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "DEBIT_NOTE",
          entityId: debitNoteId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, debitNoteDate: existing.debitNoteDate },
          after: {
            blockedAction: "update debit note",
            docDate: debitNoteDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, debitNoteDate, "update debit note");

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
        const { itemsById, taxCodesById, accountsById, unitsById, baseUnitId } = await this.resolveDebitNoteRefs(
          orgId,
          input.lines,
          org.vatEnabled,
          tx,
        );
        const resolvedLines = input.lines.map((line) => ({
          ...line,
          expenseAccountId: this.resolveLineExpenseAccount(line, itemsById),
          unitOfMeasureId: this.resolveLineUom(line.itemId, line.unitOfMeasureId, itemsById, unitsById, baseUnitId),
        }));
        this.validateDebitNoteLineAccounts({
          lines: resolvedLines.map((line) => ({
            itemId: line.itemId ?? null,
            expenseAccountId: line.expenseAccountId,
          })),
          itemsById,
          accountsById,
        });
        const vatBehavior = org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
        let calculated;
        try {
          calculated = calculateBillLines({
            lines: resolvedLines,
            itemsById,
            taxCodesById,
            unitsById,
            vatEnabled: org.vatEnabled,
            vatBehavior,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Invalid debit note lines");
        }
        totals = calculated;

        await this.debitNotesRepo.deleteLines(debitNoteId, tx);
        await this.debitNotesRepo.createLines(
          calculated.lines.map((line) => ({
            debitNoteId,
            lineNo: line.lineNo,
            itemId: line.itemId,
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            expenseAccountId: line.expenseAccountId,
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

      const updated = await this.debitNotesRepo.update(
        debitNoteId,
        {
          vendorId,
          billId: input.billId ?? existing.billId ?? null,
          debitNoteDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          reference: input.reference ?? existing.reference,
          notes: input.notes ?? existing.notes,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
        tx,
      );

      const after = await this.debitNotesRepo.findForDetail(orgId, debitNoteId, tx);

      return {
        before: existing,
        after: after ?? updated,
      };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "DEBIT_NOTE",
      entityId: debitNoteId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postDebitNote(
    orgId?: string,
    debitNoteId?: string,
    actorUserId?: string,
    idempotencyKey?: string,
    options?: DebitNoteVoidActionInput,
  ) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
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
      scope: "debit-notes.post",
      actorUserId,
    });
    const requestHash = postKey
      ? hashRequestBody({
          debitNoteId,
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

    let result: { debitNote: object; glHeader: object; warnings?: { negativeStock: object } };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const debitNote = await this.debitNotesRepo.findForPosting(orgId, debitNoteId, tx);
        if (!debitNote) {
          throw new NotFoundException("Debit note not found");
        }
        if (debitNote.status !== "DRAFT") {
          throw new ConflictException("Debit note is already posted");
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

        ensureBaseCurrencyOnly(org.baseCurrency, debitNote.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, debitNote.debitNoteDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "DEBIT_NOTE",
            entityId: debitNote.id,
            action: AuditAction.UPDATE,
            before: { status: debitNote.status, debitNoteDate: debitNote.debitNoteDate },
            after: {
              blockedAction: "post debit note",
              docDate: debitNote.debitNoteDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, debitNote.debitNoteDate, "post debit note");

        if (!org.vatEnabled && gt(debitNote.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const apAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AP", isActive: true },
        });
        if (!apAccount) {
          throw new BadRequestException("Accounts Payable account is not configured");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(debitNote.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_RECEIVABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Receivable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const itemIds = debitNote.lines.map((line) => line.itemId).filter(Boolean) as string[];
        const items = itemIds.length
          ? await tx.item.findMany({
              where: { orgId, id: { in: itemIds } },
              select: {
                id: true,
                expenseAccountId: true,
                inventoryAccountId: true,
                fixedAssetAccountId: true,
                trackInventory: true,
                type: true,
                unitOfMeasureId: true,
              },
            })
          : [];
        const itemsById = new Map(items.map((item) => [item.id, item]));

        const lineAccountIds = debitNote.lines
          .map((line) => line.expenseAccountId)
          .filter((accountId): accountId is string => Boolean(accountId));
        const itemAccountIds = items
          .flatMap((item) => [item.expenseAccountId, item.inventoryAccountId, item.fixedAssetAccountId])
          .filter((accountId): accountId is string => Boolean(accountId));
        const accountIds = Array.from(new Set([...lineAccountIds, ...itemAccountIds]));
        const accounts = accountIds.length
          ? await tx.account.findMany({
              where: { orgId, id: { in: accountIds }, isActive: true },
              select: { id: true, type: true, isActive: true },
            })
          : [];
        if (accounts.length !== accountIds.length) {
          throw new BadRequestException("Account is missing or inactive");
        }
        const accountsById = new Map(accounts.map((account) => [account.id, account]));

        const resolvedLines = debitNote.lines.map((line) => ({
          ...line,
          expenseAccountId: this.resolveLineExpenseAccount(
            { itemId: line.itemId ?? undefined, expenseAccountId: line.expenseAccountId ?? undefined },
            itemsById,
          ),
        }));
        this.validateDebitNoteLineAccounts({
          lines: resolvedLines.map((line) => ({
            itemId: line.itemId ?? null,
            expenseAccountId: line.expenseAccountId,
          })),
          itemsById,
          accountsById,
        });

        const assignedNumber = debitNote.number ?? `DN-${Date.now()}`;

        let posting;
        try {
          const postingItemsById = new Map(
            resolvedLines
              .filter((line) => line.itemId)
              .map((line) => [line.itemId as string, { expenseAccountId: line.expenseAccountId }]),
          );
          posting = buildDebitNotePostingLines({
            debitNoteNumber: assignedNumber,
            vendorId: debitNote.vendorId,
            total: debitNote.total,
            lines: resolvedLines.map((line) => ({
              itemId: line.itemId ?? undefined,
              expenseAccountId: line.expenseAccountId,
              lineSubTotal: line.lineSubTotal,
              lineTax: line.lineTax,
              taxCodeId: line.taxCodeId ?? undefined,
            })),
            itemsById: postingItemsById,
            apAccountId: apAccount.id,
            vatAccountId,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post debit note");
        }

        const combinedLines = posting.lines;
        const combinedTotals = assertGlLinesValid(combinedLines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Debit note posting");

        const updatedDebitNote = await this.debitNotesRepo.update(
          debitNoteId,
          {
            status: "POSTED",
            number: assignedNumber,
            postedAt: new Date(),
          },
          tx,
        );

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "DEBIT_NOTE",
            sourceId: debitNote.id,
            postingDate: updatedDebitNote.debitNoteDate,
            currency: debitNote.currency,
            exchangeRate: debitNote.exchangeRate,
            totalDebit: combinedTotals.totalDebit,
            totalCredit: combinedTotals.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Debit note ${updatedDebitNote.number ?? assignedNumber}`,
            lines: {
              createMany: {
                data: combinedLines.map((line) => ({
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

        const negativeStockCheck = await this.createInventoryMovements(tx, {
          orgId,
          debitNoteId: debitNote.id,
          lines: resolvedLines,
          itemsById,
          sourceType: "DEBIT_NOTE",
          createdByUserId: actorUserId,
          effectiveAt: updatedDebitNote.debitNoteDate,
          useEffectiveDateCutoff: getApiEnv().INVENTORY_COST_EFFECTIVE_DATE_ENABLED,
          reverse: true,
          includeUnitCost: true,
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
            entityType: "DEBIT_NOTE",
            entityId: debitNote.id,
            action: AuditAction.POST,
            before: debitNote,
            after: negativeStockWarning
              ? {
                  ...updatedDebitNote,
                  negativeStockWarning,
                }
              : updatedDebitNote,
            requestId: RequestContext.get()?.requestId,
            ip: RequestContext.get()?.ip,
            userAgent: RequestContext.get()?.userAgent,
          },
        });

        return {
          debitNote: {
            ...updatedDebitNote,
            lines: debitNote.lines,
            vendor: debitNote.vendor,
          },
          glHeader,
          ...(negativeStockWarning ? { warnings: { negativeStock: negativeStockWarning } } : {}),
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Debit note is already posted");
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

  async voidDebitNote(
    orgId?: string,
    debitNoteId?: string,
    actorUserId?: string,
    idempotencyKey?: string,
    options?: DebitNoteVoidActionInput,
  ) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const negativeStockOverrideRequested = Boolean(options?.negativeStockOverride);
    const negativeStockOverrideReason =
      options?.negativeStockOverrideReason && options.negativeStockOverrideReason.trim().length > 0
        ? options.negativeStockOverrideReason.trim()
        : undefined;

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "debit-notes.void",
      actorUserId,
    });
    const requestHash = voidKey
      ? hashRequestBody({
          debitNoteId,
          action: "VOID",
          negativeStockOverrideRequested,
          negativeStockOverrideReason: negativeStockOverrideReason ?? null,
        })
      : null;
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
      const debitNote = await this.debitNotesRepo.findForPosting(orgId, debitNoteId, tx);
      if (!debitNote) {
        throw new NotFoundException("Debit note not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "DEBIT_NOTE",
            sourceId: debitNote.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (debitNote.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Debit note is already voided");
        }
        return {
          debitNote,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (debitNote.status !== "POSTED") {
        throw new ConflictException("Only posted debit notes can be voided");
      }

      const allocationCount = await tx.debitNoteAllocation.count({
        where: { debitNoteId: debitNote.id },
      });
      if (allocationCount > 0) {
        throw new ConflictException("Cannot void a debit note with applied allocations");
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

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, debitNote.debitNoteDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "DEBIT_NOTE",
          entityId: debitNote.id,
          action: AuditAction.UPDATE,
          before: { status: debitNote.status, debitNoteDate: debitNote.debitNoteDate },
          after: {
            blockedAction: "void debit note",
            docDate: debitNote.debitNoteDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, debitNote.debitNoteDate, "void debit note");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this debit note");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void debit note ${debitNote.number ?? debitNote.id}`,
        reversalDate: new Date(),
      });

      const updatedDebitNote = await this.debitNotesRepo.update(
        debitNoteId,
        {
          status: "VOID",
          voidedAt: new Date(),
        },
        tx,
      );

      const itemIds = debitNote.lines.map((line) => line.itemId).filter(Boolean) as string[];
      const items = itemIds.length
        ? await tx.item.findMany({
            where: { orgId, id: { in: itemIds } },
            select: { id: true, trackInventory: true, type: true, unitOfMeasureId: true },
          })
        : [];
      const itemsById = new Map(items.map((item) => [item.id, item]));

      const priorMovements = await tx.inventoryMovement.findMany({
        where: { orgId, sourceType: "DEBIT_NOTE", sourceId: debitNote.id, unitCost: { not: null } },
        select: { sourceLineId: true, unitCost: true },
      });
      const unitCostByLineId = new Map(
        priorMovements
          .filter((movement) => movement.sourceLineId && movement.unitCost)
          .map((movement) => [movement.sourceLineId as string, movement.unitCost as Prisma.Decimal]),
      );

      const negativeStockCheck = await this.createInventoryMovements(tx, {
        orgId,
        debitNoteId: debitNote.id,
        lines: debitNote.lines,
        itemsById,
        sourceType: "DEBIT_NOTE_VOID",
        createdByUserId: actorUserId,
        effectiveAt: updatedDebitNote.voidedAt ?? new Date(),
        useEffectiveDateCutoff: getApiEnv().INVENTORY_COST_EFFECTIVE_DATE_ENABLED,
        reverse: false,
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
          entityType: "DEBIT_NOTE",
          entityId: debitNote.id,
          action: AuditAction.VOID,
          before: debitNote,
          after: negativeStockWarning
            ? {
                ...updatedDebitNote,
                negativeStockWarning,
              }
            : updatedDebitNote,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return {
        debitNote: {
          ...updatedDebitNote,
          vendor: debitNote.vendor,
          lines: debitNote.lines,
        },
        reversalHeader,
        ...(negativeStockWarning ? { warnings: { negativeStock: negativeStockWarning } } : {}),
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

  async applyDebitNote(
    orgId?: string,
    debitNoteId?: string,
    actorUserId?: string,
    input?: DebitNoteApplyInput,
    idempotencyKey?: string,
  ) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const applyKey = buildIdempotencyKey(idempotencyKey, {
      scope: "debit-notes.apply",
      actorUserId,
    });
    const requestHash = applyKey
      ? hashRequestBody({
          debitNoteId,
          allocations: input?.allocations ?? [],
        })
      : null;
    if (applyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: applyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const debitNote = await tx.debitNote.findFirst({
        where: { id: debitNoteId, orgId },
        include: { allocations: true },
      });
      if (!debitNote) {
        throw new NotFoundException("Debit note not found");
      }
      if (debitNote.status !== "POSTED") {
        throw new ConflictException("Only posted debit notes can be applied");
      }

      const allocationsByBill = this.normalizeAllocations(input?.allocations ?? []);
      if (allocationsByBill.size === 0) {
        throw new BadRequestException("No allocations provided");
      }

      const billIds = Array.from(allocationsByBill.keys());
      if (debitNote.billId && billIds.some((id) => id !== debitNote.billId)) {
        throw new BadRequestException("Debit note can only be applied to its linked bill");
      }

      const bills = await tx.bill.findMany({
        where: { id: { in: billIds }, orgId },
        select: { id: true, vendorId: true, status: true, total: true, amountPaid: true, currency: true },
      });
      if (bills.length !== billIds.length) {
        throw new NotFoundException("Bill not found");
      }

      for (const bill of bills) {
        if (bill.vendorId !== debitNote.vendorId) {
          throw new BadRequestException("Bill does not belong to debit note vendor");
        }
        if (bill.status !== "POSTED") {
          throw new BadRequestException("Only posted bills can be applied");
        }
        if (debitNote.currency && bill.currency !== debitNote.currency) {
          throw new BadRequestException("Debit note currency must match bill currency");
        }
      }

      const existingByBill = new Map(
        debitNote.allocations.map((allocation) => [allocation.billId, dec(allocation.amount)]),
      );
      const existingTotal = debitNote.allocations.reduce((sum, allocation) => dec(sum).add(allocation.amount), dec(0));
      const replaceTotal = billIds.reduce((sum, id) => dec(sum).add(existingByBill.get(id) ?? 0), dec(0));
      const nextAppliedTotal = round2(existingTotal.sub(replaceTotal).add(this.sumAllocations(allocationsByBill)));
      if (nextAppliedTotal.greaterThan(round2(debitNote.total))) {
        throw new BadRequestException("Debit note amount exceeded by allocations");
      }

      await Promise.all(
        bills.map((bill) => {
          const existingAlloc = existingByBill.get(bill.id) ?? dec(0);
          const desiredAlloc = allocationsByBill.get(bill.id) ?? dec(0);
          const delta = desiredAlloc.sub(existingAlloc);
          if (delta.equals(0)) {
            return null;
          }
          const total = round2(bill.total);
          const currentPaid = round2(bill.amountPaid ?? 0);
          const newPaid = round2(currentPaid.add(delta));
          if (newPaid.greaterThan(total)) {
            throw new BadRequestException("Allocation exceeds bill outstanding");
          }

          const paymentStatus = this.resolvePaymentStatus(total, newPaid);
          return tx.bill.update({
            where: { id: bill.id },
            data: { amountPaid: newPaid, paymentStatus },
          });
        }),
      );

      await tx.debitNoteAllocation.deleteMany({
        where: { debitNoteId: debitNote.id, billId: { in: billIds } },
      });

      const allocationRows = billIds
        .map((billId) => ({
          billId,
          amount: allocationsByBill.get(billId) ?? dec(0),
        }))
        .filter((allocation) => allocation.amount.greaterThan(0))
        .map((allocation) => ({
          orgId,
          debitNoteId: debitNote.id,
          billId: allocation.billId,
          amount: allocation.amount,
          createdByUserId: actorUserId,
        }));

      if (allocationRows.length > 0) {
        await tx.debitNoteAllocation.createMany({ data: allocationRows });
      }

      const allocations = await tx.debitNoteAllocation.findMany({
        where: { debitNoteId: debitNote.id },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "DEBIT_NOTE",
          entityId: debitNote.id,
          action: AuditAction.UPDATE,
          before: debitNote,
          after: { allocations },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return { debitNote, allocations };
    });

    if (applyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: applyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  async unapplyDebitNote(
    orgId?: string,
    debitNoteId?: string,
    actorUserId?: string,
    input?: DebitNoteUnapplyInput,
    idempotencyKey?: string,
  ) {
    if (!orgId || !debitNoteId) {
      throw new NotFoundException("Debit note not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const unapplyKey = buildIdempotencyKey(idempotencyKey, {
      scope: "debit-notes.unapply",
      actorUserId,
    });
    const requestHash = unapplyKey
      ? hashRequestBody({
          debitNoteId,
          billId: input?.billId ?? null,
        })
      : null;
    if (unapplyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: unapplyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const debitNote = await tx.debitNote.findFirst({
        where: { id: debitNoteId, orgId },
        include: { allocations: true },
      });
      if (!debitNote) {
        throw new NotFoundException("Debit note not found");
      }

      const allocationsToRemove = input?.billId
        ? debitNote.allocations.filter((allocation) => allocation.billId === input.billId)
        : debitNote.allocations;

      if (allocationsToRemove.length === 0) {
        return { debitNote, allocations: debitNote.allocations };
      }

      const billIds = allocationsToRemove.map((allocation) => allocation.billId);
      const bills = await tx.bill.findMany({
        where: { id: { in: billIds }, orgId },
        select: { id: true, total: true, amountPaid: true },
      });
      if (bills.length !== billIds.length) {
        throw new NotFoundException("Bill not found");
      }

      const allocationsByBill = new Map(
        allocationsToRemove.map((allocation) => [allocation.billId, dec(allocation.amount)]),
      );

      await Promise.all(
        bills.map((bill) => {
          const allocation = allocationsByBill.get(bill.id) ?? dec(0);
          if (!allocation.greaterThan(0)) {
            return null;
          }
          const total = round2(bill.total);
          const currentPaid = round2(bill.amountPaid ?? 0);
          let newPaid = round2(currentPaid.sub(allocation));
          if (newPaid.lessThan(0)) {
            newPaid = dec(0);
          }
          const paymentStatus = this.resolvePaymentStatus(total, newPaid);
          return tx.bill.update({
            where: { id: bill.id },
            data: { amountPaid: newPaid, paymentStatus },
          });
        }),
      );

      await tx.debitNoteAllocation.deleteMany({
        where: {
          debitNoteId: debitNote.id,
          billId: { in: billIds },
        },
      });

      const allocations = await tx.debitNoteAllocation.findMany({
        where: { debitNoteId: debitNote.id },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "DEBIT_NOTE",
          entityId: debitNote.id,
          action: AuditAction.UPDATE,
          before: debitNote,
          after: { allocations },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return { debitNote, allocations };
    });

    if (unapplyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: unapplyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  private async resolveDebitNoteRefs(
    orgId: string,
    lines: DebitNoteLineCreateInput[],
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
            inventoryAccountId: true,
            fixedAssetAccountId: true,
            defaultTaxCodeId: true,
            unitOfMeasureId: true,
            isActive: true,
            type: true,
            trackInventory: true,
          },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }
    if (items.some((item) => !item.isActive)) {
      throw new BadRequestException("Item must be active");
    }

    const defaultTaxIds = items.map((item) => item.defaultTaxCodeId).filter(Boolean) as string[];
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

    const itemAccountIds = items
      .flatMap((item) => [item.expenseAccountId, item.inventoryAccountId, item.fixedAssetAccountId])
      .filter((accountId): accountId is string => Boolean(accountId));
    const accountIds = Array.from(new Set([...expenseAccountIds, ...itemAccountIds]));
    const accounts = accountIds.length
      ? await client.account.findMany({
          where: { orgId, id: { in: accountIds }, isActive: true },
          select: { id: true, type: true, isActive: true },
        })
      : [];
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException("Account is missing or inactive");
    }

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
      accountsById: new Map(accounts.map((account) => [account.id, account])),
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

  private resolveLineExpenseAccount(
    line: { itemId?: string | null; expenseAccountId?: string | null },
    itemsById: Map<
      string,
      {
        id: string;
        type: string;
        expenseAccountId: string | null;
        inventoryAccountId: string | null;
        fixedAssetAccountId: string | null;
      }
    >,
  ) {
    if (line.expenseAccountId) {
      return line.expenseAccountId;
    }
    if (!line.itemId) {
      throw new BadRequestException("Expense account is required");
    }
    const item = itemsById.get(line.itemId);
    if (!item) {
      throw new NotFoundException("Item not found");
    }

    if (item.type === "INVENTORY") {
      if (!item.inventoryAccountId) {
        throw new BadRequestException("Inventory account is required for inventory items");
      }
      return item.inventoryAccountId;
    }
    if (item.type === "FIXED_ASSET") {
      if (!item.fixedAssetAccountId) {
        throw new BadRequestException("Fixed asset account is required for fixed asset items");
      }
      return item.fixedAssetAccountId;
    }
    if (item.type === "NON_INVENTORY_EXPENSE") {
      if (!item.expenseAccountId) {
        throw new BadRequestException("Expense account is required for non-inventory expense items");
      }
      return item.expenseAccountId;
    }
    if (item.expenseAccountId) {
      return item.expenseAccountId;
    }
    throw new BadRequestException("Expense account is required");
  }

  private validateDebitNoteLineAccounts(params: {
    lines: Array<{ itemId?: string | null; expenseAccountId: string }>;
    itemsById: Map<
      string,
      {
        id: string;
        type: string;
        expenseAccountId: string | null;
        inventoryAccountId: string | null;
        fixedAssetAccountId: string | null;
      }
    >;
    accountsById: Map<string, { id: string; type: string }>;
  }) {
    for (const line of params.lines) {
      const account = params.accountsById.get(line.expenseAccountId);
      if (!account) {
        throw new BadRequestException("Expense account is missing or inactive");
      }
      if (!line.itemId) {
        if (account.type !== "EXPENSE") {
          throw new BadRequestException("Expense account must be EXPENSE type");
        }
        continue;
      }
      const item = params.itemsById.get(line.itemId);
      if (!item) {
        throw new NotFoundException("Item not found");
      }

      if (item.type === "INVENTORY") {
        if (!item.inventoryAccountId) {
          throw new BadRequestException("Inventory account is required for inventory items");
        }
        if (line.expenseAccountId !== item.inventoryAccountId) {
          throw new BadRequestException("Inventory lines must use the item's inventory asset account");
        }
        if (account.type !== "ASSET") {
          throw new BadRequestException("Inventory account must be ASSET type");
        }
      } else if (item.type === "FIXED_ASSET") {
        if (!item.fixedAssetAccountId) {
          throw new BadRequestException("Fixed asset account is required for fixed asset items");
        }
        if (line.expenseAccountId !== item.fixedAssetAccountId) {
          throw new BadRequestException("Fixed asset lines must use the item's fixed asset account");
        }
        if (account.type !== "ASSET") {
          throw new BadRequestException("Fixed asset account must be ASSET type");
        }
      } else if (item.type === "NON_INVENTORY_EXPENSE") {
        if (!item.expenseAccountId) {
          throw new BadRequestException("Expense account is required for non-inventory expense items");
        }
        if (line.expenseAccountId !== item.expenseAccountId) {
          throw new BadRequestException("Expense lines must use the item's expense account");
        }
        if (account.type !== "EXPENSE") {
          throw new BadRequestException("Expense account must be EXPENSE type");
        }
      } else {
        if (account.type !== "EXPENSE") {
          throw new BadRequestException("Service lines must use an EXPENSE account");
        }
      }
    }
  }

  private async createInventoryMovements(
    tx: Prisma.TransactionClient,
    params: {
      orgId: string;
      debitNoteId: string;
      lines: Array<{
        id: string;
        itemId: string | null;
        qty: Prisma.Decimal;
        unitOfMeasureId: string | null;
        lineSubTotal?: Prisma.Decimal;
      }>;
      itemsById: Map<string, { id: string; trackInventory: boolean; type: string; unitOfMeasureId: string | null }>;
      sourceType: InventorySourceType;
      createdByUserId: string;
      effectiveAt: Date;
      useEffectiveDateCutoff?: boolean;
      reverse?: boolean;
      includeUnitCost?: boolean;
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
      const qtyBase = roundInventoryQty(dec(line.qty).mul(conversion));
      if (qtyBase.equals(0)) {
        continue;
      }
      const direction = params.reverse ? dec(0).sub(qtyBase) : qtyBase;
      let unitCost = params.unitCostByLineId?.get(line.id);
      if (!unitCost && params.includeUnitCost) {
        unitCost = deriveBillMovementUnitCost({
          lineSubTotal: line.lineSubTotal ?? 0,
          qtyBase,
        });
      }
      movements.push({
        orgId: params.orgId,
        itemId: item.id,
        quantity: direction,
        unitCost,
        sourceType: params.sourceType,
        sourceId: params.debitNoteId,
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

  private normalizeAllocations(allocations: Array<{ billId: string; amount: MoneyValue }>) {
    const allocationMap = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      const amount = round2(allocation.amount);
      if (!amount.greaterThan(0)) {
        continue;
      }
      const current = allocationMap.get(allocation.billId) ?? dec(0);
      allocationMap.set(allocation.billId, round2(dec(current).add(amount)));
    }
    return allocationMap;
  }

  private sumAllocations(map: Map<string, Prisma.Decimal>) {
    let total = dec(0);
    for (const amount of map.values()) {
      total = round2(dec(total).add(amount));
    }
    return total;
  }

  private resolvePaymentStatus(total: Prisma.Decimal, paid: Prisma.Decimal) {
    if (!paid.greaterThan(0)) {
      return "UNPAID";
    }
    if (paid.lessThan(total)) {
      return "PARTIAL";
    }
    return "PAID";
  }
}
