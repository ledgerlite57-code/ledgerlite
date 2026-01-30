import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountSubtype, AccountType, AuditAction, NormalBalance, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type AccountCreateInput, type AccountUpdateInput } from "@ledgerlite/shared";

type AccountRecord = Prisma.AccountGetPayload<Prisma.AccountDefaultArgs>;

const ACCOUNT_SUBTYPE_BY_TYPE: Record<AccountType, AccountSubtype[]> = {
  ASSET: [
    AccountSubtype.BANK,
    AccountSubtype.CASH,
    AccountSubtype.AR,
    AccountSubtype.VAT_RECEIVABLE,
    AccountSubtype.VENDOR_PREPAYMENTS,
  ],
  LIABILITY: [AccountSubtype.AP, AccountSubtype.VAT_PAYABLE, AccountSubtype.CUSTOMER_ADVANCES],
  EQUITY: [AccountSubtype.EQUITY],
  INCOME: [AccountSubtype.SALES],
  EXPENSE: [AccountSubtype.EXPENSE],
};

const NORMAL_BALANCE_BY_TYPE: Record<AccountType, NormalBalance> = {
  ASSET: NormalBalance.DEBIT,
  EXPENSE: NormalBalance.DEBIT,
  LIABILITY: NormalBalance.CREDIT,
  EQUITY: NormalBalance.CREDIT,
  INCOME: NormalBalance.CREDIT,
};

const RECONCILABLE_SUBTYPES = new Set<AccountSubtype>([AccountSubtype.BANK, AccountSubtype.CASH]);
const PROTECTED_SUBTYPES = new Set<AccountSubtype>([
  AccountSubtype.AR,
  AccountSubtype.AP,
  AccountSubtype.VAT_RECEIVABLE,
  AccountSubtype.VAT_PAYABLE,
]);

