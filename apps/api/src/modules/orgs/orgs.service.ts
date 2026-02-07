import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuditAction, ItemType, Prisma } from "@prisma/client";
import { Permissions } from "@ledgerlite/shared";
import type { OrgCreateInput, OrgSettingsUpdateInput, OrgUpdateInput } from "@ledgerlite/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { getApiEnv } from "../../common/env";
import { RequestContext } from "../../logging/request-context";
import { applyNumberingUpdate, resolveNumberingFormats } from "../../common/numbering";
import { OnboardingService } from "../onboarding/onboarding.service";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash", type: "ASSET", subtype: "CASH" },
  { code: "1010", name: "Bank", type: "ASSET", subtype: "BANK" },
  { code: "1020", name: "Undeposited Funds", type: "ASSET", subtype: "CASH" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "AR" },
  { code: "1200", name: "VAT Receivable", type: "ASSET", subtype: "VAT_RECEIVABLE" },
  { code: "1300", name: "Vendor Prepayments", type: "ASSET", subtype: "VENDOR_PREPAYMENTS" },
  { code: "1400", name: "Inventory Asset", type: "ASSET", subtype: null },
  { code: "1500", name: "Fixed Assets", type: "ASSET", subtype: null },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "AP" },
  { code: "2100", name: "VAT Payable", type: "LIABILITY", subtype: "VAT_PAYABLE" },
  { code: "2200", name: "Customer Advances", type: "LIABILITY", subtype: "CUSTOMER_ADVANCES" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY", subtype: "EQUITY" },
  { code: "3900", name: "Opening Balance Adjustment", type: "EQUITY", subtype: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "INCOME", subtype: "SALES" },
  { code: "5000", name: "General Expenses", type: "EXPENSE", subtype: "EXPENSE" },
  { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", subtype: null },
] as const;

const NORMAL_BALANCE_BY_TYPE = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
} as const;

const RECONCILABLE_SUBTYPES = new Set(["BANK", "CASH"]);

const BASE_UNITS = [
  { name: "Each", symbol: "ea" },
  { name: "Kilogram", symbol: "kg" },
  { name: "Liter", symbol: "L" },
] as const;

const DERIVED_UNITS = [
  { name: "Dozen", symbol: "doz", base: "Each", conversionRate: 12 },
  { name: "Gram", symbol: "g", base: "Kilogram", conversionRate: 0.001 },
  { name: "Pound", symbol: "lb", base: "Kilogram", conversionRate: 0.453592 },
  { name: "Ounce", symbol: "oz", base: "Kilogram", conversionRate: 0.0283495 },
  { name: "Milliliter", symbol: "mL", base: "Liter", conversionRate: 0.001 },
  { name: "Gallon", symbol: "gal", base: "Liter", conversionRate: 3.78541 },
] as const;

const DEFAULT_NUMBERING = {
  invoicePrefix: "INV-",
  invoiceNextNumber: 1,
  billPrefix: "BILL-",
  billNextNumber: 1,
  expensePrefix: "EXP-",
  expenseNextNumber: 1,
  paymentPrefix: "PAY-",
  paymentNextNumber: 1,
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentNextNumber: 1,
} as const;

const DEFAULT_NUMBERING_FORMATS = {
  invoice: { prefix: DEFAULT_NUMBERING.invoicePrefix, nextNumber: DEFAULT_NUMBERING.invoiceNextNumber },
  bill: { prefix: DEFAULT_NUMBERING.billPrefix, nextNumber: DEFAULT_NUMBERING.billNextNumber },
  expense: { prefix: DEFAULT_NUMBERING.expensePrefix, nextNumber: DEFAULT_NUMBERING.expenseNextNumber },
  payment: { prefix: DEFAULT_NUMBERING.paymentPrefix, nextNumber: DEFAULT_NUMBERING.paymentNextNumber },
  vendorPayment: { prefix: DEFAULT_NUMBERING.vendorPaymentPrefix, nextNumber: DEFAULT_NUMBERING.vendorPaymentNextNumber },
} as const;

