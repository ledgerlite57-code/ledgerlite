import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, ItemType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { type ItemCreateInput, type ItemUpdateInput } from "@ledgerlite/shared";

type ItemRecord = Prisma.ItemGetPayload<{
  include: { incomeAccount: true; expenseAccount: true; defaultTaxCode: true };
}>;

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listItems(orgId?: string, search?: string, isActive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.ItemWhereInput = { orgId };
    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.item.findMany({
      where,
      include: {
        incomeAccount: true,
        expenseAccount: true,
        defaultTaxCode: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getItem(orgId?: string, itemId?: string) {
    if (!orgId || !itemId) {
      throw new NotFoundException("Item not found");
    }
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, orgId },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        defaultTaxCode: true,
      },
    });
    if (!item) {
      throw new NotFoundException("Item not found");
    }
    return item;
  }

  async createItem(
    orgId?: string,
    actorUserId?: string,
    input?: ItemCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
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
        return existingKey.response as unknown as ItemRecord;
      }
    }

    await this.validateItemRefs(orgId, input.incomeAccountId, input.expenseAccountId, input.defaultTaxCodeId);

    const item = await this.prisma.item.create({
      data: {
        orgId,
        name: input.name,
        type: input.type as ItemType,
        sku: input.sku,
        salePrice: input.salePrice,
        purchasePrice: input.purchasePrice,
        incomeAccountId: input.incomeAccountId,
        expenseAccountId: input.expenseAccountId,
        defaultTaxCodeId: input.defaultTaxCodeId,
        trackInventory: input.trackInventory ?? false,
        reorderPoint: input.reorderPoint ?? null,
        openingQty: input.openingQty ?? null,
        openingValue: input.openingValue ?? null,
        isActive: input.isActive ?? true,
      },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        defaultTaxCode: true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ITEM",
      entityId: item.id,
      action: AuditAction.CREATE,
      after: item,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: item as unknown as object,
          statusCode: 201,
        },
      });
    }

    return item;
  }

  async updateItem(orgId?: string, itemId?: string, actorUserId?: string, input?: ItemUpdateInput) {
    if (!orgId || !itemId) {
      throw new NotFoundException("Item not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const item = await this.prisma.item.findFirst({
      where: { id: itemId, orgId },
    });
    if (!item) {
      throw new NotFoundException("Item not found");
    }

    const incomeAccountId = input.incomeAccountId ?? item.incomeAccountId;
    const expenseAccountId = input.expenseAccountId ?? item.expenseAccountId;
    const defaultTaxCodeId = input.defaultTaxCodeId ?? item.defaultTaxCodeId ?? undefined;

    await this.validateItemRefs(orgId, incomeAccountId, expenseAccountId, defaultTaxCodeId);

    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: {
        name: input.name ?? item.name,
        type: input.type ? (input.type as ItemType) : item.type,
        sku: input.sku ?? item.sku,
        salePrice: input.salePrice ?? item.salePrice,
        purchasePrice: input.purchasePrice ?? item.purchasePrice,
        incomeAccountId,
        expenseAccountId,
        defaultTaxCodeId,
        trackInventory: input.trackInventory ?? item.trackInventory,
        reorderPoint: input.reorderPoint ?? item.reorderPoint,
        openingQty: input.openingQty ?? item.openingQty,
        openingValue: input.openingValue ?? item.openingValue,
        isActive: input.isActive ?? item.isActive,
      },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        defaultTaxCode: true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ITEM",
      entityId: itemId,
      action: AuditAction.UPDATE,
      before: item,
      after: updated,
    });

    return updated;
  }

  private async validateItemRefs(
    orgId: string,
    incomeAccountId: string,
    expenseAccountId: string,
    defaultTaxCodeId?: string,
  ) {
    const [incomeAccount, expenseAccount] = await Promise.all([
      this.prisma.account.findFirst({ where: { id: incomeAccountId, orgId } }),
      this.prisma.account.findFirst({ where: { id: expenseAccountId, orgId } }),
    ]);

    if (!incomeAccount || !expenseAccount) {
      throw new NotFoundException("Account not found");
    }
    if (!incomeAccount.isActive || !expenseAccount.isActive) {
      throw new BadRequestException("Account must be active");
    }
    if (incomeAccount.type !== "INCOME") {
      throw new BadRequestException("Income account must be INCOME type");
    }
    if (expenseAccount.type !== "EXPENSE") {
      throw new BadRequestException("Expense account must be EXPENSE type");
    }

    if (!defaultTaxCodeId) {
      return;
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org?.vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCode = await this.prisma.taxCode.findFirst({
      where: { id: defaultTaxCodeId, orgId },
    });
    if (!taxCode) {
      throw new NotFoundException("Tax code not found");
    }
    if (!taxCode.isActive) {
      throw new BadRequestException("Tax code must be active");
    }
  }
}