const isSubtypeAllowed = (type: AccountType, subtype?: AccountSubtype | null) => {
  if (!subtype) {
    return true;
  }
  return (ACCOUNT_SUBTYPE_BY_TYPE[type] ?? []).includes(subtype);
};

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listAccounts(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    return this.prisma.account.findMany({
      where: { orgId },
      orderBy: [{ code: "asc" }],
    });
  }

  async createAccount(
    orgId?: string,
    actorUserId?: string,
    input?: AccountCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "accounts.create",
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
        return existingKey.response as unknown as AccountRecord;
      }
    }

    const exists = await this.prisma.account.findFirst({
      where: { orgId, code: input.code },
    });
    if (exists) {
      throw new ConflictException("Account code already exists");
    }

    const accountType = input.type as AccountType;
    const accountSubtype = input.subtype ? (input.subtype as AccountSubtype) : undefined;
    if (!isSubtypeAllowed(accountType, accountSubtype)) {
      throw new BadRequestException("Account subtype is not valid for the selected type");
    }

    let parentAccountId: string | undefined;
    if (input.parentAccountId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: input.parentAccountId, orgId },
      });
      if (!parent) {
        throw new BadRequestException("Parent account not found");
      }
      if (parent.type !== accountType) {
        throw new BadRequestException("Parent account must have the same type");
      }
      parentAccountId = parent.id;
    }

    let taxCodeId: string | undefined;
    if (input.taxCodeId) {
      const taxCode = await this.prisma.taxCode.findFirst({
        where: { id: input.taxCodeId, orgId },
      });
      if (!taxCode) {
        throw new BadRequestException("Tax code not found");
      }
      taxCodeId = taxCode.id;
    }

    const normalBalance = input.normalBalance
      ? (input.normalBalance as NormalBalance)
      : NORMAL_BALANCE_BY_TYPE[accountType];
    const isReconcilable =
      input.isReconcilable ?? (accountSubtype ? RECONCILABLE_SUBTYPES.has(accountSubtype) : false);

    const account = await this.prisma.account.create({
      data: {
        orgId,
        code: input.code,
        name: input.name,
        description: input.description ?? undefined,
        type: accountType,
        subtype: accountSubtype,
        parentAccountId,
        normalBalance,
        isReconcilable,
        taxCodeId,
        externalCode: input.externalCode ?? undefined,
        tags: input.tags ?? undefined,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ACCOUNT",
      entityId: account.id,
      action: AuditAction.CREATE,
      after: account,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: account as unknown as object,
          statusCode: 201,
        },
      });
    }

    return account;
  }

  async updateAccount(orgId?: string, accountId?: string, actorUserId?: string, input?: AccountUpdateInput) {
    if (!orgId || !accountId) {
      throw new NotFoundException("Account not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, orgId },
    });
    if (!account) {
      throw new NotFoundException("Account not found");
    }

    const hasTypeChange = Boolean(input.type && input.type !== account.type);
    const hasSubtypeChange = input.subtype !== undefined && input.subtype !== account.subtype;

    const isProtected = account.isSystem || (account.subtype && PROTECTED_SUBTYPES.has(account.subtype));
    if (isProtected) {
      if (hasTypeChange) {
        throw new ConflictException("System account type cannot be changed");
      }
      if (hasSubtypeChange) {
        throw new ConflictException("System account subtype cannot be changed");
      }
      if (input.isActive === false) {
        throw new ConflictException("System account cannot be deactivated");
      }
    }

    if ((hasTypeChange || hasSubtypeChange) && (await this.isAccountInUse(accountId))) {
      throw new ConflictException("Account in use cannot change type/subtype");
    }

    const nextType = input.type ? (input.type as AccountType) : account.type;
    const nextSubtype =
      input.subtype !== undefined
        ? (input.subtype ? (input.subtype as AccountSubtype) : undefined)
        : account.subtype ?? undefined;
    if (!isSubtypeAllowed(nextType, nextSubtype)) {
      throw new BadRequestException("Account subtype is not valid for the selected type");
    }

    if (input.code && input.code !== account.code) {
      const existing = await this.prisma.account.findFirst({
        where: { orgId, code: input.code },
      });
      if (existing) {
        throw new ConflictException("Account code already exists");
      }
    }

    if (input.isActive === false && account.isActive && (await this.isAccountInUse(accountId))) {
      throw new ConflictException("Account in use cannot be deactivated");
    }

    let parentAccountId = account.parentAccountId ?? undefined;
    if (input.parentAccountId && input.parentAccountId !== account.parentAccountId) {
      if (input.parentAccountId === accountId) {
        throw new BadRequestException("Account cannot be its own parent");
      }
      const parent = await this.prisma.account.findFirst({
        where: { id: input.parentAccountId, orgId },
      });
      if (!parent) {
        throw new BadRequestException("Parent account not found");
      }
      if (parent.type !== nextType) {
        throw new BadRequestException("Parent account must have the same type");
      }
      await this.assertNoParentCycle(orgId, accountId, parent.id);
      parentAccountId = parent.id;
    }

    let taxCodeId = account.taxCodeId ?? undefined;
    if (input.taxCodeId && input.taxCodeId !== account.taxCodeId) {
      const taxCode = await this.prisma.taxCode.findFirst({
        where: { id: input.taxCodeId, orgId },
      });
      if (!taxCode) {
        throw new BadRequestException("Tax code not found");
      }
      taxCodeId = taxCode.id;
    }

    const normalBalance = input.normalBalance
      ? (input.normalBalance as NormalBalance)
      : hasTypeChange
        ? NORMAL_BALANCE_BY_TYPE[nextType]
        : account.normalBalance;
    let isReconcilable = account.isReconcilable;
    if (input.isReconcilable !== undefined) {
      isReconcilable = input.isReconcilable;
    } else if (input.subtype !== undefined) {
      isReconcilable = nextSubtype ? RECONCILABLE_SUBTYPES.has(nextSubtype) : false;
    }

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        code: input.code ?? account.code,
        name: input.name ?? account.name,
        description: input.description ?? account.description,
        type: nextType,
        subtype: nextSubtype,
        parentAccountId,
        normalBalance,
        isReconcilable,
        taxCodeId,
        externalCode: input.externalCode ?? account.externalCode,
        tags: input.tags ?? account.tags ?? undefined,
        isActive: input.isActive ?? account.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ACCOUNT",
      entityId: accountId,
      action: AuditAction.UPDATE,
      before: account,
      after: updated,
    });

    return updated;
  }

  private async isAccountInUse(accountId: string) {
    const [
      glCount,
      journalCount,
      invoiceLineCount,
      billLineCount,
      itemCount,
      bankAccountCount,
      settingsCount,
    ] = await this.prisma.$transaction([
      this.prisma.gLLine.count({ where: { accountId } }),
      this.prisma.journalLine.count({ where: { accountId } }),
      this.prisma.invoiceLine.count({ where: { incomeAccountId: accountId } }),
      this.prisma.billLine.count({ where: { expenseAccountId: accountId } }),
      this.prisma.item.count({
        where: { OR: [{ incomeAccountId: accountId }, { expenseAccountId: accountId }] },
      }),
      this.prisma.bankAccount.count({ where: { glAccountId: accountId } }),
      this.prisma.orgSettings.count({
        where: { OR: [{ defaultArAccountId: accountId }, { defaultApAccountId: accountId }] },
      }),
    ]);

    return (
      glCount +
        journalCount +
        invoiceLineCount +
        billLineCount +
        itemCount +
        bankAccountCount +
        settingsCount >
      0
    );
  }

  private async assertNoParentCycle(orgId: string, accountId: string, parentAccountId: string) {
    let currentId: string | null = parentAccountId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === accountId) {
        throw new BadRequestException("Account hierarchy cannot contain cycles");
      }
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);
      const next: { parentAccountId: string | null } | null = await this.prisma.account.findFirst({
        where: { id: currentId, orgId },
        select: { parentAccountId: true },
      });
      currentId = next?.parentAccountId ?? null;
    }
  }
}
