import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuditAction } from "@prisma/client";
import { Permissions } from "@ledgerlite/shared";
import type { OrgCreateInput, OrgSettingsUpdateInput, OrgUpdateInput } from "@ledgerlite/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { getApiEnv } from "../../common/env";
import { RequestContext } from "../../logging/request-context";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash", type: "ASSET", subtype: "CASH" },
  { code: "1010", name: "Bank", type: "ASSET", subtype: "BANK" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "AR" },
  { code: "1200", name: "VAT Receivable", type: "ASSET", subtype: "VAT_RECEIVABLE" },
  { code: "1300", name: "Vendor Prepayments", type: "ASSET", subtype: "VENDOR_PREPAYMENTS" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "AP" },
  { code: "2100", name: "VAT Payable", type: "LIABILITY", subtype: "VAT_PAYABLE" },
  { code: "2200", name: "Customer Advances", type: "LIABILITY", subtype: "CUSTOMER_ADVANCES" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY", subtype: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "INCOME", subtype: "SALES" },
  { code: "5000", name: "General Expenses", type: "EXPENSE", subtype: "EXPENSE" },
] as const;

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
  paymentPrefix: "PAY-",
  paymentNextNumber: 1,
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentNextNumber: 1,
} as const;

const DEFAULT_NUMBERING_FORMATS = {
  invoice: { prefix: DEFAULT_NUMBERING.invoicePrefix, nextNumber: DEFAULT_NUMBERING.invoiceNextNumber },
  bill: { prefix: DEFAULT_NUMBERING.billPrefix, nextNumber: DEFAULT_NUMBERING.billNextNumber },
  payment: { prefix: DEFAULT_NUMBERING.paymentPrefix, nextNumber: DEFAULT_NUMBERING.paymentNextNumber },
  vendorPayment: { prefix: DEFAULT_NUMBERING.vendorPaymentPrefix, nextNumber: DEFAULT_NUMBERING.vendorPaymentNextNumber },
} as const;