const DEFAULT_PAYMENT_TERMS_DAYS = 30;

const DEV_TAX_CODES = [
  { name: "VAT 5%", rate: 5, type: "STANDARD" },
  { name: "Zero Rated", rate: 0, type: "ZERO" },
  { name: "Exempt", rate: 0, type: "EXEMPT" },
  { name: "Out of Scope", rate: 0, type: "OUT_OF_SCOPE" },
] as const;

const DEV_CUSTOMERS = [
  {
    name: "Acme Trading LLC",
    email: "accounts@acme.local",
    phone: "+971500000001",
    billingAddress: { formatted: "Dubai, UAE" },
    shippingAddress: { formatted: "Dubai, UAE" },
    paymentTermsDays: 30,
    creditLimit: 50000,
  },
  {
    name: "Globex Hospitality",
    email: "finance@globex.local",
    phone: "+971500000002",
    billingAddress: { formatted: "Abu Dhabi, UAE" },
    shippingAddress: { formatted: "Abu Dhabi, UAE" },
    paymentTermsDays: 14,
    creditLimit: 20000,
  },
] as const;

const DEV_VENDORS = [
  {
    name: "Desert Office Supplies",
    email: "billing@desert.local",
    phone: "+971500000010",
    address: { formatted: "Sharjah, UAE" },
    paymentTermsDays: 15,
  },
  {
    name: "Metro Utilities",
    email: "ap@metro.local",
    phone: "+971500000011",
    address: { formatted: "Dubai, UAE" },
    paymentTermsDays: 30,
  },
] as const;

const DEV_ITEMS = [
  {
    name: "Consulting Services",
    type: ItemType.SERVICE,
    sku: "CONSULT-01",
    salePrice: 250,
    purchasePrice: 150,
  },
  {
    name: "Office Supplies Pack",
    type: ItemType.INVENTORY,
    sku: "SUP-100",
    salePrice: 75,
    purchasePrice: 40,
  },
  {
    name: "Office Equipment",
    type: ItemType.FIXED_ASSET,
    sku: "EQUIP-200",
    salePrice: 0,
    purchasePrice: 1200,
  },
  {
    name: "Software Subscription",
    type: ItemType.NON_INVENTORY_EXPENSE,
    sku: "SUB-300",
    salePrice: 0,
    purchasePrice: 99,
  },
] as const;

