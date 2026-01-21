import { PrismaClient } from "@prisma/client";
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
        vatEnabled: false,
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