const DEFAULT_PAYMENT_TERMS_DAYS = 30;

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
      Permissions.BANK_READ,
      Permissions.BANK_WRITE,
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
      Permissions.VENDOR_PAYMENT_READ,
      Permissions.VENDOR_PAYMENT_WRITE,
      Permissions.VENDOR_PAYMENT_POST,
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
  ) {}

  async createOrg(input: OrgCreateInput, idempotencyKey?: string, userId?: string) {
    if (!userId) {
      throw new ConflictException("Missing user context for organization creation");
    }

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingOrg = await this.prisma.organization.findFirst({
        where: {
          name: input.name,
          memberships: { some: { userId } },
        },
      });
      if (existingOrg) {
        const existingKey = await this.prisma.idempotencyKey.findUnique({
          where: { orgId_key: { orgId: existingOrg.id, key: idempotencyKey } },
        });
        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            throw new ConflictException("Idempotency key already used with different payload");
          }
          return existingKey.response;
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
          isSystem: true,
          isActive: true,
        })),
      });

      const [defaultArAccount, defaultApAccount] = await Promise.all([
        tx.account.findFirst({ where: { orgId: org.id, subtype: "AR" } }),
        tx.account.findFirst({ where: { orgId: org.id, subtype: "AP" } }),
      ]);

      await tx.orgSettings.create({
        data: {
          orgId: org.id,
          invoicePrefix: DEFAULT_NUMBERING.invoicePrefix,
          invoiceNextNumber: DEFAULT_NUMBERING.invoiceNextNumber,
          billPrefix: DEFAULT_NUMBERING.billPrefix,
          billNextNumber: DEFAULT_NUMBERING.billNextNumber,
          paymentPrefix: DEFAULT_NUMBERING.paymentPrefix,
          paymentNextNumber: DEFAULT_NUMBERING.paymentNextNumber,
          vendorPaymentPrefix: DEFAULT_NUMBERING.vendorPaymentPrefix,
          vendorPaymentNextNumber: DEFAULT_NUMBERING.vendorPaymentNextNumber,
          defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
          defaultVatBehavior: "EXCLUSIVE",
          reportBasis: "ACCRUAL",
          defaultArAccountId: defaultArAccount?.id ?? null,
          defaultApAccountId: defaultApAccount?.id ?? null,
          numberingFormats: DEFAULT_NUMBERING_FORMATS,
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
        },
      });

      return { org, membership };
    });

    const env = getApiEnv();
    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        orgId: result.org.id,
        membershipId: result.membership.id,
        roleId: result.membership.roleId,
      },
      {
        secret: env.API_JWT_SECRET,
        expiresIn: env.API_JWT_ACCESS_TTL,
      },
    );

    const response = {
      org: result.org,
      accessToken,
    };

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId: result.org.id,
          key: idempotencyKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }

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
      vendorPayments?: number;
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
    addCount("vendorPayments", Permissions.VENDOR_PAYMENT_READ, () =>
      this.prisma.vendorPayment.count({ where: { orgId, status: "DRAFT" } }),
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

    return updated;
  }

  async updateOrgSettings(orgId?: string, actorUserId?: string, input?: OrgSettingsUpdateInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      return this.prisma.orgSettings.findUnique({ where: { orgId } });
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.orgSettings.findUnique({ where: { orgId } });
      const hasNumberingUpdate =
        input.invoicePrefix !== undefined ||
        input.invoiceNextNumber !== undefined ||
        input.billPrefix !== undefined ||
        input.billNextNumber !== undefined ||
        input.paymentPrefix !== undefined ||
        input.paymentNextNumber !== undefined ||
        input.vendorPaymentPrefix !== undefined ||
        input.vendorPaymentNextNumber !== undefined ||
        input.numberingFormats !== undefined;

      const nextNumberingFormats =
        input.numberingFormats ??
        (hasNumberingUpdate
          ? {
              invoice: {
                prefix:
                  input.invoicePrefix ??
                  before?.invoicePrefix ??
                  DEFAULT_NUMBERING.invoicePrefix,
                nextNumber:
                  input.invoiceNextNumber ??
                  before?.invoiceNextNumber ??
                  DEFAULT_NUMBERING.invoiceNextNumber,
              },
              bill: {
                prefix: input.billPrefix ?? before?.billPrefix ?? DEFAULT_NUMBERING.billPrefix,
                nextNumber:
                  input.billNextNumber ?? before?.billNextNumber ?? DEFAULT_NUMBERING.billNextNumber,
              },
              payment: {
                prefix:
                  input.paymentPrefix ?? before?.paymentPrefix ?? DEFAULT_NUMBERING.paymentPrefix,
                nextNumber:
                  input.paymentNextNumber ??
                  before?.paymentNextNumber ??
                  DEFAULT_NUMBERING.paymentNextNumber,
              },
              vendorPayment: {
                prefix:
                  input.vendorPaymentPrefix ??
                  before?.vendorPaymentPrefix ??
                  DEFAULT_NUMBERING.vendorPaymentPrefix,
                nextNumber:
                  input.vendorPaymentNextNumber ??
                  before?.vendorPaymentNextNumber ??
                  DEFAULT_NUMBERING.vendorPaymentNextNumber,
              },
            }
          : undefined);

      const [defaultArAccount, defaultApAccount] = await Promise.all([
        tx.account.findFirst({ where: { orgId, subtype: "AR" } }),
        tx.account.findFirst({ where: { orgId, subtype: "AP" } }),
      ]);

      const updateData = {
        ...input,
        ...(nextNumberingFormats ? { numberingFormats: nextNumberingFormats } : {}),
      };

      const settings = await tx.orgSettings.upsert({
        where: { orgId },
        update: updateData,
        create: {
          orgId,
          invoicePrefix: DEFAULT_NUMBERING.invoicePrefix,
          invoiceNextNumber: DEFAULT_NUMBERING.invoiceNextNumber,
          billPrefix: DEFAULT_NUMBERING.billPrefix,
          billNextNumber: DEFAULT_NUMBERING.billNextNumber,
          paymentPrefix: DEFAULT_NUMBERING.paymentPrefix,
          paymentNextNumber: DEFAULT_NUMBERING.paymentNextNumber,
          vendorPaymentPrefix: DEFAULT_NUMBERING.vendorPaymentPrefix,
          vendorPaymentNextNumber: DEFAULT_NUMBERING.vendorPaymentNextNumber,
          defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
          defaultVatBehavior: "EXCLUSIVE",
          reportBasis: "ACCRUAL",
          defaultArAccountId: defaultArAccount?.id ?? null,
          defaultApAccountId: defaultApAccount?.id ?? null,
          numberingFormats: nextNumberingFormats ?? DEFAULT_NUMBERING_FORMATS,
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
          after: settings,
          requestId: RequestContext.get()?.requestId,
        },
      });

      return settings;
    });
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
}
