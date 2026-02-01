import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InventorySourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { calculateInvoiceLines } from "../../invoices.utils";
import { buildCreditNotePostingLines } from "../../credit-notes.utils";
import { dec, gt } from "../../common/money";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { assertMoneyEq } from "../../common/money-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";
import {
  type InventoryCostItem,
  type InventoryPostingLine,
  buildInventoryCostPostingLines,
  resolveInventoryCostLines,
} from "../../common/inventory-cost";
import {
  type CreditNoteCreateInput,
  type CreditNoteUpdateInput,
  type CreditNoteLineCreateInput,
  type PaginationInput,
} from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { CreditNotesRepository } from "./credit-notes.repo";

type CreditNoteRecord = Prisma.CreditNoteGetPayload<{
  include: {
    customer: true;
    lines: { include: { item: true; taxCode: true } };
  };
}>;

type CreditNoteListParams = PaginationInput & {
  status?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly creditNotesRepo: CreditNotesRepository,
  ) {}

  async listCreditNotes(orgId?: string, params?: CreditNoteListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const { data, total } = await this.creditNotesRepo.list({
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

  async getCreditNote(orgId?: string, creditNoteId?: string) {
    if (!orgId || !creditNoteId) {
      throw new NotFoundException("Credit note not found");
    }
    const creditNote = await this.creditNotesRepo.findForDetail(orgId, creditNoteId);
    if (!creditNote) {
      throw new NotFoundException("Credit note not found");
    }
    return creditNote;
  }

  async createCreditNote(
    orgId?: string,
    actorUserId?: string,
    input?: CreditNoteCreateInput,
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
      scope: "credit-notes.create",
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
        return existingKey.response as unknown as CreditNoteRecord;
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

    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: input.invoiceId, orgId } });
      if (!invoice) {
        throw new NotFoundException("Invoice not found");
      }
    }

    const { itemsById, taxCodesById, unitsById, baseUnitId } = await this.resolveCreditNoteRefs(
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
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid credit note lines");
    }

    const creditNoteDate = new Date(input.creditNoteDate);
    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    const creditNote = await this.creditNotesRepo.create({
      orgId,
      customerId: customer.id,
      invoiceId: input.invoiceId ?? null,
      status: "DRAFT",
      creditNoteDate,
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
      entityType: "CREDIT_NOTE",
      entityId: creditNote.id,
      action: AuditAction.CREATE,
      after: creditNote,
    });

    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: creditNote as unknown as object,
          statusCode: 201,
        },
      });
    }

    return creditNote;
  }

  async updateCreditNote(orgId?: string, creditNoteId?: string, actorUserId?: string, input?: CreditNoteUpdateInput) {
    if (!orgId || !creditNoteId) {
      throw new NotFoundException("Credit note not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.creditNotesRepo.findForUpdate(orgId, creditNoteId, tx);
      if (!existing) {
        throw new NotFoundException("Credit note not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted credit notes cannot be edited");
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

      if (input.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, orgId } });
        if (!invoice) {
          throw new NotFoundException("Invoice not found");
        }
      }

      const creditNoteDate = input.creditNoteDate ? new Date(input.creditNoteDate) : existing.creditNoteDate;
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, creditNoteDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "CREDIT_NOTE",
          entityId: creditNoteId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, creditNoteDate: existing.creditNoteDate },
          after: {
            blockedAction: "update credit note",
            docDate: creditNoteDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, creditNoteDate, "update credit note");

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
        const { itemsById, taxCodesById, unitsById, baseUnitId } = await this.resolveCreditNoteRefs(
          orgId,
          input.lines,
          org.vatEnabled,
          tx,
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
          throw new BadRequestException(err instanceof Error ? err.message : "Invalid credit note lines");
        }
        totals = calculated;

        await this.creditNotesRepo.deleteLines(creditNoteId, tx);
        await this.creditNotesRepo.createLines(
          calculated.lines.map((line) => ({
            creditNoteId,
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

      const updated = await this.creditNotesRepo.update(
        creditNoteId,
        {
          customerId,
          invoiceId: input.invoiceId ?? existing.invoiceId ?? null,
          creditNoteDate,
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

      const after = await this.creditNotesRepo.findForDetail(orgId, creditNoteId, tx);

      return {
        before: existing,
        after: after ?? updated,
      };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "CREDIT_NOTE",
      entityId: creditNoteId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postCreditNote(orgId?: string, creditNoteId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !creditNoteId) {
      throw new NotFoundException("Credit note not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "credit-notes.post",
      actorUserId,
    });
    const requestHash = postKey ? hashRequestBody({ creditNoteId }) : null;
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

    let result: { creditNote: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const creditNote = await this.creditNotesRepo.findForPosting(orgId, creditNoteId, tx);
        if (!creditNote) {
          throw new NotFoundException("Credit note not found");
        }
        if (creditNote.status !== "DRAFT") {
          throw new ConflictException("Credit note is already posted");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        ensureBaseCurrencyOnly(org.baseCurrency, creditNote.currency);
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, creditNote.creditNoteDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "CREDIT_NOTE",
            entityId: creditNote.id,
            action: AuditAction.UPDATE,
            before: { status: creditNote.status, creditNoteDate: creditNote.creditNoteDate },
            after: {
              blockedAction: "post credit note",
              docDate: creditNote.creditNoteDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, creditNote.creditNoteDate, "post credit note");

        if (!org.vatEnabled && gt(creditNote.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const arAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AR", isActive: true },
        });
        if (!arAccount) {
          throw new BadRequestException("Accounts Receivable account is not configured");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(creditNote.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_PAYABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Payable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const itemIds = creditNote.lines.map((line) => line.itemId).filter(Boolean) as string[];
        const items = itemIds.length
          ? await tx.item.findMany({
              where: { orgId, id: { in: itemIds } },
              select: {
                id: true,
                incomeAccountId: true,
                expenseAccountId: true,
                purchasePrice: true,
                trackInventory: true,
                type: true,
                unitOfMeasureId: true,
              },
            })
          : [];

        const itemsById = new Map(items.map((item) => [item.id, item]));

        const lineIncomeAccountIds = creditNote.lines
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

        const assignedNumber = creditNote.number ?? `CRN-${Date.now()}`;

        let posting;
        let inventoryPosting: {
          lines: InventoryPostingLine[];
          totalDebit: Prisma.Decimal;
          totalCredit: Prisma.Decimal;
        } = { lines: [], totalDebit: dec(0), totalCredit: dec(0) };
        let unitCostByLineId: Map<string, Prisma.Decimal> | undefined;
        try {
          posting = buildCreditNotePostingLines({
            creditNoteNumber: assignedNumber,
            customerId: creditNote.customerId,
            total: creditNote.total,
            lines: creditNote.lines.map((line) => ({
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
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post credit note");
        }

        const inventoryItems = items.filter((item) => item.trackInventory && item.type === "PRODUCT");
        if (inventoryItems.length > 0) {
          const defaultInventoryAccountId =
            org.orgSettings?.defaultInventoryAccountId ??
            (await tx.account.findFirst({ where: { orgId, code: "1400" }, select: { id: true } }))?.id ??
            null;
          const inventoryAccount = defaultInventoryAccountId
            ? await tx.account.findFirst({ where: { orgId, id: defaultInventoryAccountId, isActive: true } })
            : null;
          if (!inventoryAccount) {
            throw new BadRequestException("Inventory account is not configured");
          }
          if (inventoryAccount.type !== "ASSET") {
            throw new BadRequestException("Inventory account must be ASSET type");
          }

          const cogsAccountIds = Array.from(new Set(inventoryItems.map((item) => item.expenseAccountId)));
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
            lines: creditNote.lines.map((line) => ({
              id: line.id,
              itemId: line.itemId,
              qty: line.qty,
              unitOfMeasureId: line.unitOfMeasureId,
            })),
            itemsById: itemsById as Map<string, InventoryCostItem>,
          });
          unitCostByLineId = costResolution.unitCostByLineId;
          inventoryPosting = buildInventoryCostPostingLines({
            costLines: costResolution.costLines,
            inventoryAccountId: inventoryAccount.id,
            description: assignedNumber ? `COGS Credit note ${assignedNumber}` : "COGS Credit note",
            customerId: creditNote.customerId,
            direction: "RETURN",
            startingLineNo: posting.lines.length + 1,
          });
        }

        const combinedLines = [...posting.lines, ...inventoryPosting.lines];
        const combinedTotals = assertGlLinesValid(combinedLines);
        assertMoneyEq(posting.totalDebit, posting.totalCredit, "Credit note posting");

        const updatedCreditNote = await this.creditNotesRepo.update(
          creditNoteId,
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
            sourceType: "CREDIT_NOTE",
            sourceId: creditNote.id,
            postingDate: updatedCreditNote.creditNoteDate,
            currency: creditNote.currency,
            exchangeRate: creditNote.exchangeRate,
            totalDebit: combinedTotals.totalDebit,
            totalCredit: combinedTotals.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Credit note ${updatedCreditNote.number ?? assignedNumber}`,
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

        await this.createInventoryMovements(tx, {
          orgId,
          creditNoteId: creditNote.id,
          lines: creditNote.lines,
          itemsById,
          sourceType: "CREDIT_NOTE",
          createdByUserId: actorUserId,
          unitCostByLineId,
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "CREDIT_NOTE",
            entityId: creditNote.id,
            action: AuditAction.POST,
            before: creditNote,
            after: updatedCreditNote,
            requestId: RequestContext.get()?.requestId,
            ip: RequestContext.get()?.ip,
            userAgent: RequestContext.get()?.userAgent,
          },
        });

        return {
          creditNote: {
            ...updatedCreditNote,
            lines: creditNote.lines,
            customer: creditNote.customer,
          },
          glHeader,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Credit note is already posted");
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

  async voidCreditNote(orgId?: string, creditNoteId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !creditNoteId) {
      throw new NotFoundException("Credit note not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const voidKey = buildIdempotencyKey(idempotencyKey, {
      scope: "credit-notes.void",
      actorUserId,
    });
    const requestHash = voidKey ? hashRequestBody({ creditNoteId, action: "VOID" }) : null;
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
      const creditNote = await this.creditNotesRepo.findForPosting(orgId, creditNoteId, tx);
      if (!creditNote) {
        throw new NotFoundException("Credit note not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "CREDIT_NOTE",
            sourceId: creditNote.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (creditNote.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Credit note is already voided");
        }
        return {
          creditNote,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (creditNote.status !== "POSTED") {
        throw new ConflictException("Only posted credit notes can be voided");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, creditNote.creditNoteDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "CREDIT_NOTE",
          entityId: creditNote.id,
          action: AuditAction.UPDATE,
          before: { status: creditNote.status, creditNoteDate: creditNote.creditNoteDate },
          after: {
            blockedAction: "void credit note",
            docDate: creditNote.creditNoteDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, creditNote.creditNoteDate, "void credit note");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this credit note");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void credit note ${creditNote.number ?? creditNote.id}`,
        reversalDate: new Date(),
      });

      const updatedCreditNote = await this.creditNotesRepo.update(
        creditNoteId,
        {
          status: "VOID",
          voidedAt: new Date(),
        },
        tx,
      );

      const itemIds = creditNote.lines.map((line) => line.itemId).filter(Boolean) as string[];
      const items = itemIds.length
        ? await tx.item.findMany({
            where: { orgId, id: { in: itemIds } },
            select: { id: true, trackInventory: true, type: true, unitOfMeasureId: true },
          })
        : [];
      const itemsById = new Map(items.map((item) => [item.id, item]));

      const priorMovements = await tx.inventoryMovement.findMany({
        where: { orgId, sourceType: "CREDIT_NOTE", sourceId: creditNote.id, unitCost: { not: null } },
        select: { sourceLineId: true, unitCost: true },
      });
      const unitCostByLineId = new Map(
        priorMovements
          .filter((movement) => movement.sourceLineId && movement.unitCost)
          .map((movement) => [movement.sourceLineId as string, movement.unitCost as Prisma.Decimal]),
      );

      await this.createInventoryMovements(tx, {
        orgId,
        creditNoteId: creditNote.id,
        lines: creditNote.lines,
        itemsById,
        sourceType: "CREDIT_NOTE_VOID",
        createdByUserId: actorUserId,
        reverse: true,
        unitCostByLineId,
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "CREDIT_NOTE",
          entityId: creditNote.id,
          action: AuditAction.VOID,
          before: creditNote,
          after: updatedCreditNote,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return {
        creditNote: {
          ...updatedCreditNote,
          customer: creditNote.customer,
          lines: creditNote.lines,
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

  private async resolveCreditNoteRefs(
    orgId: string,
    lines: CreditNoteLineCreateInput[],
    vatEnabled: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const unitIds = Array.from(new Set(lines.map((line) => line.unitOfMeasureId).filter(Boolean))) as string[];
    const incomeAccountIds = Array.from(
      new Set(lines.map((line) => line.incomeAccountId).filter(Boolean)),
    ) as string[];
    const client = tx ?? this.prisma;

    const items = itemIds.length
      ? await client.item.findMany({
          where: { orgId, id: { in: itemIds } },
          select: { id: true, incomeAccountId: true, defaultTaxCodeId: true, unitOfMeasureId: true, isActive: true },
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

    if (incomeAccountIds.length > 0) {
      const incomeAccounts = await client.account.findMany({
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
      creditNoteId: string;
      lines: Array<{
        id: string;
        itemId: string | null;
        qty: Prisma.Decimal;
        unitOfMeasureId: string | null;
      }>;
      itemsById: Map<string, { id: string; trackInventory: boolean; type: string; unitOfMeasureId: string | null }>;
      sourceType: InventorySourceType;
      createdByUserId: string;
      reverse?: boolean;
      unitCostByLineId?: Map<string, Prisma.Decimal>;
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
      if (!item || !item.trackInventory || item.type !== "PRODUCT") {
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
        sourceId: params.creditNoteId,
        sourceLineId: line.id,
        createdByUserId: params.createdByUserId,
      });
    }

    if (movements.length > 0) {
      await tx.inventoryMovement.createMany({ data: movements });
    }
  }
}
