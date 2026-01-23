import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountSubtype, AccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { add, dec, sub, toString2 } from "../../common/money";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type DashboardRange = "month-to-date" | "year-to-date" | "last-30-days";

type DashboardRangeInfo = {
  key: DashboardRange;
  from: Date;
  to: Date;
  label: string;
};

const DEFAULT_RANGE: DashboardRange = "month-to-date";

const resolveRange = (range?: string): DashboardRangeInfo => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const to = toEndOfDayUtc(now);
  const normalized = (range ?? DEFAULT_RANGE) as DashboardRange;

  let from: Date;
  let label: string;

  switch (normalized) {
    case "month-to-date":
      from = toStartOfDayUtc(new Date(Date.UTC(year, month, 1)));
      label = "Month to date";
      break;
    case "year-to-date":
      from = toStartOfDayUtc(new Date(Date.UTC(year, 0, 1)));
      label = "Year to date";
      break;
    case "last-30-days":
      from = toStartOfDayUtc(new Date(Date.UTC(year, month, day - 29)));
      label = "Last 30 days";
      break;
    default:
      throw new BadRequestException("Invalid range");
  }

  return { key: normalized, from, to, label };
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(orgId?: string, range?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { baseCurrency: true },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const rangeInfo = resolveRange(range);

    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, currency: true, openingBalance: true, glAccountId: true },
      orderBy: { name: "asc" },
    });
    const bankAccountIds = bankAccounts.map((account) => account.glAccountId);
    const bankGroups = bankAccountIds.length
      ? await this.prisma.gLLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: bankAccountIds },
            header: {
              orgId,
              status: "POSTED",
              postingDate: { lte: rangeInfo.to },
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        })
      : [];
    const bankTotalsByAccount = new Map(bankGroups.map((group) => [group.accountId, group._sum]));

    let bankBalanceTotal = dec(0);
    const bankBalances = bankAccounts.map((account) => {
      const sums = bankTotalsByAccount.get(account.glAccountId);
      const debit = dec(sums?.debit ?? 0);
      const credit = dec(sums?.credit ?? 0);
      const net = sub(debit, credit);
      const balance = add(account.openingBalance ?? 0, net);
      bankBalanceTotal = add(bankBalanceTotal, balance);
      return {
        bankAccountId: account.id,
        name: account.name,
        currency: account.currency,
        balance: toString2(balance),
      };
    });

    const cashAccountWhere: Prisma.AccountWhereInput = {
      orgId,
      subtype: { in: [AccountSubtype.BANK, AccountSubtype.CASH] },
    };
    if (bankAccountIds.length) {
      cashAccountWhere.id = { notIn: bankAccountIds };
    }
    const cashAccounts = await this.prisma.account.findMany({
      where: cashAccountWhere,
      select: { id: true },
    });
    const cashAccountIds = cashAccounts.map((account) => account.id);
    const cashGroups = cashAccountIds.length
      ? await this.prisma.gLLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: cashAccountIds },
            header: {
              orgId,
              status: "POSTED",
              postingDate: { lte: rangeInfo.to },
            },
          },
          _sum: { debit: true, credit: true },
        })
      : [];
    let cashAccountTotal = dec(0);
    cashGroups.forEach((group) => {
      cashAccountTotal = add(cashAccountTotal, sub(group._sum.debit ?? 0, group._sum.credit ?? 0));
    });
    const cashBalance = add(bankBalanceTotal, cashAccountTotal);

    const invoiceTotals = await this.prisma.invoice.aggregate({
      where: { orgId, status: "POSTED" },
      _sum: { total: true, amountPaid: true },
    });
    const arOutstanding = sub(invoiceTotals._sum.total ?? 0, invoiceTotals._sum.amountPaid ?? 0);

    const billTotals = await this.prisma.bill.aggregate({
      where: { orgId, status: "POSTED" },
      _sum: { total: true, amountPaid: true },
    });
    const apOutstanding = sub(billTotals._sum.total ?? 0, billTotals._sum.amountPaid ?? 0);

    const pnlAccounts = await this.prisma.account.findMany({
      where: { orgId, type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
      select: { id: true, type: true },
    });
    const pnlAccountIds = pnlAccounts.map((account) => account.id);
    const pnlGrouped = pnlAccountIds.length
      ? await this.prisma.gLLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: pnlAccountIds },
            header: {
              orgId,
              status: "POSTED",
              postingDate: {
                gte: rangeInfo.from,
                lte: rangeInfo.to,
              },
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        })
      : [];
    const pnlAccountMap = new Map(pnlAccounts.map((account) => [account.id, account.type]));

    let incomeTotal = dec(0);
    let expenseTotal = dec(0);
    for (const row of pnlGrouped) {
      const accountType = pnlAccountMap.get(row.accountId);
      if (!accountType) {
        continue;
      }
      const debit = dec(row._sum.debit ?? 0);
      const credit = dec(row._sum.credit ?? 0);
      if (accountType === AccountType.INCOME) {
        incomeTotal = add(incomeTotal, sub(credit, debit));
      } else {
        expenseTotal = add(expenseTotal, sub(debit, credit));
      }
    }

    const netProfit = sub(incomeTotal, expenseTotal);

    return {
      range: {
        key: rangeInfo.key,
        label: rangeInfo.label,
        from: rangeInfo.from.toISOString(),
        to: rangeInfo.to.toISOString(),
      },
      currency: org.baseCurrency ?? "AED",
      bankBalances,
      cashBalance: toString2(cashBalance),
      arOutstanding: toString2(arOutstanding),
      apOutstanding: toString2(apOutstanding),
      salesTotal: toString2(incomeTotal),
      expenseTotal: toString2(expenseTotal),
      netProfit: toString2(netProfit),
    };
  }
}
