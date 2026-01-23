import { AuditAction, DocumentStatus, ItemType, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import argon2 from "argon2";
import { Permissions } from "@ledgerlite/shared";
import { calculateInvoiceLines, buildInvoicePostingLines } from "../src/invoices.utils";
import { calculateBillLines, buildBillPostingLines } from "../src/bills.utils";
import { calculatePaymentTotal, buildPaymentPostingLines } from "../src/payments-received.utils";
import { calculateVendorPaymentTotal, buildVendorPaymentPostingLines } from "../src/vendor-payments.utils";
import { dec, round2 } from "../src/common/money";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding");
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SYSTEM_ROLES = [
  { name: "Owner", isSystem: true },
  { name: "Accountant", isSystem: true },
  { name: "Sales", isSystem: true },
  { name: "Purchases", isSystem: true },
  { name: "Viewer", isSystem: true },
];

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

const seedUnitsForOrg = async (orgId: string) => {
  const baseMap = new Map<string, string>();
  for (const unit of BASE_UNITS) {
    const created = await prisma.unitOfMeasure.upsert({
      where: { orgId_name: { orgId, name: unit.name } },
      update: {
        symbol: unit.symbol,
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
      create: {
        orgId,
        name: unit.name,
        symbol: unit.symbol,
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
    });
    baseMap.set(unit.name, created.id);
  }

  for (const unit of DERIVED_UNITS) {
    const baseUnitId = baseMap.get(unit.base);
    if (!baseUnitId) {
      continue;
    }
    await prisma.unitOfMeasure.upsert({
      where: { orgId_name: { orgId, name: unit.name } },
      update: {
        symbol: unit.symbol,
        baseUnitId,
        conversionRate: unit.conversionRate,
        isActive: true,
      },
      create: {
        orgId,
        name: unit.name,
        symbol: unit.symbol,
        baseUnitId,
        conversionRate: unit.conversionRate,
        isActive: true,
      },
    });
  }

  return baseMap;
};

async function main() {
  const permissionCodes = Object.values(Permissions);
  const permissions = permissionCodes.map((code) => ({
    code,
    description: `System permission: ${code}`,
  }));

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
  }

  let org = await prisma.organization.findFirst({
    where: { name: "Demo Org" },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Demo Org",
        baseCurrency: "AED",
        countryCode: "AE",
        vatEnabled: true,
        timeZone: "Asia/Dubai",
      },
    });
  }

  const baseUnitMap = await seedUnitsForOrg(org.id);
  const eachUnitId = baseUnitMap.get("Each");
  if (!eachUnitId) {
    throw new Error("Seed failed to create base unit Each");
  }

  await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((account) => ({
      orgId: org.id,
      code: account.code,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      isSystem: true,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const bankGlAccount =
    (await prisma.account.findFirst({ where: { orgId: org.id, subtype: "BANK" } })) ??
    (await prisma.account.findFirst({ where: { orgId: org.id, subtype: "CASH" } }));

  if (bankGlAccount) {
    await prisma.bankAccount.upsert({
      where: { orgId_name: { orgId: org.id, name: "Operating Bank" } },
      update: {
        currency: org.baseCurrency ?? "AED",
        glAccountId: bankGlAccount.id,
        isActive: true,
      },
      create: {
        orgId: org.id,
        name: "Operating Bank",
        currency: org.baseCurrency ?? "AED",
        glAccountId: bankGlAccount.id,
        isActive: true,
      },
    });
  }

  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: {
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
      vendorPaymentPrefix: "VPAY-",
      vendorPaymentNextNumber: 1,
    },
    create: {
      orgId: org.id,
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
      vendorPaymentPrefix: "VPAY-",
      vendorPaymentNextNumber: 1,
    },
  });

  const roles = [];
  for (const role of SYSTEM_ROLES) {
    const created = await prisma.role.upsert({
      where: { orgId_name: { orgId: org.id, name: role.name } },
      update: {},
      create: { ...role, orgId: org.id },
    });
    roles.push(created);
  }

  const ownerRole = roles.find((role) => role.name === "Owner");
  if (ownerRole) {
    for (const code of permissionCodes) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionCode: { roleId: ownerRole.id, permissionCode: code } },
        update: {},
        create: { roleId: ownerRole.id, permissionCode: code },
      });
    }
  }

  const passwordHash = await argon2.hash("Password123!");
  const user = await prisma.user.upsert({
    where: { email: "owner@ledgerlite.local" },
    update: {},
    create: {
      email: "owner@ledgerlite.local",
      passwordHash,
      isActive: true,
    },
  });

  if (ownerRole) {
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: {},
      create: {
        orgId: org.id,
        userId: user.id,
        roleId: ownerRole.id,
        isActive: true,
      },
    });
  }

  let lockOrg = await prisma.organization.findFirst({
    where: { name: "Lock Date Org" },
  });
  if (!lockOrg) {
    lockOrg = await prisma.organization.create({
      data: {
        name: "Lock Date Org",
        baseCurrency: "AED",
        countryCode: "AE",
        vatEnabled: false,
        timeZone: "Asia/Dubai",
      },
    });
  }

  const lockBaseUnitMap = await seedUnitsForOrg(lockOrg.id);
  const lockEachUnitId = lockBaseUnitMap.get("Each");
  if (!lockEachUnitId) {
    throw new Error("Seed failed to create base unit Each for lock org");
  }

  await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((account) => ({
      orgId: lockOrg.id,
      code: account.code,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      isSystem: true,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const lockBankGlAccount =
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, subtype: "BANK" } })) ??
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, subtype: "CASH" } }));

  if (lockBankGlAccount) {
    await prisma.bankAccount.upsert({
      where: { orgId_name: { orgId: lockOrg.id, name: "Operating Bank" } },
      update: {
        currency: lockOrg.baseCurrency ?? "AED",
        glAccountId: lockBankGlAccount.id,
        isActive: true,
      },
      create: {
        orgId: lockOrg.id,
        name: "Operating Bank",
        currency: lockOrg.baseCurrency ?? "AED",
        glAccountId: lockBankGlAccount.id,
        isActive: true,
      },
    });
  }

  const lockDate = new Date();
  lockDate.setUTCDate(lockDate.getUTCDate() + 1);
  lockDate.setUTCHours(0, 0, 0, 0);
  await prisma.orgSettings.upsert({
    where: { orgId: lockOrg.id },
    update: {
      lockDate,
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
      vendorPaymentPrefix: "VPAY-",
      vendorPaymentNextNumber: 1,
    },
    create: {
      orgId: lockOrg.id,
      lockDate,
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
      vendorPaymentPrefix: "VPAY-",
      vendorPaymentNextNumber: 1,
    },
  });

  const lockRoles = [];
  for (const role of SYSTEM_ROLES) {
    const created = await prisma.role.upsert({
      where: { orgId_name: { orgId: lockOrg.id, name: role.name } },
      update: {},
      create: { ...role, orgId: lockOrg.id },
    });
    lockRoles.push(created);
  }

  const lockOwnerRole = lockRoles.find((role) => role.name === "Owner");
  if (lockOwnerRole) {
    for (const code of permissionCodes) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionCode: { roleId: lockOwnerRole.id, permissionCode: code } },
        update: {},
        create: { roleId: lockOwnerRole.id, permissionCode: code },
      });
    }
  }

  const lockUser = await prisma.user.upsert({
    where: { email: "lock@ledgerlite.local" },
    update: {},
    create: {
      email: "lock@ledgerlite.local",
      passwordHash,
      isActive: true,
    },
  });

  if (lockOwnerRole) {
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: lockOrg.id, userId: lockUser.id } },
      update: {},
      create: {
        orgId: lockOrg.id,
        userId: lockUser.id,
        roleId: lockOwnerRole.id,
        isActive: true,
      },
    });
  }

  const lockCustomer = await prisma.customer.findFirst({
    where: { orgId: lockOrg.id, name: "Lock Customer" },
  });
  if (!lockCustomer) {
    await prisma.customer.create({
      data: {
        orgId: lockOrg.id,
        name: "Lock Customer",
        email: "lock@ledgerlite.local",
        phone: "+971500000099",
        paymentTermsDays: 7,
        isActive: true,
      },
    });
  }

  const lockIncomeAccount =
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, subtype: "SALES" } })) ??
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, type: "INCOME" } }));
  const lockExpenseAccount =
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, subtype: "EXPENSE" } })) ??
    (await prisma.account.findFirst({ where: { orgId: lockOrg.id, type: "EXPENSE" } }));

  if (lockIncomeAccount && lockExpenseAccount) {
    const existingLockItem = await prisma.item.findFirst({ where: { orgId: lockOrg.id, name: "Lock Service" } });
    if (!existingLockItem) {
      await prisma.item.create({
        data: {
          orgId: lockOrg.id,
          name: "Lock Service",
          type: ItemType.SERVICE,
          sku: "LOCK-001",
          salePrice: 100,
          purchasePrice: 50,
          incomeAccountId: lockIncomeAccount.id,
          expenseAccountId: lockExpenseAccount.id,
          unitOfMeasureId: lockEachUnitId,
          isActive: true,
        },
      });
    }
  }

  if (org.vatEnabled) {
    const taxCodes = [
      { name: "VAT 5%", rate: 5, type: "STANDARD" },
      { name: "Zero Rated", rate: 0, type: "ZERO" },
      { name: "Exempt", rate: 0, type: "EXEMPT" },
      { name: "Out of Scope", rate: 0, type: "OUT_OF_SCOPE" },
    ] as const;

    for (const taxCode of taxCodes) {
      await prisma.taxCode.upsert({
        where: { orgId_name: { orgId: org.id, name: taxCode.name } },
        update: { rate: taxCode.rate, type: taxCode.type, isActive: true },
        create: { orgId: org.id, ...taxCode, isActive: true },
      });
    }
  }

  const customers = [
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
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({ where: { orgId: org.id, name: customer.name } });
    if (!existing) {
      await prisma.customer.create({
        data: {
          orgId: org.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress,
          paymentTermsDays: customer.paymentTermsDays,
          creditLimit: customer.creditLimit,
          isActive: true,
        },
      });
    }
  }

  const vendors = [
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
  ];

  for (const vendor of vendors) {
    const existing = await prisma.vendor.findFirst({ where: { orgId: org.id, name: vendor.name } });
    if (!existing) {
      await prisma.vendor.create({
        data: {
          orgId: org.id,
          name: vendor.name,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          paymentTermsDays: vendor.paymentTermsDays,
          isActive: true,
        },
      });
    }
  }

  const incomeAccount =
    (await prisma.account.findFirst({ where: { orgId: org.id, subtype: "SALES" } })) ??
    (await prisma.account.findFirst({ where: { orgId: org.id, type: "INCOME" } }));
  const itemExpenseAccount =
    (await prisma.account.findFirst({ where: { orgId: org.id, subtype: "EXPENSE" } })) ??
    (await prisma.account.findFirst({ where: { orgId: org.id, type: "EXPENSE" } }));
  const defaultTax = org.vatEnabled
    ? await prisma.taxCode.findFirst({ where: { orgId: org.id, name: "VAT 5%" } })
    : null;

  if (incomeAccount && itemExpenseAccount) {
    const items = [
      {
        name: "Consulting Services",
        type: ItemType.SERVICE,
        sku: "CONSULT-01",
        salePrice: 250,
        purchasePrice: 150,
        defaultTaxCodeId: defaultTax?.id,
      },
      {
        name: "Office Supplies Pack",
        type: ItemType.PRODUCT,
        sku: "SUP-100",
        salePrice: 75,
        purchasePrice: 40,
        defaultTaxCodeId: defaultTax?.id,
      },
    ];

    for (const item of items) {
      const existing = await prisma.item.findFirst({ where: { orgId: org.id, name: item.name } });
      if (!existing) {
        await prisma.item.create({
          data: {
            orgId: org.id,
            name: item.name,
            type: item.type,
            sku: item.sku,
            salePrice: item.salePrice,
            purchasePrice: item.purchasePrice,
            incomeAccountId: incomeAccount.id,
            expenseAccountId: itemExpenseAccount.id,
            defaultTaxCodeId: item.defaultTaxCodeId ?? undefined,
            unitOfMeasureId: eachUnitId,
            isActive: true,
          },
        });
      }
    }
  }

  const seedTransactions = process.env.SEED_TRANSACTIONS === "true";
  if (!seedTransactions) {
    return;
  }

  const seedRequestId = "seed";
  const currency = org.baseCurrency ?? "AED";
  const baseDate = new Date();
  const dateWithOffset = (offsetDays: number) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + offsetDays);
    date.setHours(12, 0, 0, 0);
    return date;
  };

  const ensureAuditLog = async (data: Prisma.AuditLogUncheckedCreateInput) => {
    const existing = await prisma.auditLog.findFirst({
      where: {
        orgId: data.orgId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
      },
    });
    if (!existing) {
      await prisma.auditLog.create({ data });
    }
  };

  const ensureGlHeader = async (data: Prisma.GLHeaderUncheckedCreateInput) => {
    const existing = await prisma.gLHeader.findUnique({
      where: {
        orgId_sourceType_sourceId: {
          orgId: data.orgId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
        },
      },
    });
    if (!existing) {
      await prisma.gLHeader.create({ data });
    }
  };

  const resolvePaymentStatus = (total: Prisma.Decimal, paid: Prisma.Decimal) => {
    const roundedTotal = round2(total);
    const roundedPaid = round2(paid);
    if (roundedPaid.greaterThan(0) && roundedPaid.lessThan(roundedTotal)) {
      return PaymentStatus.PARTIAL;
    }
    if (roundedPaid.equals(roundedTotal)) {
      return PaymentStatus.PAID;
    }
    return PaymentStatus.UNPAID;
  };

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { orgId: org.id, isActive: true },
  });
  if (!bankAccount) {
    throw new Error("Seed requires an active bank account");
  }

  const accounts = await prisma.account.findMany({
    where: { orgId: org.id, isActive: true },
  });
  const accountBySubtype = new Map(
    accounts
      .filter((account) => account.subtype)
      .map((account) => [account.subtype as string, account]),
  );

  const arAccount = accountBySubtype.get("AR");
  const apAccount = accountBySubtype.get("AP");
  const vatPayableAccount = accountBySubtype.get("VAT_PAYABLE");
  const vatReceivableAccount = accountBySubtype.get("VAT_RECEIVABLE");
  const equityAccount = accountBySubtype.get("EQUITY");
  const expenseAccount = accountBySubtype.get("EXPENSE");

  if (!arAccount || !apAccount || !equityAccount || !expenseAccount) {
    throw new Error("Seed requires AR, AP, equity, and expense accounts");
  }
  if (org.vatEnabled && (!vatPayableAccount || !vatReceivableAccount)) {
    throw new Error("Seed requires VAT payable and receivable accounts when VAT is enabled");
  }

  const items = await prisma.item.findMany({
    where: { orgId: org.id, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      incomeAccountId: true,
      expenseAccountId: true,
      defaultTaxCodeId: true,
    },
  });
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsBySku = new Map(items.map((item) => [item.sku ?? item.name, item]));
  const itemsByIdForPosting = new Map(items.map((item) => [item.id, { incomeAccountId: item.incomeAccountId }]));

  const taxCodes = await prisma.taxCode.findMany({
    where: { orgId: org.id, isActive: true },
    select: { id: true, name: true, rate: true, type: true },
  });
  const taxCodesById = new Map(
    taxCodes.map((tax) => [tax.id, { id: tax.id, rate: Number(tax.rate), type: tax.type }]),
  );
  const vatTax = taxCodes.find((tax) => tax.name === "VAT 5%");

  const customersByName = new Map(
    (await prisma.customer.findMany({ where: { orgId: org.id, isActive: true } })).map((customer) => [
      customer.name,
      customer,
    ]),
  );
  const vendorsByName = new Map(
    (await prisma.vendor.findMany({ where: { orgId: org.id, isActive: true } })).map((vendor) => [
      vendor.name,
      vendor,
    ]),
  );

  const openingJournalNumber = "JRN-OPEN-001";
  const openingBalance = dec(50000);
  const existingOpeningJournal = await prisma.journalEntry.findFirst({
    where: { orgId: org.id, number: openingJournalNumber },
    include: { lines: true },
  });
  if (!existingOpeningJournal) {
    const journalDate = dateWithOffset(-150);
    const journal = await prisma.journalEntry.create({
      data: {
        orgId: org.id,
        number: openingJournalNumber,
        status: DocumentStatus.POSTED,
        journalDate,
        memo: "Opening balance",
        postedAt: journalDate,
        createdByUserId: user.id,
        lines: {
          createMany: {
            data: [
              {
                lineNo: 1,
                accountId: bankAccount.glAccountId,
                debit: openingBalance,
                credit: dec(0),
                description: "Opening balance",
              },
              {
                lineNo: 2,
                accountId: equityAccount.id,
                debit: dec(0),
                credit: openingBalance,
                description: "Owner capital",
              },
            ],
          },
        },
      },
      include: { lines: true },
    });

    await ensureGlHeader({
      orgId: org.id,
      sourceType: "JOURNAL",
      sourceId: journal.id,
      postingDate: journal.postedAt ?? journalDate,
      currency,
      totalDebit: openingBalance,
      totalCredit: openingBalance,
      status: "POSTED",
      createdByUserId: user.id,
      memo: journal.memo ?? "Opening balance",
      lines: {
        createMany: {
          data: journal.lines.map((line) => ({
            lineNo: line.lineNo,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description ?? undefined,
            customerId: line.customerId ?? undefined,
            vendorId: line.vendorId ?? undefined,
          })),
        },
      },
    });

    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "JOURNAL",
      entityId: journal.id,
      action: AuditAction.CREATE,
      after: journal,
      requestId: seedRequestId,
    });
    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "JOURNAL",
      entityId: journal.id,
      action: AuditAction.POST,
      after: journal,
      requestId: seedRequestId,
    });
  }

  const invoiceDefinitions = [
    {
      number: "INV-1001",
      customerName: "Acme Trading LLC",
      invoiceDateOffset: 0,
      dueDateOffset: 15,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Consulting retainer",
          qty: 8,
          unitPrice: 250,
        },
      ],
    },
    {
      number: "INV-1002",
      customerName: "Globex Hospitality",
      invoiceDateOffset: -35,
      dueDateOffset: -10,
      lines: [
        {
          itemSku: "SUP-100",
          description: "Kitchen supplies pack",
          qty: 30,
          unitPrice: 75,
        },
      ],
    },
    {
      number: "INV-1003",
      customerName: "Acme Trading LLC",
      invoiceDateOffset: -65,
      dueDateOffset: -40,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Quarterly advisory",
          qty: 12,
          unitPrice: 250,
        },
      ],
    },
    {
      number: "INV-1004",
      customerName: "Globex Hospitality",
      invoiceDateOffset: -95,
      dueDateOffset: -70,
      lines: [
        {
          itemSku: "SUP-100",
          description: "Housekeeping supplies",
          qty: 40,
          unitPrice: 75,
        },
      ],
    },
    {
      number: "INV-1005",
      customerName: "Acme Trading LLC",
      invoiceDateOffset: -140,
      dueDateOffset: -120,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Process review",
          qty: 6,
          unitPrice: 250,
        },
      ],
    },
  ];

  const invoicesByNumber = new Map<string, Prisma.InvoiceGetPayload<{ include: { lines: true; customer: true } }>>();

  for (const invoiceDef of invoiceDefinitions) {
    const customer = customersByName.get(invoiceDef.customerName);
    if (!customer) {
      throw new Error(`Customer not found for seed invoice: ${invoiceDef.customerName}`);
    }
    const invoiceDate = dateWithOffset(invoiceDef.invoiceDateOffset);
    const dueDate = dateWithOffset(invoiceDef.dueDateOffset);

    let invoice = await prisma.invoice.findFirst({
      where: { orgId: org.id, number: invoiceDef.number },
      include: { lines: true, customer: true },
    });

    if (!invoice) {
      const lineInputs = invoiceDef.lines.map((line) => {
        const item = itemsBySku.get(line.itemSku);
        if (!item) {
          throw new Error(`Item not found for seed invoice line: ${line.itemSku}`);
        }
        return {
          itemId: item.id,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountAmount: 0,
          taxCodeId: vatTax?.id,
        };
      });

      const calculated = calculateInvoiceLines({
        lines: lineInputs,
        itemsById,
        taxCodesById,
        vatEnabled: org.vatEnabled,
      });

      invoice = await prisma.invoice.create({
        data: {
          orgId: org.id,
          number: invoiceDef.number,
          status: DocumentStatus.POSTED,
          paymentStatus: PaymentStatus.UNPAID,
          amountPaid: dec(0),
          customerId: customer.id,
          invoiceDate,
          dueDate,
          currency,
          subTotal: calculated.subTotal,
          taxTotal: calculated.taxTotal,
          total: calculated.total,
          notes: "Seeded invoice",
          postedAt: invoiceDate,
          createdByUserId: user.id,
          lines: {
            createMany: {
              data: calculated.lines.map((line) => ({
                lineNo: line.lineNo,
                itemId: line.itemId,
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
        include: { lines: true, customer: true },
      });

      await ensureAuditLog({
        orgId: org.id,
        actorUserId: user.id,
        entityType: "INVOICE",
        entityId: invoice.id,
        action: AuditAction.CREATE,
        after: invoice,
        requestId: seedRequestId,
      });
      await ensureAuditLog({
        orgId: org.id,
        actorUserId: user.id,
        entityType: "INVOICE",
        entityId: invoice.id,
        action: AuditAction.POST,
        after: invoice,
        requestId: seedRequestId,
      });
    }

    if (invoice) {
      const posting = buildInvoicePostingLines({
        invoiceNumber: invoice.number ?? invoiceDef.number,
        customerId: invoice.customerId,
        total: invoice.total,
        lines: invoice.lines.map((line) => ({
          itemId: line.itemId ?? undefined,
          lineSubTotal: line.lineSubTotal,
          lineTax: line.lineTax,
          taxCodeId: line.taxCodeId ?? undefined,
        })),
        itemsById: itemsByIdForPosting,
        arAccountId: arAccount.id,
        vatAccountId: vatPayableAccount?.id,
      });

      if (!dec(posting.totalDebit).equals(dec(posting.totalCredit))) {
        throw new Error(`Seed invoice posting is not balanced: ${invoice.number ?? invoiceDef.number}`);
      }

      await ensureGlHeader({
        orgId: org.id,
        sourceType: "INVOICE",
        sourceId: invoice.id,
        postingDate: invoice.postedAt ?? invoice.invoiceDate,
        currency: invoice.currency,
        exchangeRate: invoice.exchangeRate ?? undefined,
        totalDebit: posting.totalDebit,
        totalCredit: posting.totalCredit,
        status: "POSTED",
        createdByUserId: user.id,
        memo: `Invoice ${invoice.number ?? invoiceDef.number}`,
        lines: {
          createMany: {
            data: posting.lines.map((line) => ({
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
      });

      invoicesByNumber.set(invoice.number ?? invoiceDef.number, invoice);
    }
  }

  const billDefinitions = [
    {
      systemNumber: "BILL-1001",
      billNumber: "BILL-1001",
      vendorName: "Desert Office Supplies",
      billDateOffset: 0,
      dueDateOffset: 20,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Contractor services",
          qty: 8,
          unitPrice: 250,
        },
      ],
    },
    {
      systemNumber: "BILL-1002",
      billNumber: "BILL-1002",
      vendorName: "Metro Utilities",
      billDateOffset: -35,
      dueDateOffset: -10,
      lines: [
        {
          itemSku: "SUP-100",
          description: "Facility supplies",
          qty: 30,
          unitPrice: 75,
        },
      ],
    },
    {
      systemNumber: "BILL-1003",
      billNumber: "BILL-1003",
      vendorName: "Desert Office Supplies",
      billDateOffset: -65,
      dueDateOffset: -40,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Technical support",
          qty: 12,
          unitPrice: 250,
        },
      ],
    },
    {
      systemNumber: "BILL-1004",
      billNumber: "BILL-1004",
      vendorName: "Metro Utilities",
      billDateOffset: -95,
      dueDateOffset: -70,
      lines: [
        {
          itemSku: "SUP-100",
          description: "Inventory restock",
          qty: 40,
          unitPrice: 75,
        },
      ],
    },
    {
      systemNumber: "BILL-1005",
      billNumber: "BILL-1005",
      vendorName: "Desert Office Supplies",
      billDateOffset: -140,
      dueDateOffset: -120,
      lines: [
        {
          itemSku: "CONSULT-01",
          description: "Process audit",
          qty: 6,
          unitPrice: 250,
        },
      ],
    },
  ];

  const billsByNumber = new Map<string, Prisma.BillGetPayload<{ include: { lines: true; vendor: true } }>>();

  for (const billDef of billDefinitions) {
    const vendor = vendorsByName.get(billDef.vendorName);
    if (!vendor) {
      throw new Error(`Vendor not found for seed bill: ${billDef.vendorName}`);
    }
    const billDate = dateWithOffset(billDef.billDateOffset);
    const dueDate = dateWithOffset(billDef.dueDateOffset);

    let bill = await prisma.bill.findFirst({
      where: { orgId: org.id, systemNumber: billDef.systemNumber },
      include: { lines: true, vendor: true },
    });

    if (!bill) {
      const lineInputs = billDef.lines.map((line) => {
        const item = itemsBySku.get(line.itemSku);
        if (!item) {
          throw new Error(`Item not found for seed bill line: ${line.itemSku}`);
        }
        return {
          expenseAccountId: expenseAccount.id,
          itemId: item.id,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountAmount: 0,
          taxCodeId: vatTax?.id,
        };
      });

      const calculated = calculateBillLines({
        lines: lineInputs,
        itemsById,
        taxCodesById,
        vatEnabled: org.vatEnabled,
      });

      bill = await prisma.bill.create({
        data: {
          orgId: org.id,
          vendorId: vendor.id,
          billNumber: billDef.billNumber,
          systemNumber: billDef.systemNumber,
          status: DocumentStatus.POSTED,
          paymentStatus: PaymentStatus.UNPAID,
          amountPaid: dec(0),
          billDate,
          dueDate,
          currency,
          subTotal: calculated.subTotal,
          taxTotal: calculated.taxTotal,
          total: calculated.total,
          notes: "Seeded bill",
          postedAt: billDate,
          createdByUserId: user.id,
          lines: {
            createMany: {
              data: calculated.lines.map((line) => ({
                lineNo: line.lineNo,
                expenseAccountId: line.expenseAccountId,
                itemId: line.itemId,
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
        include: { lines: true, vendor: true },
      });

      await ensureAuditLog({
        orgId: org.id,
        actorUserId: user.id,
        entityType: "BILL",
        entityId: bill.id,
        action: AuditAction.CREATE,
        after: bill,
        requestId: seedRequestId,
      });
      await ensureAuditLog({
        orgId: org.id,
        actorUserId: user.id,
        entityType: "BILL",
        entityId: bill.id,
        action: AuditAction.POST,
        after: bill,
        requestId: seedRequestId,
      });
    }

    if (bill) {
      const posting = buildBillPostingLines({
        billNumber: bill.systemNumber ?? bill.billNumber ?? billDef.systemNumber,
        vendorId: bill.vendorId,
        total: bill.total,
        lines: bill.lines.map((line) => ({
          expenseAccountId: line.expenseAccountId,
          lineSubTotal: line.lineSubTotal,
          lineTax: line.lineTax,
          taxCodeId: line.taxCodeId ?? undefined,
        })),
        apAccountId: apAccount.id,
        vatAccountId: vatReceivableAccount?.id,
      });

      if (!dec(posting.totalDebit).equals(dec(posting.totalCredit))) {
        throw new Error(`Seed bill posting is not balanced: ${bill.systemNumber ?? billDef.systemNumber}`);
      }

      await ensureGlHeader({
        orgId: org.id,
        sourceType: "BILL",
        sourceId: bill.id,
        postingDate: bill.postedAt ?? bill.billDate,
        currency: bill.currency,
        exchangeRate: bill.exchangeRate ?? undefined,
        totalDebit: posting.totalDebit,
        totalCredit: posting.totalCredit,
        status: "POSTED",
        createdByUserId: user.id,
        memo: `Bill ${bill.systemNumber ?? bill.billNumber ?? billDef.systemNumber}`,
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
      });

      billsByNumber.set(bill.systemNumber ?? billDef.systemNumber, bill);
    }
  }

  const paymentDefinitions = [
    {
      number: "PAY-2001",
      customerName: "Acme Trading LLC",
      paymentDateOffset: -2,
      allocations: [{ invoiceNumber: "INV-1001", amount: dec(1000) }],
    },
    {
      number: "PAY-2002",
      customerName: "Globex Hospitality",
      paymentDateOffset: -5,
      allocations: [{ invoiceNumber: "INV-1002", amount: dec(1200) }],
    },
  ];

  for (const paymentDef of paymentDefinitions) {
    const customer = customersByName.get(paymentDef.customerName);
    if (!customer) {
      throw new Error(`Customer not found for seed payment: ${paymentDef.customerName}`);
    }

    const existing = await prisma.paymentReceived.findFirst({
      where: { orgId: org.id, number: paymentDef.number },
    });
    if (existing) {
      continue;
    }

    const allocations = paymentDef.allocations.map((allocation) => {
      const invoice = invoicesByNumber.get(allocation.invoiceNumber);
      if (!invoice) {
        throw new Error(`Invoice not found for seed payment allocation: ${allocation.invoiceNumber}`);
      }
      return { invoiceId: invoice.id, amount: allocation.amount };
    });

    const amountTotal = calculatePaymentTotal(allocations);
    const paymentDate = dateWithOffset(paymentDef.paymentDateOffset);

    const payment = await prisma.paymentReceived.create({
      data: {
        orgId: org.id,
        number: paymentDef.number,
        status: DocumentStatus.POSTED,
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        paymentDate,
        currency,
        amountTotal,
        reference: "Seeded payment",
        memo: "Seeded payment",
        postedAt: paymentDate,
        createdByUserId: user.id,
        allocations: {
          createMany: {
            data: allocations.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: allocation.amount,
            })),
          },
        },
      },
      include: { allocations: true },
    });

    for (const allocation of allocations) {
      const invoice = invoicesByNumber.get(
        paymentDef.allocations.find((entry) => entry.invoiceNumber)?.invoiceNumber ?? "",
      );
      if (!invoice) {
        continue;
      }
      const newPaid = round2(dec(invoice.amountPaid ?? 0).add(allocation.amount));
      await prisma.invoice.update({
        where: { id: allocation.invoiceId },
        data: {
          amountPaid: newPaid,
          paymentStatus: resolvePaymentStatus(invoice.total, newPaid),
        },
      });
    }

    const posting = buildPaymentPostingLines({
      paymentNumber: payment.number ?? paymentDef.number,
      customerId: payment.customerId,
      amountTotal: payment.amountTotal,
      arAccountId: arAccount.id,
      bankAccountId: bankAccount.glAccountId,
    });

    if (!dec(posting.totalDebit).equals(dec(posting.totalCredit))) {
      throw new Error(`Seed payment posting is not balanced: ${payment.number ?? paymentDef.number}`);
    }

    await ensureGlHeader({
      orgId: org.id,
      sourceType: "PAYMENT_RECEIVED",
      sourceId: payment.id,
      postingDate: payment.postedAt ?? paymentDate,
      currency: payment.currency,
      exchangeRate: payment.exchangeRate ?? undefined,
      totalDebit: posting.totalDebit,
      totalCredit: posting.totalCredit,
      status: "POSTED",
      createdByUserId: user.id,
      memo: `Payment ${payment.number ?? paymentDef.number}`,
      lines: {
        createMany: {
          data: posting.lines.map((line) => ({
            lineNo: line.lineNo,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description ?? undefined,
            customerId: line.customerId ?? undefined,
          })),
        },
      },
    });

    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "PAYMENT_RECEIVED",
      entityId: payment.id,
      action: AuditAction.CREATE,
      after: payment,
      requestId: seedRequestId,
    });
    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "PAYMENT_RECEIVED",
      entityId: payment.id,
      action: AuditAction.POST,
      after: payment,
      requestId: seedRequestId,
    });
  }

  const vendorPaymentDefinitions = [
    {
      number: "VPAY-3001",
      vendorName: "Desert Office Supplies",
      paymentDateOffset: -3,
      allocations: [{ billNumber: "BILL-1001", amount: dec(800) }],
    },
    {
      number: "VPAY-3002",
      vendorName: "Metro Utilities",
      paymentDateOffset: -7,
      allocations: [{ billNumber: "BILL-1002", amount: dec(900) }],
    },
  ];

  for (const paymentDef of vendorPaymentDefinitions) {
    const vendor = vendorsByName.get(paymentDef.vendorName);
    if (!vendor) {
      throw new Error(`Vendor not found for seed vendor payment: ${paymentDef.vendorName}`);
    }

    const existing = await prisma.vendorPayment.findFirst({
      where: { orgId: org.id, number: paymentDef.number },
    });
    if (existing) {
      continue;
    }

    const allocations = paymentDef.allocations.map((allocation) => {
      const bill = billsByNumber.get(allocation.billNumber);
      if (!bill) {
        throw new Error(`Bill not found for seed vendor payment allocation: ${allocation.billNumber}`);
      }
      return { billId: bill.id, amount: allocation.amount };
    });

    const amountTotal = calculateVendorPaymentTotal(allocations);
    const paymentDate = dateWithOffset(paymentDef.paymentDateOffset);

    const vendorPayment = await prisma.vendorPayment.create({
      data: {
        orgId: org.id,
        number: paymentDef.number,
        status: DocumentStatus.POSTED,
        vendorId: vendor.id,
        bankAccountId: bankAccount.id,
        paymentDate,
        currency,
        amountTotal,
        reference: "Seeded vendor payment",
        memo: "Seeded vendor payment",
        postedAt: paymentDate,
        createdByUserId: user.id,
        allocations: {
          createMany: {
            data: allocations.map((allocation) => ({
              billId: allocation.billId,
              amount: allocation.amount,
            })),
          },
        },
      },
      include: { allocations: true },
    });

    for (const allocation of allocations) {
      const bill = billsByNumber.get(
        paymentDef.allocations.find((entry) => entry.billNumber)?.billNumber ?? "",
      );
      if (!bill) {
        continue;
      }
      const newPaid = round2(dec(bill.amountPaid ?? 0).add(allocation.amount));
      await prisma.bill.update({
        where: { id: allocation.billId },
        data: {
          amountPaid: newPaid,
          paymentStatus: resolvePaymentStatus(bill.total, newPaid),
        },
      });
    }

    const posting = buildVendorPaymentPostingLines({
      paymentNumber: vendorPayment.number ?? paymentDef.number,
      vendorId: vendorPayment.vendorId,
      amountTotal: vendorPayment.amountTotal,
      apAccountId: apAccount.id,
      bankAccountId: bankAccount.glAccountId,
    });

    if (!dec(posting.totalDebit).equals(dec(posting.totalCredit))) {
      throw new Error(`Seed vendor payment posting is not balanced: ${vendorPayment.number ?? paymentDef.number}`);
    }

    await ensureGlHeader({
      orgId: org.id,
      sourceType: "VENDOR_PAYMENT",
      sourceId: vendorPayment.id,
      postingDate: vendorPayment.postedAt ?? paymentDate,
      currency: vendorPayment.currency,
      exchangeRate: vendorPayment.exchangeRate ?? undefined,
      totalDebit: posting.totalDebit,
      totalCredit: posting.totalCredit,
      status: "POSTED",
      createdByUserId: user.id,
      memo: `Vendor payment ${vendorPayment.number ?? paymentDef.number}`,
      lines: {
        createMany: {
          data: posting.lines.map((line) => ({
            lineNo: line.lineNo,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description ?? undefined,
            vendorId: line.vendorId ?? undefined,
          })),
        },
      },
    });

    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "VENDOR_PAYMENT",
      entityId: vendorPayment.id,
      action: AuditAction.CREATE,
      after: vendorPayment,
      requestId: seedRequestId,
    });
    await ensureAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      entityType: "VENDOR_PAYMENT",
      entityId: vendorPayment.id,
      action: AuditAction.POST,
      after: vendorPayment,
      requestId: seedRequestId,
    });
  }

  const settings = await prisma.orgSettings.findUnique({ where: { orgId: org.id } });
  if (settings) {
    const updateData: Partial<Prisma.OrgSettingsUncheckedUpdateInput> = {};
    if ((settings.invoiceNextNumber ?? 1) < 1006) {
      updateData.invoiceNextNumber = 1006;
    }
    if ((settings.billNextNumber ?? 1) < 1006) {
      updateData.billNextNumber = 1006;
    }
    if ((settings.paymentNextNumber ?? 1) < 2003) {
      updateData.paymentNextNumber = 2003;
    }
    if ((settings.vendorPaymentNextNumber ?? 1) < 3003) {
      updateData.vendorPaymentNextNumber = 3003;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.orgSettings.update({
        where: { orgId: org.id },
        data: updateData,
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
