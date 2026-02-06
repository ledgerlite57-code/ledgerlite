import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InventorySourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { applyNumberingUpdate, nextNumbering, resolveNumberingFormats } from "../../common/numbering";
import { buildBillPostingLines, calculateBillLines } from "../../bills.utils";
import { dec, gt } from "../../common/money";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";
import {
  type BillCreateInput,
  type BillLineCreateInput,
  type BillUpdateInput,
  type PaginationInput,
} from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { BillsRepository } from "./bills.repo";

type BillRecord = Prisma.BillGetPayload<{
  include: {
    vendor: true;
    lines: { include: { item: true; taxCode: true; expenseAccount: true } };
  };
}>;
type BillListParams = PaginationInput & {
  status?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

export const roundInventoryQty = (value: Prisma.Decimal.Value) => dec(value).toDecimalPlaces(4);
export const roundUnitCost = (value: Prisma.Decimal.Value) => dec(value).toDecimalPlaces(6);

export const deriveBillMovementUnitCost = (params: {
  lineSubTotal: Prisma.Decimal.Value;
  qtyBase: Prisma.Decimal.Value;
}) => {
  const baseQty = roundInventoryQty(dec(params.qtyBase).abs());
  if (baseQty.equals(0)) {
    return undefined;
  }
  return roundUnitCost(dec(params.lineSubTotal).div(baseQty));
};

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billsRepo: BillsRepository,
  ) {}

  async listBills(orgId?: string, params?: BillListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const { data, total } = await this.billsRepo.list({
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

  async getBill(orgId?: string, billId?: string) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }

    const bill = await this.billsRepo.findForDetail(orgId, billId);
    if (!bill) {
      throw new NotFoundException("Bill not found");
    }
    return bill;
  }

  async createBill(orgId?: string, actorUserId?: string, input?: BillCreateInput, idempotencyKey?: string) {
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
      scope: "bills.create",
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
        return existingKey.response as unknown as BillRecord;
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

    const { itemsById, taxCodesById, expenseAccountsById, unitsById, baseUnitId } = await this.resolveBillRefs(
      orgId,
      input.lines,
      org.vatEnabled,
    );

    const vatBehavior = orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
    let calculated;
    try {
      calculated = calculateBillLines({
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
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid bill lines");
    }

    this.validateBillLineAccounts({
      lines: calculated.lines,
      itemsById,
      accountsById: expenseAccountsById,
    });

    const billDate = new Date(input.billDate);
    const dueDate = input.dueDate ? new Date(input.dueDate) : this.addDays(billDate, vendor.paymentTermsDays ?? 0);
    if (dueDate < billDate) {
      throw new BadRequestException("Due date cannot be before bill date");
    }

    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    const bill = await this.billsRepo.create({
      orgId,
      vendorId: vendor.id,
      status: "DRAFT",
      billDate,
      dueDate,
      currency,
      exchangeRate: input.exchangeRate ?? 1,
      billNumber: input.billNumber,
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
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BILL",
      entityId: bill.id,
      action: AuditAction.CREATE,
      after: bill,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: bill as unknown as object,
          statusCode: 201,
        },
      });
    }

    return bill;
  }

  async updateBill(orgId?: string, billId?: string, actorUserId?: string, input?: BillUpdateInput) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.billsRepo.findForUpdate(orgId, billId, tx);
      if (!existing) {
        throw new NotFoundException("Bill not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted bills cannot be edited");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const vendorId = input.vendorId ?? existing.vendorId;
      const vendor = await tx.vendor.findFirst({ where: { id: vendorId, orgId } });
      if (!vendor) {
        throw new NotFoundException("Vendor not found");
      }
      if (!vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }

      const billDate = input.billDate ? new Date(input.billDate) : existing.billDate;
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, billDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "BILL",
          entityId: billId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, billDate: existing.billDate },
          after: {
            blockedAction: "update bill",
            docDate: billDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, billDate, "update bill");
      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : input.billDate
          ? this.addDays(billDate, vendor.paymentTermsDays ?? 0)
          : existing.dueDate;
      if (dueDate < billDate) {
        throw new BadRequestException("Due date cannot be before bill date");
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
        const { itemsById, taxCodesById, expenseAccountsById, unitsById, baseUnitId } = await this.resolveBillRefs(
          orgId,
          input.lines,
          org.vatEnabled,
          tx,
        );
        const vatBehavior = org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE";
        let calculated;
        try {
          calculated = calculateBillLines({
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
          throw new BadRequestException(err instanceof Error ? err.message : "Invalid bill lines");
        }

        this.validateBillLineAccounts({
          lines: calculated.lines,
          itemsById,
          accountsById: expenseAccountsById,
        });

        totals = calculated;

        await this.billsRepo.deleteLines(billId, tx);
        await this.billsRepo.createLines(
          calculated.lines.map((line) => ({
            billId,
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
          tx,
        );
      }

      const updated = await this.billsRepo.update(
        billId,
        {
          vendorId,
          billDate,
          dueDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          billNumber: input.billNumber ?? existing.billNumber,
          reference: input.reference ?? existing.reference,
          notes: input.notes ?? existing.notes,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
        tx,
      );

      const after = await this.billsRepo.findForDetail(orgId, billId, tx);

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BILL",
      entityId: billId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postBill(orgId?: string, billId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "bills.post",
      actorUserId,
    });
    const requestHash = postKey ? hashRequestBody({ billId }) : null;
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

    let result: { bill: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const bill = await this.billsRepo.findForPosting(orgId, billId, tx);
        if (!bill) {
          throw new NotFoundException("Bill not found");
        }
        if (bill.status !== "DRAFT") {
          throw new ConflictException("Bill is already posted");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        ensureBaseCurrencyOnly(org.baseCurrency, bill.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, bill.billDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "BILL",
            entityId: bill.id,
            action: AuditAction.UPDATE,
            before: { status: bill.status, billDate: bill.billDate },
            after: {
              blockedAction: "post bill",
              docDate: bill.billDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, bill.billDate, "post bill");

        if (!org.vatEnabled && gt(bill.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const apAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AP", isActive: true },
        });
        if (!apAccount) {
          throw new BadRequestException("Accounts Payable account is not configured");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(bill.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_RECEIVABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Receivable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const expenseAccountIds = Array.from(new Set(bill.lines.map((line) => line.expenseAccountId)));
        const expenseAccounts = expenseAccountIds.length
          ? await tx.account.findMany({
              where: { orgId, id: { in: expenseAccountIds }, isActive: true },
              select: { id: true, type: true, isActive: true },
            })
          : [];
        if (expenseAccounts.length !== expenseAccountIds.length) {
          throw new BadRequestException("Expense account is missing or inactive");
        }

        const itemIds = bill.lines.map((line) => line.itemId).filter(Boolean) as string[];
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
        const accountsById = new Map(expenseAccounts.map((account) => [account.id, account]));
        this.validateBillLineAccounts({
          lines: bill.lines,
          itemsById,
          accountsById,
        });

        const formats = resolveNumberingFormats(org.orgSettings);
        const { assignedNumber, nextFormats } = nextNumbering(formats, "bill");
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
          posting = buildBillPostingLines({
            billNumber: bill.systemNumber ?? assignedNumber,
            vendorId: bill.vendorId,
            total: bill.total,
            lines: bill.lines.map((line) => ({
              expenseAccountId: line.expenseAccountId,
              lineSubTotal: line.lineSubTotal,
              lineTax: line.lineTax,
              taxCodeId: line.taxCodeId ?? undefined,
            })),
            apAccountId: apAccount.id,
            vatAccountId,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post bill");
        }

        assertGlLinesValid(posting.lines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Bill posting");

        const updatedBill = await this.billsRepo.update(
          billId,
          {
            status: "POSTED",
            systemNumber: bill.systemNumber ?? assignedNumber,
            postedAt: new Date(),
          },
          tx,
        );

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "BILL",
            sourceId: bill.id,
            postingDate: updatedBill.billDate,
            currency: bill.currency,
            exchangeRate: bill.exchangeRate,
            totalDebit: posting.totalDebit,
            totalCredit: posting.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Bill ${updatedBill.systemNumber ?? assignedNumber}`,
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

        await this.createInventoryMovements(tx, {
          orgId,
          sourceId: bill.id,
          lines: bill.lines,
          itemsById,
          sourceType: "BILL",
          createdByUserId: actorUserId,
          effectiveAt: updatedBill.billDate,
          includeUnitCost: true,
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "BILL",
            entityId: bill.id,
            action: AuditAction.POST,
            before: bill,
            after: updatedBill,
            requestId: RequestContext.get()?.requestId,
            ip: RequestContext.get()?.ip,
            userAgent: RequestContext.get()?.userAgent,
          },
        });

        const response = {
          bill: {
            ...updatedBill,
            vendor: bill.vendor,
            lines: bill.lines,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Bill is already posted");
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

  async voidBill(orgId?: string, billId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "bills.void",
      actorUserId,
    });
    const requestHash = voidKey ? hashRequestBody({ billId, action: "VOID" }) : null;
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
      const bill = await this.billsRepo.findForPosting(orgId, billId, tx);
      if (!bill) {
        throw new NotFoundException("Bill not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "BILL",
            sourceId: bill.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (bill.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Bill is already voided");
        }
        return {
          bill,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (bill.status !== "POSTED") {
        throw new ConflictException("Only posted bills can be voided");
      }

      if (gt(bill.amountPaid ?? 0, 0)) {
        throw new ConflictException("Cannot void a bill that has been paid");
      }

      const allocationCount = await tx.vendorPaymentAllocation.count({
        where: { billId: bill.id, vendorPayment: { status: "POSTED" } },
      });
      if (allocationCount > 0) {
        throw new ConflictException("Cannot void a bill that has been paid");
      }

      const debitAllocationCount = await tx.debitNoteAllocation.count({
        where: { billId: bill.id, debitNote: { status: "POSTED" } },
      });
      if (debitAllocationCount > 0) {
        throw new ConflictException("Cannot void a bill with applied purchase returns");
      }

      const debitNoteCount = await tx.debitNote.count({
        where: { billId: bill.id, status: "POSTED" },
      });
      if (debitNoteCount > 0) {
        throw new ConflictException("Cannot void a bill with posted purchase returns");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, bill.billDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "BILL",
          entityId: bill.id,
          action: AuditAction.UPDATE,
          before: { status: bill.status, billDate: bill.billDate },
          after: {
            blockedAction: "void bill",
            docDate: bill.billDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, bill.billDate, "void bill");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this bill");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void bill ${bill.systemNumber ?? bill.billNumber ?? bill.id}`,
        reversalDate: new Date(),
      });

      const updatedBill = await this.billsRepo.update(
        billId,
        {
          status: "VOID",
        },
        tx,
      );

      const itemIds = bill.lines.map((line) => line.itemId).filter(Boolean) as string[];
      const items = itemIds.length
        ? await tx.item.findMany({
            where: { orgId, id: { in: itemIds } },
            select: { id: true, trackInventory: true, type: true, unitOfMeasureId: true },
          })
        : [];
      const itemsById = new Map(items.map((item) => [item.id, item]));

      await this.createInventoryMovements(tx, {
        orgId,
        sourceId: bill.id,
        lines: bill.lines,
        itemsById,
        sourceType: "BILL_VOID",
        createdByUserId: actorUserId,
        effectiveAt: new Date(),
        reverse: true,
        includeUnitCost: true,
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "BILL",
          entityId: bill.id,
          action: AuditAction.VOID,
          before: bill,
          after: updatedBill,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return {
        bill: {
          ...updatedBill,
          vendor: bill.vendor,
          lines: bill.lines,
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

  private async resolveBillRefs(
    orgId: string,
    lines: BillLineCreateInput[],
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
          },
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
          select: { id: true, type: true, isActive: true },
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
      expenseAccountsById: new Map(expenseAccounts.map((account) => [account.id, account])),
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

  private validateBillLineAccounts(params: {
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
      sourceId: string;
      lines: Array<{
        id: string;
        itemId: string | null;
        qty: Prisma.Decimal;
        unitOfMeasureId: string | null;
        lineSubTotal: Prisma.Decimal;
      }>;
      itemsById: Map<string, { id: string; trackInventory: boolean; type: string; unitOfMeasureId: string | null }>;
      sourceType: InventorySourceType;
      createdByUserId: string;
      effectiveAt: Date;
      reverse?: boolean;
      includeUnitCost?: boolean;
    },
  ) {
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
      // Align quantity math with InventoryMovement Decimal(18,4) storage precision.
      const qtyBase = roundInventoryQty(dec(line.qty).mul(conversion));
      if (qtyBase.equals(0)) {
        continue;
      }
      const direction = params.reverse ? dec(0).sub(qtyBase) : qtyBase;

      let unitCost: Prisma.Decimal | undefined;
      if (params.includeUnitCost) {
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
        sourceId: params.sourceId,
        sourceLineId: line.id,
        createdByUserId: params.createdByUserId,
        effectiveAt: params.effectiveAt,
      });
    }

    if (movements.length > 0) {
      await tx.inventoryMovement.createMany({ data: movements });
    }
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