const seedDevOrgData = async (
  tx: Prisma.TransactionClient,
  orgId: string,
  eachUnitId: string | null,
  vatEnabled: boolean,
) => {
  await Promise.all(
    DEV_TAX_CODES.map((taxCode) =>
      tx.taxCode.create({
        data: {
          orgId,
          name: taxCode.name,
          rate: taxCode.rate,
          type: taxCode.type,
          isActive: true,
        },
      }),
    ),
  );

  await Promise.all(
    DEV_CUSTOMERS.map((customer) =>
      tx.customer.create({
        data: {
          orgId,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress,
          paymentTermsDays: customer.paymentTermsDays,
          creditLimit: customer.creditLimit,
          isActive: true,
        },
      }),
    ),
  );

  await Promise.all(
    DEV_VENDORS.map((vendor) =>
      tx.vendor.create({
        data: {
          orgId,
          name: vendor.name,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          paymentTermsDays: vendor.paymentTermsDays,
          isActive: true,
        },
      }),
    ),
  );

  if (!eachUnitId) {
    return;
  }

  const incomeAccount =
    (await tx.account.findFirst({ where: { orgId, subtype: "SALES" } })) ??
    (await tx.account.findFirst({ where: { orgId, type: "INCOME" } }));
  const expenseAccount =
    (await tx.account.findFirst({ where: { orgId, subtype: "EXPENSE" } })) ??
    (await tx.account.findFirst({ where: { orgId, type: "EXPENSE" } }));
  const inventoryAccount = await tx.account.findFirst({ where: { orgId, code: "1400" } });
  const fixedAssetAccount = await tx.account.findFirst({ where: { orgId, code: "1500" } });
  const cogsAccount = (await tx.account.findFirst({ where: { orgId, code: "5100" } })) ?? expenseAccount;

  const defaultTax = vatEnabled
    ? await tx.taxCode.findFirst({ where: { orgId, name: "VAT 5%" } })
    : null;

  const itemsToCreate: Prisma.ItemUncheckedCreateInput[] = [];
  for (const item of DEV_ITEMS) {
    const baseData: Prisma.ItemUncheckedCreateInput = {
      orgId,
      name: item.name,
      type: item.type,
      sku: item.sku,
      salePrice: item.salePrice,
      purchasePrice: item.purchasePrice,
      defaultTaxCodeId: defaultTax?.id ?? undefined,
      unitOfMeasureId: eachUnitId,
      isActive: true,
      trackInventory: false,
    };

    if (item.type === ItemType.SERVICE) {
      if (!incomeAccount) {
        continue;
      }
      itemsToCreate.push({
        ...baseData,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount?.id ?? undefined,
      });
      continue;
    }
    if (item.type === ItemType.INVENTORY) {
      if (!incomeAccount || !cogsAccount || !inventoryAccount) {
        continue;
      }
      itemsToCreate.push({
        ...baseData,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: cogsAccount.id,
        inventoryAccountId: inventoryAccount.id,
        trackInventory: true,
      });
      continue;
    }
    if (item.type === ItemType.FIXED_ASSET) {
      if (!fixedAssetAccount) {
        continue;
      }
      itemsToCreate.push({
        ...baseData,
        fixedAssetAccountId: fixedAssetAccount.id,
      });
      continue;
    }
    if (item.type === ItemType.NON_INVENTORY_EXPENSE) {
      if (!expenseAccount) {
        continue;
      }
      itemsToCreate.push({
        ...baseData,
        expenseAccountId: expenseAccount.id,
      });
    }
  }

  await Promise.all(itemsToCreate.map((data) => tx.item.create({ data })));
};

