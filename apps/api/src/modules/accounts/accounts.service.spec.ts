import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AccountsService } from "./accounts.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../../common/audit.service";

const createService = () => {
  const prisma = {
    account: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    taxCode: {
      findFirst: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    gLLine: { count: jest.fn().mockResolvedValue(0) },
    journalLine: { count: jest.fn().mockResolvedValue(0) },
    invoiceLine: { count: jest.fn().mockResolvedValue(0) },
    billLine: { count: jest.fn().mockResolvedValue(0) },
    expenseLine: { count: jest.fn().mockResolvedValue(0) },
    item: { count: jest.fn().mockResolvedValue(0) },
    bankAccount: { count: jest.fn().mockResolvedValue(0) },
    orgSettings: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  } as unknown as PrismaService;
  const audit = {
    log: jest.fn(),
  } as unknown as AuditService;
  const service = new AccountsService(prisma, audit);
  return { prisma, audit, service };
};

describe("AccountsService", () => {
  it("rejects invalid subtype for account type on create", async () => {
    const { prisma, service } = createService();
    prisma.account.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.createAccount("org-1", "user-1", {
        code: "9000",
        name: "Invalid",
        type: "ASSET",
        subtype: "SALES",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("prevents deactivating protected accounts", async () => {
    const { prisma, service } = createService();
    prisma.account.findFirst = jest.fn().mockResolvedValue({
      id: "acct-1",
      orgId: "org-1",
      code: "1100",
      name: "Accounts Receivable",
      type: "ASSET",
      subtype: "AR",
      isSystem: false,
      isActive: true,
      normalBalance: "DEBIT",
    });

    await expect(
      service.updateAccount("org-1", "acct-1", "user-1", {
        isActive: false,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("blocks type changes when account is in use", async () => {
    const { prisma, service } = createService();
    prisma.account.findFirst = jest.fn().mockResolvedValue({
      id: "acct-1",
      orgId: "org-1",
      code: "1000",
      name: "Cash",
      type: "ASSET",
      subtype: "CASH",
      isSystem: false,
      isActive: true,
      normalBalance: "DEBIT",
    });
    prisma.gLLine.count = jest.fn().mockResolvedValue(1);

    await expect(
      service.updateAccount("org-1", "acct-1", "user-1", {
        type: "EXPENSE",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("throws when updating missing account", async () => {
    const { prisma, service } = createService();
    prisma.account.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      service.updateAccount("org-1", "missing", "user-1", { name: "Missing" }),
    ).rejects.toThrow(NotFoundException);
  });
});
