import { ItemType, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import argon2 from "argon2";
import { Permissions } from "@ledgerlite/shared";

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
    },
    create: {
      orgId: org.id,
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
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
  const expenseAccount =
    (await prisma.account.findFirst({ where: { orgId: org.id, subtype: "EXPENSE" } })) ??
    (await prisma.account.findFirst({ where: { orgId: org.id, type: "EXPENSE" } }));
  const defaultTax = org.vatEnabled
    ? await prisma.taxCode.findFirst({ where: { orgId: org.id, name: "VAT 5%" } })
    : null;

  if (incomeAccount && expenseAccount) {
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
            expenseAccountId: expenseAccount.id,
            defaultTaxCodeId: item.defaultTaxCodeId ?? undefined,
            isActive: true,
          },
        });
      }
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
