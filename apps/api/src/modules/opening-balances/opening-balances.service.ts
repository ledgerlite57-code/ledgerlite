import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountSubtype, AuditAction, Prisma } from "@prisma/client";
import {
  ErrorCodes,
  type OpeningBalancesCutOverInput,
  type OpeningBalancesDraftInput,
  type OpeningBalancesImportCsvInput,
  type OpeningInventoryDraftInput,
} from "@ledgerlite/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { RequestContext } from "../../logging/request-context";
import { assertGlHeaderSourceUnique, assertGlLinesValid } from "../../common/gl-invariants";
import { dec, round2, toString2, type MoneyValue } from "../../common/money";
import { ensureNotLocked } from "../../common/lock-date";

const CONTROL_SUBTYPES = new Set<AccountSubtype>([AccountSubtype.AR, AccountSubtype.AP]);
const OPENING_BALANCE_SOURCE_ID = (orgId: string) => `OPENING_BALANCE:${orgId}`;

type DraftLineInput = { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal };
type InventoryDraftInput = { itemId: string; qty: Prisma.Decimal; unitCost: Prisma.Decimal };

type PreviewLine = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
  description?: string | null;
};

type PreviewAdjustment = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
  description?: string | null;
} | null;

type ValidationNotice = {
  level: "warning" | "error";
  message: string;
};