const ROLE_DEFINITIONS = [
  {
    name: "Owner",
    permissions: Object.values(Permissions),
  },
  {
    name: "Accountant",
    permissions: [
      Permissions.ORG_READ,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
      Permissions.JOURNAL_READ,
      Permissions.JOURNAL_WRITE,
      Permissions.JOURNAL_POST,
      Permissions.EXPENSE_READ,
      Permissions.EXPENSE_WRITE,
      Permissions.EXPENSE_POST,
      Permissions.BANK_READ,
      Permissions.BANK_WRITE,
      Permissions.PDC_READ,
      Permissions.PDC_WRITE,
      Permissions.PDC_POST,
      Permissions.INVENTORY_NEGATIVE_STOCK_OVERRIDE,
      Permissions.RECONCILE_MANAGE,
      Permissions.REPORTS_VIEW,
      Permissions.AUDIT_VIEW,
    ],
  },
  {
    name: "Sales",
    permissions: [
      Permissions.ORG_READ,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.BANK_READ,
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.PAYMENT_RECEIVED_POST,
      Permissions.PDC_READ,
      Permissions.PDC_WRITE,
      Permissions.PDC_POST,
    ],
  },
  {
    name: "Purchases",
    permissions: [
      Permissions.ORG_READ,
      Permissions.VENDOR_READ,
      Permissions.VENDOR_WRITE,
      Permissions.BILL_READ,
      Permissions.BILL_WRITE,
      Permissions.BILL_POST,
      Permissions.EXPENSE_READ,
      Permissions.EXPENSE_WRITE,
      Permissions.EXPENSE_POST,
      Permissions.VENDOR_PAYMENT_READ,
      Permissions.VENDOR_PAYMENT_WRITE,
      Permissions.VENDOR_PAYMENT_POST,
      Permissions.PDC_READ,
      Permissions.PDC_WRITE,
      Permissions.PDC_POST,
    ],
  },
  {
    name: "Viewer",
    permissions: [
      Permissions.ORG_READ,
      Permissions.COA_READ,
      Permissions.CUSTOMER_READ,
      Permissions.VENDOR_READ,
      Permissions.ITEM_READ,
      Permissions.INVOICE_READ,
      Permissions.BILL_READ,
      Permissions.EXPENSE_READ,
      Permissions.PDC_READ,
      Permissions.REPORTS_VIEW,
    ],
  },
] as const;

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwtService: JwtService,
    private readonly onboarding: OnboardingService,
  ) {}

  async createOrg(input: OrgCreateInput, idempotencyKey?: string, userId?: string) {
    if (!userId) {
      throw new ConflictException("Missing user context for organization creation");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "orgs.create",
      actorUserId: userId,
    });
    const requestHash = scopedKey ? hashRequestBody(input) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      if (scopedKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-create:${userId}:${scopedKey}`}))`;
        const existingKey = await tx.idempotencyKey.findFirst({
          where: { key: scopedKey },
        });
        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            throw new ConflictException("Idempotency key already used with different payload");
          }
          return { kind: "idempotent", response: existingKey.response };
        }
      }

      await Promise.all(
        Object.values(Permissions).map((code) =>
          tx.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: `System permission: ${code}` },
          }),
        ),
      );

      const org = await tx.organization.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          tradeLicenseNumber: input.tradeLicenseNumber,
          address: input.address,
          phone: input.phone,
          industryType: input.industryType,
          defaultLanguage: input.defaultLanguage,
          dateFormat: input.dateFormat,
          numberFormat: input.numberFormat,
          countryCode: input.countryCode,
          baseCurrency: input.baseCurrency,
          fiscalYearStartMonth: input.fiscalYearStartMonth,
          vatEnabled: input.vatEnabled,
          vatTrn: input.vatTrn,
          timeZone: input.timeZone,
        },
      });

      const baseUnits = await Promise.all(
        BASE_UNITS.map((unit) =>
          tx.unitOfMeasure.create({
            data: {
              orgId: org.id,
              name: unit.name,
              symbol: unit.symbol,
              baseUnitId: null,
              conversionRate: 1,
              isActive: true,
            },
          }),
        ),
      );
      const baseUnitMap = new Map(baseUnits.map((unit) => [unit.name, unit.id]));
      for (const unit of DERIVED_UNITS) {
        const baseUnitId = baseUnitMap.get(unit.base);
        if (!baseUnitId) {
          continue;
        }
        await tx.unitOfMeasure.create({
          data: {
            orgId: org.id,
            name: unit.name,
            symbol: unit.symbol,
            baseUnitId,
            conversionRate: unit.conversionRate,
            isActive: true,
          },
        });
      }

      const roles = await Promise.all(
        ROLE_DEFINITIONS.map((role) =>
          tx.role.create({
            data: {
              orgId: org.id,
              name: role.name,
              isSystem: true,
            },
          }),
        ),
      );

      for (const role of roles) {
        const def = ROLE_DEFINITIONS.find((item) => item.name === role.name);
        if (!def) {
          continue;
        }
        await tx.rolePermission.createMany({
          data: def.permissions.map((permissionCode) => ({
            roleId: role.id,
            permissionCode,
          })),
        });
      }

      await tx.account.createMany({
        data: DEFAULT_ACCOUNTS.map((account) => ({
          orgId: org.id,
          code: account.code,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          normalBalance: NORMAL_BALANCE_BY_TYPE[account.type],
          isReconcilable: RECONCILABLE_SUBTYPES.has(account.subtype ?? ""),
          isSystem: true,
          isActive: true,
        })),
      });

      const [
        defaultArAccount,
        defaultApAccount,
        defaultInventoryAccount,
        defaultFixedAssetAccount,
        defaultCogsAccount,
      ] = await Promise.all([
        tx.account.findFirst({ where: { orgId: org.id, subtype: "AR" } }),
        tx.account.findFirst({ where: { orgId: org.id, subtype: "AP" } }),
        tx.account.findFirst({ where: { orgId: org.id, code: "1400" } }),
        tx.account.findFirst({ where: { orgId: org.id, code: "1500" } }),
        tx.account.findFirst({ where: { orgId: org.id, code: "5100" } }),
      ]);

      await tx.orgSettings.create({
        data: {
          orgId: org.id,
          invoicePrefix: DEFAULT_NUMBERING.invoicePrefix,
          invoiceNextNumber: DEFAULT_NUMBERING.invoiceNextNumber,
          billPrefix: DEFAULT_NUMBERING.billPrefix,
          billNextNumber: DEFAULT_NUMBERING.billNextNumber,
          expensePrefix: DEFAULT_NUMBERING.expensePrefix,
          expenseNextNumber: DEFAULT_NUMBERING.expenseNextNumber,
          paymentPrefix: DEFAULT_NUMBERING.paymentPrefix,
          paymentNextNumber: DEFAULT_NUMBERING.paymentNextNumber,
          vendorPaymentPrefix: DEFAULT_NUMBERING.vendorPaymentPrefix,
          vendorPaymentNextNumber: DEFAULT_NUMBERING.vendorPaymentNextNumber,
          defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
          defaultVatBehavior: "EXCLUSIVE",
          reportBasis: "ACCRUAL",
          defaultArAccountId: defaultArAccount?.id ?? null,
          defaultApAccountId: defaultApAccount?.id ?? null,
          defaultInventoryAccountId: defaultInventoryAccount?.id ?? null,
          defaultFixedAssetAccountId: defaultFixedAssetAccount?.id ?? null,
          defaultCogsAccountId: defaultCogsAccount?.id ?? null,
          numberingFormats: DEFAULT_NUMBERING_FORMATS,
          negativeStockPolicy: "ALLOW",
        },
      });

      const bankGlAccount =
        (await tx.account.findFirst({ where: { orgId: org.id, subtype: "BANK" } })) ??
        (await tx.account.findFirst({ where: { orgId: org.id, subtype: "CASH" } }));

      if (bankGlAccount) {
        await tx.bankAccount.create({
          data: {
            orgId: org.id,
            name: "Operating Bank",
            currency: input.baseCurrency,
            glAccountId: bankGlAccount.id,
            isActive: true,
          },
        });
      }

      const ownerRole = roles.find((role) => role.name === "Owner");
      if (!ownerRole) {
        throw new ConflictException("Owner role missing");
      }

      const membership = await tx.membership.create({
        data: {
          orgId: org.id,
          userId,
          roleId: ownerRole.id,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorUserId: userId,
          entityType: "ORG",
          entityId: org.id,
          action: AuditAction.CREATE,
          after: {
            name: org.name,
            legalName: org.legalName,
            tradeLicenseNumber: org.tradeLicenseNumber,
            industryType: org.industryType,
            defaultLanguage: org.defaultLanguage,
            dateFormat: org.dateFormat,
            numberFormat: org.numberFormat,
            baseCurrency: org.baseCurrency,
            countryCode: org.countryCode,
            vatEnabled: org.vatEnabled,
          },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
        const eachUnitId = baseUnitMap.get("Each") ?? null;
        await seedDevOrgData(tx, org.id, eachUnitId, Boolean(org.vatEnabled));
      }

      return { kind: "created", org, membership } as const;
    });

    if (result.kind === "idempotent") {
      return result.response;
    }

    const { org, membership } = result;
    if (!org || !membership) {
      throw new ConflictException("Organization creation failed");
    }

    const env = getApiEnv();
    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        orgId: org.id,
        membershipId: membership.id,
        roleId: membership.roleId,
      },
      {
        secret: env.API_JWT_SECRET,
        expiresIn: env.API_JWT_ACCESS_TTL,
      },
    );

    const response = {
      org,
      accessToken,
    };

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId: org.id,
          key: scopedKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }

    await this.syncOnboardingProgress(org.id, userId);

    return response;
  }

  async getCurrentOrg(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { orgSettings: true },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }
    return org;
  }

  async getSidebarCounts(orgId?: string, roleId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!roleId) {
      throw new ConflictException("Missing role context");
    }

    const permissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permissionCode: true },
    });
    const permissionSet = new Set(permissions.map((permission) => permission.permissionCode));

    const counts: {
      invoices?: number;
      paymentsReceived?: number;
      bills?: number;
      expenses?: number;
      vendorPayments?: number;
      pdc?: number;
      journals?: number;
    } = {};

    const countTasks: Promise<void>[] = [];
    const addCount = (key: keyof typeof counts, permission: string, task: () => Promise<number>) => {
      if (!permissionSet.has(permission)) {
        return;
      }
      countTasks.push(
        task().then((value) => {
          counts[key] = value;
        }),
      );
    };

    addCount("invoices", Permissions.INVOICE_READ, () =>
      this.prisma.invoice.count({ where: { orgId, status: "DRAFT" } }),
    );
    addCount("paymentsReceived", Permissions.PAYMENT_RECEIVED_READ, () =>
      this.prisma.paymentReceived.count({ where: { orgId, status: "DRAFT" } }),
    );
    addCount("bills", Permissions.BILL_READ, () =>
      this.prisma.bill.count({ where: { orgId, status: "DRAFT" } }),
    );
    addCount("expenses", Permissions.EXPENSE_READ, () =>
      this.prisma.expense.count({ where: { orgId, status: "DRAFT" } }),
    );
    addCount("vendorPayments", Permissions.VENDOR_PAYMENT_READ, () =>
      this.prisma.vendorPayment.count({ where: { orgId, status: "DRAFT" } }),
    );
    addCount("pdc", Permissions.PDC_READ, () =>
      this.prisma.pdc.count({
        where: { orgId, status: { in: ["DRAFT", "SCHEDULED", "DEPOSITED"] } },
      }),
    );
    addCount("journals", Permissions.JOURNAL_READ, () =>
      this.prisma.journalEntry.count({ where: { orgId, status: "DRAFT" } }),
    );

    await Promise.all(countTasks);
    return counts;
  }

  async updateCurrentOrg(orgId?: string, actorUserId?: string, input?: OrgUpdateInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      return this.getCurrentOrg(orgId);
    }

    const before = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!before) {
      throw new NotFoundException("Organization not found");
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: input,
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ORG",
      entityId: orgId,
      action: AuditAction.UPDATE,
      before,
      after: updated,
    });

    await this.syncOnboardingProgress(orgId, actorUserId);
    return updated;
  }

  async updateOrgSettings(orgId?: string, actorUserId?: string, input?: OrgSettingsUpdateInput, auditReason?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      return this.prisma.orgSettings.findUnique({ where: { orgId } });
    }

    const settings = await this.prisma.$transaction(async (tx) => {
      const before = await tx.orgSettings.findUnique({ where: { orgId } });
      const hasNumberingUpdate =
        input.invoicePrefix !== undefined ||
        input.invoiceNextNumber !== undefined ||
        input.billPrefix !== undefined ||
        input.billNextNumber !== undefined ||
        input.expensePrefix !== undefined ||
        input.expenseNextNumber !== undefined ||
        input.paymentPrefix !== undefined ||
        input.paymentNextNumber !== undefined ||
        input.vendorPaymentPrefix !== undefined ||
        input.vendorPaymentNextNumber !== undefined ||
        input.numberingFormats !== undefined;

      const currentFormats = resolveNumberingFormats(before);
      let mergedFormats = currentFormats;
      if (input.numberingFormats) {
        mergedFormats = {
          invoice: { ...currentFormats.invoice, ...(input.numberingFormats.invoice ?? {}) },
          bill: { ...currentFormats.bill, ...(input.numberingFormats.bill ?? {}) },
          expense: { ...currentFormats.expense, ...(input.numberingFormats.expense ?? {}) },
          payment: { ...currentFormats.payment, ...(input.numberingFormats.payment ?? {}) },
          vendorPayment: {
            ...currentFormats.vendorPayment,
            ...(input.numberingFormats.vendorPayment ?? {}),
          },
        };
      }
      if (
        input.invoicePrefix !== undefined ||
        input.invoiceNextNumber !== undefined ||
        input.billPrefix !== undefined ||
        input.billNextNumber !== undefined ||
        input.expensePrefix !== undefined ||
        input.expenseNextNumber !== undefined ||
        input.paymentPrefix !== undefined ||
        input.paymentNextNumber !== undefined ||
        input.vendorPaymentPrefix !== undefined ||
        input.vendorPaymentNextNumber !== undefined
      ) {
        mergedFormats = {
          invoice: {
            prefix: input.invoicePrefix ?? mergedFormats.invoice.prefix,
            nextNumber: input.invoiceNextNumber ?? mergedFormats.invoice.nextNumber,
          },
          bill: {
            prefix: input.billPrefix ?? mergedFormats.bill.prefix,
            nextNumber: input.billNextNumber ?? mergedFormats.bill.nextNumber,
          },
          expense: {
            prefix: input.expensePrefix ?? mergedFormats.expense.prefix,
            nextNumber: input.expenseNextNumber ?? mergedFormats.expense.nextNumber,
          },
          payment: {
            prefix: input.paymentPrefix ?? mergedFormats.payment.prefix,
            nextNumber: input.paymentNextNumber ?? mergedFormats.payment.nextNumber,
          },
          vendorPayment: {
            prefix: input.vendorPaymentPrefix ?? mergedFormats.vendorPayment.prefix,
            nextNumber: input.vendorPaymentNextNumber ?? mergedFormats.vendorPayment.nextNumber,
          },
        };
      }

      const nextNumberingFormats = hasNumberingUpdate ? mergedFormats : undefined;

      const [
        defaultArAccount,
        defaultApAccount,
        defaultInventoryAccount,
        defaultFixedAssetAccount,
        defaultCogsAccount,
      ] = await Promise.all([
        tx.account.findFirst({ where: { orgId, subtype: "AR" } }),
        tx.account.findFirst({ where: { orgId, subtype: "AP" } }),
        tx.account.findFirst({ where: { orgId, code: "1400" } }),
        tx.account.findFirst({ where: { orgId, code: "1500" } }),
        tx.account.findFirst({ where: { orgId, code: "5100" } }),
      ]);

      const updateData = {
        ...input,
        ...(nextNumberingFormats ? applyNumberingUpdate(nextNumberingFormats) : {}),
      };

      const baseFormats = nextNumberingFormats ?? currentFormats;
      const settings = await tx.orgSettings.upsert({
        where: { orgId },
        update: updateData,
        create: {
          orgId,
          defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
          defaultVatBehavior: "EXCLUSIVE",
          reportBasis: "ACCRUAL",
          defaultArAccountId: defaultArAccount?.id ?? null,
          defaultApAccountId: defaultApAccount?.id ?? null,
          defaultInventoryAccountId: defaultInventoryAccount?.id ?? null,
          defaultFixedAssetAccountId: defaultFixedAssetAccount?.id ?? null,
          defaultCogsAccountId: defaultCogsAccount?.id ?? null,
          negativeStockPolicy: "ALLOW",
          ...applyNumberingUpdate(baseFormats),
          ...updateData,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "ORG_SETTINGS",
          entityId: orgId,
          action: AuditAction.SETTINGS_CHANGE,
          before: before ?? undefined,
          after: auditReason ? { ...settings, auditReason } : settings,
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return settings;
    });

    await this.syncOnboardingProgress(orgId, actorUserId);
    return settings;
  }

  async listRoles(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    return this.prisma.role.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    });
  }

  async listOrgDirectory() {
    const orgs = await this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        countryCode: true,
        baseCurrency: true,
        vatEnabled: true,
        createdAt: true,
        updatedAt: true,
        orgSettings: {
          select: {
            lockDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const orgIds = orgs.map((org) => org.id);
    const membershipCounts = orgIds.length
      ? await this.prisma.membership.groupBy({
          by: ["orgId"],
          where: {
            orgId: { in: orgIds },
            isActive: true,
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const memberCountByOrgId = new Map(membershipCounts.map((row) => [row.orgId, row._count._all]));

    const onboardingGroups = orgIds.length
      ? await this.prisma.onboardingProgress.groupBy({
          by: ["orgId"],
          where: { orgId: { in: orgIds } },
          _count: { _all: true },
          _max: { completedAt: true },
        })
      : [];

    const onboardingByOrgId = new Map(
      onboardingGroups.map((row) => [row.orgId, { count: row._count._all, completedAt: row._max.completedAt }]),
    );

    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      isActive: org.isActive,
      countryCode: org.countryCode,
      baseCurrency: org.baseCurrency,
      vatEnabled: org.vatEnabled,
      lockDate: org.orgSettings?.lockDate ?? null,
      userCount: memberCountByOrgId.get(org.id) ?? 0,
      onboardingSetupStatus: (() => {
        const progress = onboardingByOrgId.get(org.id);
        if (!progress) {
          return "NOT_STARTED" as const;
        }
        if (progress.completedAt) {
          return "COMPLETED" as const;
        }
        return progress.count > 0 ? ("IN_PROGRESS" as const) : ("NOT_STARTED" as const);
      })(),
      onboardingCompletedAt: onboardingByOrgId.get(org.id)?.completedAt ?? null,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    }));
  }

  async updateOrgActiveStatus(orgId: string, actorUserId: string | undefined, isActive: boolean, auditReason: string) {
    const before = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!before) {
      throw new NotFoundException("Organization not found");
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { isActive },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ORG",
      entityId: orgId,
      action: AuditAction.UPDATE,
      before,
      after: { ...updated, auditReason },
    });

    return updated;
  }

  async updateOrgLockDate(
    orgId: string,
    actorUserId: string | undefined,
    lockDate: Date | null,
    auditReason: string,
  ) {
    return this.updateOrgSettings(orgId, actorUserId, { lockDate }, auditReason);
  }

  async resetOrgSettings(orgId: string, actorUserId: string | undefined, auditReason: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const settings = await this.prisma.$transaction(async (tx) => {
      const before = await tx.orgSettings.findUnique({ where: { orgId } });
      const formats = resolveNumberingFormats(null);

      const [
        defaultArAccount,
        defaultApAccount,
        defaultInventoryAccount,
        defaultFixedAssetAccount,
        defaultCogsAccount,
      ] = await Promise.all([
        tx.account.findFirst({ where: { orgId, subtype: "AR" } }),
        tx.account.findFirst({ where: { orgId, subtype: "AP" } }),
        tx.account.findFirst({ where: { orgId, code: "1400" } }),
        tx.account.findFirst({ where: { orgId, code: "1500" } }),
        tx.account.findFirst({ where: { orgId, code: "5100" } }),
      ]);

      const updateData = {
        defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
        defaultVatBehavior: "EXCLUSIVE" as const,
        reportBasis: "ACCRUAL" as const,
        defaultArAccountId: defaultArAccount?.id ?? null,
        defaultApAccountId: defaultApAccount?.id ?? null,
        defaultInventoryAccountId: defaultInventoryAccount?.id ?? null,
        defaultFixedAssetAccountId: defaultFixedAssetAccount?.id ?? null,
        defaultCogsAccountId: defaultCogsAccount?.id ?? null,
        negativeStockPolicy: "ALLOW" as const,
        lockDate: null,
        ...applyNumberingUpdate(formats),
      };

      const settings = await tx.orgSettings.upsert({
        where: { orgId },
        update: updateData,
        create: { orgId, ...updateData },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "ORG_SETTINGS",
          entityId: orgId,
          action: AuditAction.SETTINGS_CHANGE,
          before: before ?? undefined,
          after: { ...settings, auditReason },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return settings;
    });

    await this.syncOnboardingProgress(orgId, actorUserId);
    return settings;
  }

  private async syncOnboardingProgress(orgId: string, actorUserId?: string) {
    if (!actorUserId) {
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: { orgId, userId: actorUserId, isActive: true },
      select: {
        id: true,
        role: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      return;
    }

    await this.onboarding.ensureProgress({
      orgId,
      userId: actorUserId,
      membershipId: membership.id,
      roleName: membership.role?.name ?? null,
    });
  }
}
