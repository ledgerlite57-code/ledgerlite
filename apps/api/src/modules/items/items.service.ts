import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, ItemType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type ItemCreateInput, type ItemUpdateInput, type PaginationInput } from "@ledgerlite/shared";

type ItemRecord = Prisma.ItemGetPayload<{
  include: {
    incomeAccount: true;
    expenseAccount: true;
    inventoryAccount: true;
    fixedAssetAccount: true;
    defaultTaxCode: true;
    unitOfMeasure: true;
  };
}>;
type ItemListParams = PaginationInput & { isActive?: boolean };

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listItems(orgId?: string, params?: ItemListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.ItemWhereInput = { orgId };
    if (typeof params?.isActive === "boolean") {
      where.isActive = params.isActive;
    }
    if (params?.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { sku: { contains: params.q, mode: "insensitive" } },
      ];
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const orderBy = this.resolveSort(params?.sortBy, params?.sortDir);

    const [data, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        include: {
          incomeAccount: true,
          expenseAccount: true,
          inventoryAccount: true,
          fixedAssetAccount: true,
          defaultTaxCode: true,
          unitOfMeasure: true,
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.item.count({ where }),
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

  async getItem(orgId?: string, itemId?: string) {
    if (!orgId || !itemId) {
      throw new NotFoundException("Item not found");
    }
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, orgId },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        inventoryAccount: true,
        fixedAssetAccount: true,
        defaultTaxCode: true,
        unitOfMeasure: true,
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

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "items.create",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody(input) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as ItemRecord;
      }
    }

    const type = input.type as ItemType;
    await this.validateItemRefs(
      orgId,
      type,
      {
        incomeAccountId: input.incomeAccountId,
        expenseAccountId: input.expenseAccountId,
        inventoryAccountId: input.inventoryAccountId,
        fixedAssetAccountId: input.fixedAssetAccountId,
      },
      input.defaultTaxCodeId,
    );
    const unitOfMeasureId = input.unitOfMeasureId ?? (await this.ensureBaseUnit(orgId));
    await this.validateUnitOfMeasure(orgId, unitOfMeasureId);

    const item = await this.prisma.item.create({
      data: {
        orgId,
        name: input.name,
        type,
        sku: input.sku,
        salePrice: input.salePrice,
        purchasePrice: input.purchasePrice,
        incomeAccountId: input.incomeAccountId,
        expenseAccountId: input.expenseAccountId,
        inventoryAccountId: input.inventoryAccountId,
        fixedAssetAccountId: input.fixedAssetAccountId,
        defaultTaxCodeId: input.defaultTaxCodeId,
        unitOfMeasureId,
        allowFractionalQty: input.allowFractionalQty ?? true,
        trackInventory: type === ItemType.INVENTORY,
        reorderPoint: input.reorderPoint ?? null,
        openingQty: input.openingQty ?? null,
        openingValue: input.openingValue ?? null,
        isActive: input.isActive ?? true,
      },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        inventoryAccount: true,
        fixedAssetAccount: true,
        defaultTaxCode: true,
        unitOfMeasure: true,
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

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
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

    const nextType = input.type ? (input.type as ItemType) : item.type;
    const incomeAccountId = input.incomeAccountId ?? item.incomeAccountId ?? undefined;
    const expenseAccountId = input.expenseAccountId ?? item.expenseAccountId ?? undefined;
    const inventoryAccountId = input.inventoryAccountId ?? item.inventoryAccountId ?? undefined;
    const fixedAssetAccountId = input.fixedAssetAccountId ?? item.fixedAssetAccountId ?? undefined;
    const defaultTaxCodeId = input.defaultTaxCodeId ?? item.defaultTaxCodeId ?? undefined;

    await this.validateItemRefs(
      orgId,
      nextType,
      {
        incomeAccountId,
        expenseAccountId,
        inventoryAccountId,
        fixedAssetAccountId,
      },
      defaultTaxCodeId,
    );
    const unitOfMeasureId = input.unitOfMeasureId ?? item.unitOfMeasureId ?? (await this.ensureBaseUnit(orgId));
    await this.validateUnitOfMeasure(orgId, unitOfMeasureId);

    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: {
        name: input.name ?? item.name,
        type: nextType,
        sku: input.sku ?? item.sku,
        salePrice: input.salePrice ?? item.salePrice,
        purchasePrice: input.purchasePrice ?? item.purchasePrice,
        incomeAccountId,
        expenseAccountId,
        inventoryAccountId,
        fixedAssetAccountId,
        defaultTaxCodeId,
        unitOfMeasureId,
        allowFractionalQty: input.allowFractionalQty ?? item.allowFractionalQty,
        trackInventory: nextType === ItemType.INVENTORY,
        reorderPoint: input.reorderPoint ?? item.reorderPoint,
        openingQty: input.openingQty ?? item.openingQty,
        openingValue: input.openingValue ?? item.openingValue,
        isActive: input.isActive ?? item.isActive,
      },
      include: {
        incomeAccount: true,
        expenseAccount: true,
        inventoryAccount: true,
        fixedAssetAccount: true,
        defaultTaxCode: true,
        unitOfMeasure: true,
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
    type: ItemType,
    accounts: {
      incomeAccountId?: string;
      expenseAccountId?: string;
      inventoryAccountId?: string;
      fixedAssetAccountId?: string;
    },
    defaultTaxCodeId?: string,
  ) {
    const accountIds = [
      accounts.incomeAccountId,
      accounts.expenseAccountId,
      accounts.inventoryAccountId,
      accounts.fixedAssetAccountId,
    ].filter(Boolean) as string[];
    const accountRecords = accountIds.length
      ? await this.prisma.account.findMany({ where: { id: { in: accountIds }, orgId } })
      : [];
    if (accountRecords.length !== accountIds.length) {
      throw new NotFoundException("Account not found");
    }
    if (accountRecords.some((account) => !account.isActive)) {
      throw new BadRequestException("Account must be active");
    }
    const accountById = new Map(accountRecords.map((account) => [account.id, account]));

    const requireAccount = (id: string | undefined, label: string) => {
      if (!id) {
        throw new BadRequestException(`${label} is required for ${type.toLowerCase()} items`);
      }
      return accountById.get(id);
    };

    if (type === ItemType.SERVICE) {
      const income = requireAccount(accounts.incomeAccountId, "Income account");
      if (income?.type !== "INCOME") {
        throw new BadRequestException("Income account must be INCOME type");
      }
      if (accounts.expenseAccountId) {
        const expense = accountById.get(accounts.expenseAccountId);
        if (expense?.type !== "EXPENSE") {
          throw new BadRequestException("Expense account must be EXPENSE type");
        }
      }
    }

    if (type === ItemType.INVENTORY) {
      const income = requireAccount(accounts.incomeAccountId, "Income account");
      if (income?.type !== "INCOME") {
        throw new BadRequestException("Income account must be INCOME type");
      }
      const expense = requireAccount(accounts.expenseAccountId, "COGS account");
      if (expense?.type !== "EXPENSE") {
        throw new BadRequestException("COGS account must be EXPENSE type");
      }
      const inventory = requireAccount(accounts.inventoryAccountId, "Inventory asset account");
      if (inventory?.type !== "ASSET") {
        throw new BadRequestException("Inventory asset account must be ASSET type");
      }
    }

    if (type === ItemType.FIXED_ASSET) {
      const fixedAsset = requireAccount(accounts.fixedAssetAccountId, "Fixed asset account");
      if (fixedAsset?.type !== "ASSET") {
        throw new BadRequestException("Fixed asset account must be ASSET type");
      }
    }

    if (type === ItemType.NON_INVENTORY_EXPENSE) {
      const expense = requireAccount(accounts.expenseAccountId, "Expense account");
      if (expense?.type !== "EXPENSE") {
        throw new BadRequestException("Expense account must be EXPENSE type");
      }
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

  private async ensureBaseUnit(orgId: string) {
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
    return baseUnit.id;
  }

  private async validateUnitOfMeasure(orgId: string, unitId: string) {
    const unit = await this.prisma.unitOfMeasure.findFirst({
      where: { orgId, id: unitId },
      select: { id: true, isActive: true },
    });
    if (!unit) {
      throw new NotFoundException("Unit of measure not found");
    }
    if (!unit.isActive) {
      throw new BadRequestException("Unit of measure must be active");
    }
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.ItemOrderByWithRelationInput {
    if (sortBy && ["name", "sku", "createdAt"].includes(sortBy)) {
      return { [sortBy]: sortDir ?? "asc" } as Prisma.ItemOrderByWithRelationInput;
    }
    return { name: "asc" };
  }
}