@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getStatus(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        baseCurrency: true,
        cutOverDate: true,
        openingBalancesStatus: true,
        openingBalancesPostedAt: true,
        openingBalancesPostedBy: { select: { id: true, email: true } },
        openingBalanceDraftBatch: {
          select: {
            lines: true,
            inventoryLines: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    return {
      status: org.openingBalancesStatus,
      baseCurrency: org.baseCurrency,
      cutOverDate: org.cutOverDate?.toISOString() ?? null,
      postedAt: org.openingBalancesPostedAt?.toISOString() ?? null,
      postedBy: org.openingBalancesPostedBy,
      draft: {
        lines: org.openingBalanceDraftBatch?.lines ?? [],
        inventoryLines: org.openingBalanceDraftBatch?.inventoryLines ?? [],
      },
    };
  }

  async setCutOverDate(orgId?: string, actorUserId?: string, input?: OpeningBalancesCutOverInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const cutOverDate = new Date(input.cutOverDate);
    if (Number.isNaN(cutOverDate.getTime())) {
      throw new BadRequestException("Cut-over date is invalid");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: { openingBalancesStatus: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }

      const updatedOrg = await tx.organization.update({
        where: { id: orgId },
        data: {
          cutOverDate,
          openingBalancesStatus: "DRAFT",
        },
      });

      await tx.openingBalanceDraftBatch.upsert({
        where: { orgId },
        create: {
          orgId,
          cutOverDate,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        update: {
          cutOverDate,
          updatedByUserId: actorUserId,
        },
      });

      return updatedOrg;
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "OPENING_BALANCE",
      entityId: orgId,
      action: AuditAction.UPDATE,
      after: { cutOverDate: result.cutOverDate?.toISOString() ?? null, status: result.openingBalancesStatus },
    });

    return {
      status: result.openingBalancesStatus,
      cutOverDate: result.cutOverDate?.toISOString() ?? null,
    };
  }

  async upsertDraftLines(orgId?: string, actorUserId?: string, input?: OpeningBalancesDraftInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const normalized = this.normalizeDraftLines(input.lines ?? []);
    await this.assertAccountsAllowed(orgId, normalized.map((line) => line.accountId));

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: { openingBalancesStatus: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }

      const batch = await tx.openingBalanceDraftBatch.upsert({
        where: { orgId },
        create: {
          orgId,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        update: {
          updatedByUserId: actorUserId,
        },
      });

      await tx.openingBalanceDraftLine.deleteMany({
        where: { batchId: batch.id },
      });

      if (normalized.length > 0) {
        await tx.openingBalanceDraftLine.createMany({
          data: normalized.map((line) => ({
            batchId: batch.id,
            orgId,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
          })),
        });
      }

      await tx.organization.update({
        where: { id: orgId },
        data: { openingBalancesStatus: "DRAFT" },
      });

      return {
        count: normalized.length,
      };
    });

    return result;
  }
  async importCsvAccounts(orgId?: string, actorUserId?: string, input?: OpeningBalancesImportCsvInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const rows = parseCsv(input.csv, input.delimiter);
    if (rows.length === 0) {
      throw new BadRequestException("CSV content is empty");
    }

    const { lines, skipped } = this.extractCsvDraftLines(rows);
    if (lines.length === 0) {
      return { imported: 0, skipped };
    }

    const accountCodes = Array.from(new Set(lines.map((line) => line.accountCode)));

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: { openingBalancesStatus: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }

      const accounts = await tx.account.findMany({
        where: { orgId, code: { in: accountCodes } },
        select: { id: true, code: true, subtype: true },
      });
      const accountMap = new Map(accounts.map((account) => [account.code, account]));
      const missing = accountCodes.filter((code) => !accountMap.has(code));
      if (missing.length > 0) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Some account codes were not found",
          hint: "Verify the chart of accounts codes and try again.",
          details: { missing },
        });
      }

      const invalidAccounts = accounts.filter((account) => account.subtype && CONTROL_SUBTYPES.has(account.subtype));
      if (invalidAccounts.length > 0) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: "AR/AP control accounts cannot be imported",
          hint: "Remove AR/AP accounts from the opening balance import.",
          details: { accounts: invalidAccounts.map((account) => account.code) },
        });
      }

      const normalized = this.normalizeDraftLines(
        lines.map((line) => ({
          accountId: accountMap.get(line.accountCode)!.id,
          debit: line.debit,
          credit: line.credit,
        })),
      );

      const batch = await tx.openingBalanceDraftBatch.upsert({
        where: { orgId },
        create: {
          orgId,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        update: {
          updatedByUserId: actorUserId,
        },
      });

      await tx.openingBalanceDraftLine.deleteMany({
        where: { batchId: batch.id },
      });

      if (normalized.length > 0) {
        await tx.openingBalanceDraftLine.createMany({
          data: normalized.map((line) => ({
            batchId: batch.id,
            orgId,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
          })),
        });
      }

      await tx.organization.update({
        where: { id: orgId },
        data: { openingBalancesStatus: "DRAFT" },
      });

      return { imported: normalized.length, skipped };
    });

    return result;
  }

  async upsertInventoryDraft(orgId?: string, actorUserId?: string, input?: OpeningInventoryDraftInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const normalized = this.normalizeInventoryLines(input.lines ?? []);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: { openingBalancesStatus: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }

      if (normalized.length > 0) {
        const items = await tx.item.findMany({
          where: { orgId, id: { in: normalized.map((line) => line.itemId) } },
          select: { id: true, type: true, isActive: true },
        });
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const missingItems = normalized.filter((line) => !itemMap.has(line.itemId));
        if (missingItems.length > 0) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Some inventory items were not found",
            hint: "Remove missing items and try again.",
          });
        }
        const inactiveItems = items.filter((item) => !item.isActive);
        if (inactiveItems.length > 0) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Inactive items cannot be included",
            hint: "Remove inactive items from the opening inventory list.",
          });
        }
        const nonInventory = items.filter((item) => item.type !== "INVENTORY");
        if (nonInventory.length > 0) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Only inventory items can be included",
            hint: "Remove non-inventory items from the opening inventory list.",
          });
        }
      }

      const batch = await tx.openingBalanceDraftBatch.upsert({
        where: { orgId },
        create: {
          orgId,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        update: {
          updatedByUserId: actorUserId,
        },
      });

      await tx.openingInventoryDraftLine.deleteMany({
        where: { batchId: batch.id },
      });

      if (normalized.length > 0) {
        await tx.openingInventoryDraftLine.createMany({
          data: normalized.map((line) => ({
            batchId: batch.id,
            orgId,
            itemId: line.itemId,
            qty: line.qty,
            unitCost: line.unitCost,
          })),
        });
      }

      await tx.organization.update({
        where: { id: orgId },
        data: { openingBalancesStatus: "DRAFT" },
      });

      return { count: normalized.length };
    });

    return result;
  }

  async preview(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const response = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }

      const batch = await tx.openingBalanceDraftBatch.findUnique({
        where: { orgId },
        include: { lines: true, inventoryLines: true },
      });

      const adjustmentAccount = await this.ensureAdjustmentAccount(tx, orgId);
      const preview = await this.buildPreview(tx, org, batch, adjustmentAccount);
      const { postingLines, ...response } = preview;
      return response;
    });

    return response;
  }

  async post(orgId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const postKey = buildIdempotencyKey(idempotencyKey, {
      scope: "opening-balances.post",
      actorUserId,
    });
    const requestHash = postKey ? hashRequestBody({ orgId }) : null;
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

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      if (org.openingBalancesStatus === "POSTED") {
        throw new ConflictException("Opening balances have already been posted");
      }
      if (!org.baseCurrency) {
        throw new BadRequestException("Organization base currency is required");
      }
      if (!org.cutOverDate) {
        throw new BadRequestException("Cut-over date is required before posting");
      }

      ensureNotLocked(org.orgSettings?.lockDate ?? null, org.cutOverDate, "post opening balances");

      const batch = await tx.openingBalanceDraftBatch.findUnique({
        where: { orgId },
        include: { lines: true, inventoryLines: true },
      });
      if (!batch) {
        throw new BadRequestException("Opening balance draft is missing");
      }

      const adjustmentAccount = await this.ensureAdjustmentAccount(tx, orgId);
      const preview = await this.buildPreview(tx, org, batch, adjustmentAccount);
      const postingLines = preview.postingLines;

      if (postingLines.length === 0) {
        throw new BadRequestException("No opening balance lines to post");
      }

      assertGlHeaderSourceUnique(tx, orgId, "OPENING_BALANCE", OPENING_BALANCE_SOURCE_ID(orgId));

      const totals = assertGlLinesValid(
        postingLines.map((line) => ({
          debit: line.debit,
          credit: line.credit,
          lineNo: line.lineNo,
        })),
      );

      const glHeader = await tx.gLHeader.create({
        data: {
          orgId,
          sourceType: "OPENING_BALANCE",
          sourceId: OPENING_BALANCE_SOURCE_ID(orgId),
          postingDate: org.cutOverDate,
          currency: org.baseCurrency,
          exchangeRate: null,
          totalDebit: totals.totalDebit,
          totalCredit: totals.totalCredit,
          status: "POSTED",
          createdByUserId: actorUserId,
          memo: "Opening balance migration",
          lines: {
            createMany: {
              data: postingLines.map((line) => ({
                lineNo: line.lineNo,
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description ?? undefined,
              })),
            },
          },
        },
        include: { lines: true },
      });

      if (batch.inventoryLines.length > 0) {
        for (const line of batch.inventoryLines) {
          const openingValue = round2(dec(line.qty).mul(line.unitCost));
          await tx.item.update({
            where: { id: line.itemId },
            data: {
              openingQty: line.qty,
              openingValue,
            },
          });
        }
      }

      const updatedOrg = await tx.organization.update({
        where: { id: orgId },
        data: {
          openingBalancesStatus: "POSTED",
          openingBalancesPostedAt: new Date(),
          openingBalancesPostedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "OPENING_BALANCE",
          entityId: orgId,
          action: AuditAction.POST,
          before: { status: org.openingBalancesStatus },
          after: {
            status: updatedOrg.openingBalancesStatus,
            postedAt: updatedOrg.openingBalancesPostedAt?.toISOString() ?? null,
            cutOverDate: updatedOrg.cutOverDate?.toISOString() ?? null,
            glHeaderId: glHeader.id,
          },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return {
        status: updatedOrg.openingBalancesStatus,
        postedAt: updatedOrg.openingBalancesPostedAt?.toISOString() ?? null,
        glHeader,
      };
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
  private normalizeDraftLines(lines: { accountId: string; debit?: MoneyValue; credit?: MoneyValue }[]) {
    return lines
      .map((line, index) => {
        const debit = round2(line.debit ?? 0);
        const credit = round2(line.credit ?? 0);
        if (debit.greaterThan(0) && credit.greaterThan(0)) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Line ${index + 1} cannot include both debit and credit`,
            hint: "Set one side to zero.",
          });
        }
        if (!debit.greaterThan(0) && !credit.greaterThan(0)) {
          return null;
        }
        return {
          accountId: line.accountId,
          debit,
          credit,
        };
      })
      .filter((line): line is DraftLineInput => Boolean(line));
  }

  private normalizeInventoryLines(lines: { itemId: string; qty?: MoneyValue; unitCost?: MoneyValue }[]) {
    return lines
      .map((line, index) => {
        if (line.qty === undefined || line.unitCost === undefined) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Line ${index + 1} must include quantity and unit cost`,
            hint: "Provide quantity and unit cost for each inventory line.",
          });
        }
        const qty = dec(line.qty).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const unitCost = round2(line.unitCost);
        if (qty.lessThanOrEqualTo(0)) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Line ${index + 1} quantity must be greater than 0`,
            hint: "Provide a quantity greater than zero.",
          });
        }
        if (unitCost.lessThanOrEqualTo(0)) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Line ${index + 1} unit cost must be greater than 0`,
            hint: "Provide a unit cost greater than zero.",
          });
        }
        return { itemId: line.itemId, qty, unitCost };
      })
      .filter((line): line is InventoryDraftInput => Boolean(line));
  }

  private async assertAccountsAllowed(orgId: string, accountIds: string[]) {
    if (accountIds.length === 0) {
      return;
    }
    const accounts = await this.prisma.account.findMany({
      where: { orgId, id: { in: accountIds } },
      select: { id: true, subtype: true },
    });
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const missing = accountIds.filter((id) => !accountMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Some accounts were not found",
        hint: "Refresh the chart of accounts and try again.",
      });
    }
    const invalid = accounts.filter((account) => account.subtype && CONTROL_SUBTYPES.has(account.subtype));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "AR/AP control accounts cannot be included",
        hint: "Remove AR/AP control accounts from opening balances.",
      });
    }
  }

  private async ensureAdjustmentAccount(tx: Prisma.TransactionClient, orgId: string) {
    const existing = await tx.account.findFirst({
      where: {
        orgId,
        name: { equals: "Opening Balance Adjustment", mode: "insensitive" },
      },
      select: { id: true, code: true, name: true, type: true },
    });
    if (existing) {
      return existing;
    }

    const baseCode = "3900";
    let code = baseCode;
    let counter = 1;
    while (await tx.account.findFirst({ where: { orgId, code } })) {
      code = `${baseCode}-${counter}`;
      counter += 1;
    }

    return tx.account.create({
      data: {
        orgId,
        code,
        name: "Opening Balance Adjustment",
        type: "EQUITY",
        subtype: "EQUITY",
        normalBalance: "CREDIT",
        isSystem: true,
        isActive: true,
      },
      select: { id: true, code: true, name: true, type: true },
    });
  }
  private buildPreview(
    tx: Prisma.TransactionClient,
    org: Prisma.OrganizationGetPayload<{ include: { orgSettings: true } }>,
    batch: Prisma.OpeningBalanceDraftBatchGetPayload<{
      include: { lines: true; inventoryLines: true };
    }> | null,
    adjustmentAccount: { id: string; code: string; name: string; type: string },
  ) {
    const validations: ValidationNotice[] = [];
    const cutOverDate = org.cutOverDate ? org.cutOverDate.toISOString() : null;
    if (!cutOverDate) {
      validations.push({ level: "warning", message: "Cut-over date has not been set yet." });
    }

    const accountLines = batch?.lines ?? [];
    const inventoryLines = batch?.inventoryLines ?? [];

    if (accountLines.length === 0 && inventoryLines.length === 0) {
      validations.push({ level: "warning", message: "No opening balances have been entered yet." });
    }

    const accountIds = accountLines.map((line) => line.accountId);
    const inventoryItemIds = inventoryLines.map((line) => line.itemId);

    const inventoryTotalsByAccount = new Map<string, Prisma.Decimal>();

    const loadInventory = async () => {
      if (inventoryItemIds.length === 0) {
        return;
      }
      const items = await tx.item.findMany({
        where: { orgId: org.id, id: { in: inventoryItemIds } },
        select: { id: true, inventoryAccountId: true, type: true },
      });
      const itemMap = new Map(items.map((item) => [item.id, item]));
      const missing = inventoryItemIds.filter((id) => !itemMap.has(id));
      if (missing.length > 0) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Some inventory items were not found",
          hint: "Remove missing items and try again.",
        });
      }

      const defaultInventoryAccountId = org.orgSettings?.defaultInventoryAccountId ?? null;
      for (const line of inventoryLines) {
        const item = itemMap.get(line.itemId);
        if (!item) {
          continue;
        }
        if (item.type !== "INVENTORY") {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Only inventory items can be included",
            hint: "Remove non-inventory items from opening inventory.",
          });
        }
        const accountId = item.inventoryAccountId ?? defaultInventoryAccountId;
        if (!accountId) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Inventory account is required",
            hint: "Set a default inventory account in org settings or per item.",
          });
        }
        const value = round2(dec(line.qty).mul(line.unitCost));
        const current = inventoryTotalsByAccount.get(accountId) ?? dec(0);
        inventoryTotalsByAccount.set(accountId, round2(dec(current).add(value)));
      }
    };

    const buildLines = async () => {
      await loadInventory();

      const inventoryAccountIds = Array.from(inventoryTotalsByAccount.keys());
      const allAccountIds = Array.from(new Set([...accountIds, ...inventoryAccountIds, adjustmentAccount.id]));
      const accounts = allAccountIds.length
        ? await tx.account.findMany({
            where: { orgId: org.id, id: { in: allAccountIds } },
            select: { id: true, code: true, name: true, type: true },
          })
        : [];
      const accountMap = new Map(accounts.map((account) => [account.id, account]));

      const journalLines: PreviewLine[] = [];
      for (const line of accountLines) {
        const account = accountMap.get(line.accountId);
        if (!account) {
          continue;
        }
        journalLines.push({
          accountId: line.accountId,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: toString2(line.debit),
          credit: toString2(line.credit),
          description: `Opening balance - ${account.name}`,
        });
      }

      for (const [accountId, total] of inventoryTotalsByAccount.entries()) {
        const account = accountMap.get(accountId);
        if (!account) {
          continue;
        }
        journalLines.push({
          accountId,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: toString2(total),
          credit: toString2(0),
          description: "Opening inventory",
        });
      }

      const totals = journalLines.reduce(
        (acc, line) => {
          acc.debit = round2(dec(acc.debit).add(line.debit));
          acc.credit = round2(dec(acc.credit).add(line.credit));
          return acc;
        },
        { debit: dec(0), credit: dec(0) },
      );

      let adjustment: PreviewAdjustment = null;
      let adjustedDebit = totals.debit;
      let adjustedCredit = totals.credit;

      if (!totals.debit.equals(totals.credit)) {
        const diff = round2(dec(totals.debit).sub(totals.credit));
        const isDebit = diff.isNegative();
        const amount = diff.abs();
        const account = accountMap.get(adjustmentAccount.id);
        if (account) {
          adjustment = {
            accountId: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            debit: toString2(isDebit ? amount : 0),
            credit: toString2(isDebit ? 0 : amount),
            description: "Opening balance adjustment",
          };
        }
        if (isDebit) {
          adjustedDebit = round2(dec(adjustedDebit).add(amount));
        } else {
          adjustedCredit = round2(dec(adjustedCredit).add(amount));
        }
        validations.push({
          level: "warning",
          message: "An opening balance adjustment line will be created to balance the journal.",
        });
      }

      const totalsAdjusted = { debit: adjustedDebit, credit: adjustedCredit };

      const trialMap = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      const addToTrial = (accountId: string, debit: MoneyValue, credit: MoneyValue) => {
        const current = trialMap.get(accountId) ?? { debit: dec(0), credit: dec(0) };
        trialMap.set(accountId, {
          debit: round2(dec(current.debit).add(debit)),
          credit: round2(dec(current.credit).add(credit)),
        });
      };

      for (const line of journalLines) {
        addToTrial(line.accountId, line.debit, line.credit);
      }
      if (adjustment) {
        addToTrial(adjustment.accountId, adjustment.debit, adjustment.credit);
      }

      const trialRows = Array.from(trialMap.entries())
        .map(([accountId, sums]) => {
          const account = accountMap.get(accountId);
          if (!account) {
            return null;
          }
          return {
            accountId,
            code: account.code,
            name: account.name,
            type: account.type,
            debit: toString2(sums.debit),
            credit: toString2(sums.credit),
          };
        })
        .filter((row): row is Exclude<typeof row, null> => Boolean(row))
        .sort((a, b) => a.code.localeCompare(b.code));

      return {
        journalLines,
        adjustmentLine: adjustment,
        totals: {
          debit: toString2(totalsAdjusted.debit),
          credit: toString2(totalsAdjusted.credit),
        },
        trialBalancePreview: {
          currency: org.baseCurrency,
          totals: {
            debit: toString2(totalsAdjusted.debit),
            credit: toString2(totalsAdjusted.credit),
          },
          rows: trialRows,
        },
      };
    };

    return buildLines().then((preview) => ({
      status: org.openingBalancesStatus,
      cutOverDate,
      currency: org.baseCurrency,
      journalLines: preview.journalLines,
      adjustmentLine: preview.adjustmentLine,
      totals: preview.totals,
      trialBalancePreview: preview.trialBalancePreview,
      validations,
      postingLines: this.buildPostingLines(preview),
    }));
  }

  private buildPostingLines(preview: { journalLines: PreviewLine[]; adjustmentLine: PreviewAdjustment }) {
    const lines = [...preview.journalLines];
    if (preview.adjustmentLine) {
      lines.push(preview.adjustmentLine);
    }

    return lines
      .map((line, index) => ({
        lineNo: index + 1,
        accountId: line.accountId,
        debit: round2(line.debit ?? 0),
        credit: round2(line.credit ?? 0),
        description: line.description ?? undefined,
      }))
      .filter((line) => !dec(line.debit).equals(0) || !dec(line.credit).equals(0));
  }

  private extractCsvDraftLines(rows: string[][]) {
    const headerRow = rows[0] ?? [];
    const normalizedHeader = headerRow.map((cell) => cell.trim().toLowerCase());
    const headerIndex = {
      code: normalizedHeader.findIndex((cell) =>
        ["code", "account", "account code", "account_code", "accountcode"].includes(cell),
      ),
      debit: normalizedHeader.findIndex((cell) => ["debit", "dr"].includes(cell)),
      credit: normalizedHeader.findIndex((cell) => ["credit", "cr"].includes(cell)),
    };

    const hasHeader = headerIndex.code >= 0 || headerIndex.debit >= 0 || headerIndex.credit >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const codeIndex = hasHeader && headerIndex.code >= 0 ? headerIndex.code : 0;
    const debitIndex = hasHeader && headerIndex.debit >= 0 ? headerIndex.debit : 1;
    const creditIndex = hasHeader && headerIndex.credit >= 0 ? headerIndex.credit : 2;

    const lineTotals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    let skipped = 0;

    for (const row of dataRows) {
      const code = (row[codeIndex] ?? "").trim();
      if (!code) {
        skipped += 1;
        continue;
      }

      const debitValue = normalizeCsvNumber(row[debitIndex]);
      const creditValue = normalizeCsvNumber(row[creditIndex]);

      if (debitValue === null && creditValue === null) {
        skipped += 1;
        continue;
      }

      const debit = debitValue ?? 0;
      const credit = creditValue ?? 0;

      const current = lineTotals.get(code) ?? { debit: dec(0), credit: dec(0) };
      lineTotals.set(code, {
        debit: round2(dec(current.debit).add(debit)),
        credit: round2(dec(current.credit).add(credit)),
      });
    }

    const lines = Array.from(lineTotals.entries())
      .map(([accountCode, totals]) => {
        if (totals.debit.equals(totals.credit)) {
          return null;
        }
        const net = round2(dec(totals.debit).sub(totals.credit));
        return {
          accountCode,
          debit: net.greaterThan(0) ? net : dec(0),
          credit: net.greaterThan(0) ? dec(0) : net.abs(),
        };
      })
      .filter((line): line is { accountCode: string; debit: Prisma.Decimal; credit: Prisma.Decimal } => Boolean(line));

    return { lines, skipped };
  }
}

const parseCsv = (content: string, delimiter = ",") => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  const pushValue = () => {
    currentRow.push(currentValue);
    currentValue = "";
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        const next = content[index + 1];
        if (next === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      pushValue();
      continue;
    }

    if (char === "\n") {
      pushValue();
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    pushValue();
    if (currentRow.some((cell) => cell.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const normalizeCsvNumber = (value?: string) => {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return round2(parsed);
};
