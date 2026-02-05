import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountSubtype, AccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { add, dec, gt, round2, sub, toString2 } from "../../common/money";
import { addToAgingTotals, createAgingTotals, getAgingBucket } from "../../reports.utils";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";
import type {
  ReportAsOfInput,
  ReportAgingInput,
  ReportLedgerLinesInput,
  ReportRangeInput,
  ReportVatSummaryInput,
} from "@ledgerlite/shared";

const toAmountString = (value?: Prisma.Decimal | null) => toString2(value ?? 0);

type AgingLine = {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  outstanding: string;
  bucket: string;
  ageDays: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrgSettings(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { baseCurrency: true, fiscalYearStartMonth: true, orgSettings: { select: { reportBasis: true } } },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }
    return {
      baseCurrency: org.baseCurrency ?? "AED",
      fiscalYearStartMonth: org.fiscalYearStartMonth ?? 1,
      reportBasis: org.orgSettings?.reportBasis ?? "ACCRUAL",
    };
  }

  private async getOrgCurrency(orgId?: string) {
    const settings = await this.getOrgSettings(orgId);
    return settings.baseCurrency;
  }

  private normalizeRange(range: ReportRangeInput) {
    return {
      from: toStartOfDayUtc(range.from),
      to: toEndOfDayUtc(range.to),
    };
  }

  private addToTotals(map: Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>, accountId: string, debit: Prisma.Decimal, credit: Prisma.Decimal) {
    const existing = map.get(accountId) ?? { debit: dec(0), credit: dec(0) };
    map.set(accountId, {
      debit: dec(existing.debit).add(debit),
      credit: dec(existing.credit).add(credit),
    });
  }

  private async getCashBasisAdjustments(orgId: string, from: Date, to: Date) {
    const incomeByAccount = new Map<string, Prisma.Decimal>();
    const expenseByAccount = new Map<string, Prisma.Decimal>();
    let vatPayable = dec(0);
    let vatReceivable = dec(0);

    const allocateByLines = (total: Prisma.Decimal, lines: Array<{ id: string; base: Prisma.Decimal }>) => {
      const allocations = new Map<string, Prisma.Decimal>();
      const totalBase = lines.reduce((sum, line) => dec(sum).add(line.base), dec(0));
      const totalAlloc = dec(total);
      if (!totalBase.greaterThan(0) || !totalAlloc.greaterThan(0)) {
        return allocations;
      }

      const roundedLines = lines.map((line) => {
        const ratio = dec(line.base).div(totalBase);
        const raw = totalAlloc.mul(ratio);
        const rounded = round2(raw);
        return {
          id: line.id,
          rounded,
          fraction: dec(raw).sub(rounded),
        };
      });

      const roundedSum = roundedLines.reduce((sum, line) => dec(sum).add(line.rounded), dec(0));
      let remainder = round2(dec(totalAlloc).sub(roundedSum));
      let remainderCents = Number(dec(remainder).mul(100).toFixed(0));

      if (remainderCents !== 0 && roundedLines.length > 0) {
        const sorted = [...roundedLines].sort((a, b) => {
          const aFrac = a.fraction.toNumber();
          const bFrac = b.fraction.toNumber();
          return remainderCents > 0 ? bFrac - aFrac : aFrac - bFrac;
        });

        const step = remainderCents > 0 ? dec(0.01) : dec(-0.01);
        let idx = 0;
        while (remainderCents !== 0) {
          const target = sorted[idx % sorted.length];
          target.rounded = round2(dec(target.rounded).add(step));
          remainderCents += remainderCents > 0 ? -1 : 1;
          idx += 1;
        }
      }

      for (const line of roundedLines) {
        allocations.set(line.id, line.rounded);
      }
      return allocations;
    };

    const vatAccounts = await this.prisma.account.findMany({
      where: { orgId, subtype: { in: [AccountSubtype.VAT_PAYABLE, AccountSubtype.VAT_RECEIVABLE] } },
      select: { id: true, subtype: true },
    });
    const vatPayableAccountId = vatAccounts.find((account) => account.subtype === AccountSubtype.VAT_PAYABLE)?.id ?? null;
    const vatReceivableAccountId = vatAccounts.find((account) => account.subtype === AccountSubtype.VAT_RECEIVABLE)?.id ?? null;

    const paymentAllocations = await this.prisma.paymentReceivedAllocation.findMany({
      where: {
        paymentReceived: {
          orgId,
          status: "POSTED",
          paymentDate: { gte: from, lte: to },
        },
      },
      include: {
        invoice: {
          include: {
            lines: { include: { item: true } },
          },
        },
      },
    });

    for (const allocation of paymentAllocations) {
      const invoice = allocation.invoice;
      const invoiceTotal = dec(invoice.total ?? 0);
      if (invoiceTotal.lte(0)) {
        continue;
      }
      const ratio = dec(allocation.amount).div(invoiceTotal);
      const netAlloc = round2(dec(invoice.subTotal ?? 0).mul(ratio));
      const allocAmount = round2(dec(allocation.amount));
      const taxAlloc = round2(dec(allocAmount).sub(netAlloc));
      const invoiceSubTotal = dec(invoice.subTotal ?? 0);

      if (invoiceSubTotal.greaterThan(0) && netAlloc.greaterThan(0)) {
        const lineAllocations = allocateByLines(
          netAlloc,
          invoice.lines.map((line) => ({
            id: line.id,
            base: dec(line.lineSubTotal ?? 0),
          })),
        );
        for (const line of invoice.lines) {
          const incomeAccountId = line.incomeAccountId ?? line.item?.incomeAccountId ?? undefined;
          if (!incomeAccountId) {
            continue;
          }
          const lineAlloc = lineAllocations.get(line.id) ?? dec(0);
          if (!lineAlloc.greaterThan(0)) {
            continue;
          }
          const current = incomeByAccount.get(incomeAccountId) ?? dec(0);
          incomeByAccount.set(incomeAccountId, round2(dec(current).add(lineAlloc)));
        }
      }

      if (taxAlloc.greaterThan(0)) {
        vatPayable = round2(dec(vatPayable).add(taxAlloc));
      }
    }

    const vendorAllocations = await this.prisma.vendorPaymentAllocation.findMany({
      where: {
        vendorPayment: {
          orgId,
          status: "POSTED",
          paymentDate: { gte: from, lte: to },
        },
      },
      include: {
        bill: {
          include: {
            lines: true,
          },
        },
      },
    });

    for (const allocation of vendorAllocations) {
      const bill = allocation.bill;
      const billTotal = dec(bill.total ?? 0);
      if (billTotal.lte(0)) {
        continue;
      }
      const ratio = dec(allocation.amount).div(billTotal);
      const netAlloc = round2(dec(bill.subTotal ?? 0).mul(ratio));
      const allocAmount = round2(dec(allocation.amount));
      const taxAlloc = round2(dec(allocAmount).sub(netAlloc));
      const billSubTotal = dec(bill.subTotal ?? 0);

      if (billSubTotal.greaterThan(0) && netAlloc.greaterThan(0)) {
        const lineAllocations = allocateByLines(
          netAlloc,
          bill.lines.map((line) => ({
            id: line.id,
            base: dec(line.lineSubTotal ?? 0),
          })),
        );
        for (const line of bill.lines) {
          const expenseAccountId = line.expenseAccountId;
          if (!expenseAccountId) {
            continue;
          }
          const lineAlloc = lineAllocations.get(line.id) ?? dec(0);
          if (!lineAlloc.greaterThan(0)) {
            continue;
          }
          const current = expenseByAccount.get(expenseAccountId) ?? dec(0);
          expenseByAccount.set(expenseAccountId, round2(dec(current).add(lineAlloc)));
        }
      }

      if (taxAlloc.greaterThan(0)) {
        vatReceivable = round2(dec(vatReceivable).add(taxAlloc));
      }
    }

    return { incomeByAccount, expenseByAccount, vatPayable, vatReceivable, vatPayableAccountId, vatReceivableAccountId };
  }

  private async getCashBasisGroupedLines(orgId: string, from: Date, to: Date) {
    const grouped = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();

    const baseGrouped = await this.prisma.gLLine.groupBy({
      by: ["accountId"],
      where: {
        header: {
          orgId,
          postingDate: {
            gte: from,
            lte: to,
          },
          sourceType: { notIn: ["INVOICE", "BILL", "CREDIT_NOTE"] },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    for (const row of baseGrouped) {
      this.addToTotals(grouped, row.accountId, dec(row._sum.debit ?? 0), dec(row._sum.credit ?? 0));
    }

    const paymentAr = await this.prisma.gLLine.groupBy({
      by: ["accountId"],
      where: {
        account: { subtype: AccountSubtype.AR },
        header: {
          orgId,
          postingDate: {
            gte: from,
            lte: to,
          },
          sourceType: "PAYMENT_RECEIVED",
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    for (const row of paymentAr) {
      this.addToTotals(
        grouped,
        row.accountId,
        sub(dec(0), dec(row._sum.debit ?? 0)),
        sub(dec(0), dec(row._sum.credit ?? 0)),
      );
    }

    const vendorAp = await this.prisma.gLLine.groupBy({
      by: ["accountId"],
      where: {
        account: { subtype: AccountSubtype.AP },
        header: {
          orgId,
          postingDate: {
            gte: from,
            lte: to,
          },
          sourceType: "VENDOR_PAYMENT",
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    for (const row of vendorAp) {
      this.addToTotals(
        grouped,
        row.accountId,
        sub(dec(0), dec(row._sum.debit ?? 0)),
        sub(dec(0), dec(row._sum.credit ?? 0)),
      );
    }

    const adjustments = await this.getCashBasisAdjustments(orgId, from, to);

    for (const [accountId, amount] of adjustments.incomeByAccount.entries()) {
      this.addToTotals(grouped, accountId, dec(0), amount);
    }

    for (const [accountId, amount] of adjustments.expenseByAccount.entries()) {
      this.addToTotals(grouped, accountId, amount, dec(0));
    }

    if (adjustments.vatPayableAccountId && adjustments.vatPayable.greaterThan(0)) {
      this.addToTotals(grouped, adjustments.vatPayableAccountId, dec(0), adjustments.vatPayable);
    }

    if (adjustments.vatReceivableAccountId && adjustments.vatReceivable.greaterThan(0)) {
      this.addToTotals(grouped, adjustments.vatReceivableAccountId, adjustments.vatReceivable, dec(0));
    }

    return grouped;
  }

  async getTrialBalance(orgId?: string, input?: ReportRangeInput) {
    if (!input) {
      throw new BadRequestException("Invalid report range");
    }
    const settings = await this.getOrgSettings(orgId);
    const currency = settings.baseCurrency;
    const { from, to } = this.normalizeRange(input);

    const groupedMap =
      settings.reportBasis === "CASH"
        ? await this.getCashBasisGroupedLines(orgId!, from, to)
        : new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();

    if (settings.reportBasis !== "CASH") {
      const lines = await this.prisma.gLLine.findMany({
        where: {
          header: {
            orgId,
            postingDate: {
              gte: from,
              lte: to,
            },
          },
        },
        select: { accountId: true, debit: true, credit: true },
      });
      for (const line of lines) {
        this.addToTotals(groupedMap, line.accountId, dec(line.debit ?? 0), dec(line.credit ?? 0));
      }
    }

    const accountIds = Array.from(groupedMap.keys());
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { orgId, id: { in: accountIds } },
          select: { id: true, code: true, name: true, type: true },
        })
      : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const totals = Array.from(groupedMap.values()).reduce(
      (acc, row) => {
        acc.debit = add(acc.debit, row.debit);
        acc.credit = add(acc.credit, row.credit);
        return acc;
      },
      { debit: dec(0), credit: dec(0) },
    );

    type TrialBalanceRow = { accountId: string; code: string; name: string; type: AccountType; debit: string; credit: string };
    const rows = Array.from(groupedMap.entries())
      .map(([accountId, sums]) => {
        const account = accountMap.get(accountId);
        if (!account) {
          return null;
        }
        return {
          accountId,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: toAmountString(sums.debit),
          credit: toAmountString(sums.credit),
        };
      })
      .filter((row): row is TrialBalanceRow => Boolean(row))
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency,
      totals: {
        debit: toString2(totals.debit),
        credit: toString2(totals.credit),
      },
      rows,
    };
  }

  async getProfitLoss(orgId?: string, input?: ReportRangeInput) {
    if (!input) {
      throw new BadRequestException("Invalid report range");
    }
    const settings = await this.getOrgSettings(orgId);
    const currency = settings.baseCurrency;
    const { from, to } = this.normalizeRange(input);

    const accounts = await this.prisma.account.findMany({
      where: { orgId, type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const groupedMap =
      settings.reportBasis === "CASH"
        ? await this.getCashBasisGroupedLines(orgId!, from, to)
        : null;

    const grouped =
      groupedMap && accountIds.length === 0
        ? []
        : groupedMap
          ? Array.from(groupedMap.entries())
              .filter(([accountId]) => accountIds.includes(accountId))
              .map(([accountId, sums]) => ({ accountId, _sum: sums }))
          : accountIds.length
            ? await this.prisma.gLLine.groupBy({
                by: ["accountId"],
                where: {
                  accountId: { in: accountIds },
                  header: {
                    orgId,
                    postingDate: {
                      gte: from,
                      lte: to,
                    },
                  },
                },
                _sum: {
                  debit: true,
                  credit: true,
                },
              })
            : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const incomeRows: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    const expenseRows: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    let incomeTotal = dec(0);
    let expenseTotal = dec(0);

    for (const row of grouped) {
      const account = accountMap.get(row.accountId);
      if (!account) {
        continue;
      }
      const debit = dec(row._sum.debit ?? 0);
      const credit = dec(row._sum.credit ?? 0);
      if (account.type === AccountType.INCOME) {
        const amount = sub(credit, debit);
        incomeTotal = add(incomeTotal, amount);
        incomeRows.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      } else {
        const amount = sub(debit, credit);
        expenseTotal = add(expenseTotal, amount);
        expenseRows.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      }
    }

    incomeRows.sort((a, b) => a.code.localeCompare(b.code));
    expenseRows.sort((a, b) => a.code.localeCompare(b.code));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency,
      income: {
        total: toString2(incomeTotal),
        rows: incomeRows,
      },
      expenses: {
        total: toString2(expenseTotal),
        rows: expenseRows,
      },
      netProfit: toString2(sub(incomeTotal, expenseTotal)),
    };
  }

  async getBalanceSheet(orgId?: string, input?: ReportAsOfInput) {
    if (!input) {
      throw new BadRequestException("Invalid report date");
    }
    const settings = await this.getOrgSettings(orgId);
    const currency = settings.baseCurrency;
    const asOf = toEndOfDayUtc(input.asOf);
    const fiscalYearStartMonth = settings.fiscalYearStartMonth;
    const fiscalYearStart =
      fiscalYearStartMonth >= 1 && fiscalYearStartMonth <= 12
        ? toStartOfDayUtc(
            new Date(
              Date.UTC(
                asOf.getUTCMonth() + 1 >= fiscalYearStartMonth ? asOf.getUTCFullYear() : asOf.getUTCFullYear() - 1,
                fiscalYearStartMonth - 1,
                1,
              ),
            ),
          )
        : toStartOfDayUtc(new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)));

    const accounts = await this.prisma.account.findMany({
      where: { orgId, type: { in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY] } },
      select: { id: true, code: true, name: true, type: true },
    });

    if (settings.reportBasis === "CASH") {
      const groupedMap = await this.getCashBasisGroupedLines(orgId!, new Date(0), asOf);
      const accountMap = new Map(accounts.map((account) => [account.id, account]));

      const assets: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
      const liabilities: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
      const equity: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
      let assetTotal = dec(0);
      let liabilityTotal = dec(0);
      let equityTotal = dec(0);

      for (const [accountId, sums] of groupedMap.entries()) {
        const account = accountMap.get(accountId);
        if (!account) {
          continue;
        }
        const debit = dec(sums.debit ?? 0);
        const credit = dec(sums.credit ?? 0);
        if (account.type === AccountType.ASSET) {
          const amount = sub(debit, credit);
          assetTotal = add(assetTotal, amount);
          assets.push({ accountId, code: account.code, name: account.name, amount: toString2(amount) });
        } else if (account.type === AccountType.LIABILITY) {
          const amount = sub(credit, debit);
          liabilityTotal = add(liabilityTotal, amount);
          liabilities.push({ accountId, code: account.code, name: account.name, amount: toString2(amount) });
        } else if (account.type === AccountType.EQUITY) {
          const amount = sub(credit, debit);
          equityTotal = add(equityTotal, amount);
          equity.push({ accountId, code: account.code, name: account.name, amount: toString2(amount) });
        }
      }

      const pnlAccounts = await this.prisma.account.findMany({
        where: { orgId, type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
        select: { id: true, type: true },
      });
      const pnlGroupedMap = await this.getCashBasisGroupedLines(orgId!, fiscalYearStart, asOf);
      const pnlAccountMap = new Map(pnlAccounts.map((account) => [account.id, account.type]));
      let incomeTotal = dec(0);
      let expenseTotal = dec(0);
      for (const [accountId, sums] of pnlGroupedMap.entries()) {
        const accountType = pnlAccountMap.get(accountId);
        if (!accountType) {
          continue;
        }
        const debit = dec(sums.debit ?? 0);
        const credit = dec(sums.credit ?? 0);
        if (accountType === AccountType.INCOME) {
          incomeTotal = add(incomeTotal, sub(credit, debit));
        } else {
          expenseTotal = add(expenseTotal, sub(debit, credit));
        }
      }

      const netProfit = sub(incomeTotal, expenseTotal);
      const computedEquity = sub(assetTotal, liabilityTotal);
      const equityTotalWithProfit = add(equityTotal, netProfit);

      assets.sort((a, b) => a.code.localeCompare(b.code));
      liabilities.sort((a, b) => a.code.localeCompare(b.code));
      equity.sort((a, b) => a.code.localeCompare(b.code));

      return {
        asOf: asOf.toISOString(),
        currency,
        assets: {
          total: toString2(assetTotal),
          rows: assets,
        },
        liabilities: {
          total: toString2(liabilityTotal),
          rows: liabilities,
        },
        equity: {
          total: toString2(equityTotalWithProfit),
          rows: equity,
          derived: {
            netProfit: toString2(netProfit),
            netProfitFrom: fiscalYearStart.toISOString(),
            netProfitTo: asOf.toISOString(),
            computedEquity: toString2(computedEquity),
          },
        },
        totalLiabilitiesAndEquity: toString2(add(liabilityTotal, equityTotalWithProfit)),
      };
    }
    const accountIds = accounts.map((account) => account.id);
    const grouped = accountIds.length
      ? await this.prisma.gLLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: accountIds },
            header: {
              orgId,
              postingDate: {
                lte: asOf,
              },
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        })
      : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const assets: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    const liabilities: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    const equity: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    let assetTotal = dec(0);
    let liabilityTotal = dec(0);
    let equityTotal = dec(0);

    for (const row of grouped) {
      const account = accountMap.get(row.accountId);
      if (!account) {
        continue;
      }
      const debit = dec(row._sum.debit ?? 0);
      const credit = dec(row._sum.credit ?? 0);

      if (account.type === AccountType.ASSET) {
        const amount = sub(debit, credit);
        assetTotal = add(assetTotal, amount);
        assets.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      } else if (account.type === AccountType.LIABILITY) {
        const amount = sub(credit, debit);
        liabilityTotal = add(liabilityTotal, amount);
        liabilities.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      } else {
        const amount = sub(credit, debit);
        equityTotal = add(equityTotal, amount);
        equity.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      }
    }

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
              postingDate: {
                gte: fiscalYearStart,
                lte: asOf,
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
    const computedEquity = sub(assetTotal, liabilityTotal);
    const equityTotalWithProfit = add(equityTotal, netProfit);

    assets.sort((a, b) => a.code.localeCompare(b.code));
    liabilities.sort((a, b) => a.code.localeCompare(b.code));
    equity.sort((a, b) => a.code.localeCompare(b.code));

    return {
      asOf: asOf.toISOString(),
      currency,
      assets: {
        total: toString2(assetTotal),
        rows: assets,
      },
      liabilities: {
        total: toString2(liabilityTotal),
        rows: liabilities,
      },
      equity: {
        total: toString2(equityTotalWithProfit),
        rows: equity,
        derived: {
          netProfit: toString2(netProfit),
          netProfitFrom: fiscalYearStart.toISOString(),
          netProfitTo: asOf.toISOString(),
          computedEquity: toString2(computedEquity),
        },
      },
      totalLiabilitiesAndEquity: toString2(add(liabilityTotal, equityTotalWithProfit)),
    };
  }

  async getLedgerLines(orgId?: string, input?: ReportLedgerLinesInput) {
    if (!input) {
      throw new BadRequestException("Invalid report range");
    }
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    const { from, to } = this.normalizeRange(input);

    const lines = await this.prisma.gLLine.findMany({
      where: {
        accountId: input.accountId,
        header: {
          orgId,
          postingDate: {
            gte: from,
            lte: to,
          },
        },
      },
      include: {
        header: true,
      },
      orderBy: [{ header: { postingDate: "asc" } }, { lineNo: "asc" }],
    });

    const totals = lines.reduce(
      (acc, line) => {
        acc.debit = add(acc.debit, line.debit ?? 0);
        acc.credit = add(acc.credit, line.credit ?? 0);
        return acc;
      },
      { debit: dec(0), credit: dec(0) },
    );

    return {
      accountId: input.accountId,
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        debit: toString2(totals.debit),
        credit: toString2(totals.credit),
      },
      lines: lines.map((line) => ({
        id: line.id,
        headerId: line.headerId,
        postingDate: line.header.postingDate.toISOString(),
        sourceType: line.header.sourceType,
        sourceId: line.header.sourceId,
        memo: line.header.memo ?? null,
        debit: toAmountString(line.debit),
        credit: toAmountString(line.credit),
        currency: line.header.currency,
      })),
    };
  }

  async getArAging(orgId?: string, input?: ReportAgingInput) {
    if (!input) {
      throw new BadRequestException("Invalid report date");
    }
    const currency = await this.getOrgCurrency(orgId);
    const asOf = toEndOfDayUtc(input.asOf);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        orgId,
        status: "POSTED",
        invoiceDate: {
          lte: asOf,
        },
      },
      select: {
        id: true,
        number: true,
        invoiceDate: true,
        dueDate: true,
        total: true,
        currency: true,
        customer: {
          select: { id: true, name: true },
        },
      },
    });

    const allocations = await this.prisma.paymentReceivedAllocation.groupBy({
      by: ["invoiceId"],
      _sum: { amount: true },
      where: {
        invoice: { orgId },
        paymentReceived: {
          status: "POSTED",
          paymentDate: { lte: asOf },
        },
      },
    });
    const allocationMap = new Map(allocations.map((row) => [row.invoiceId, row._sum.amount ?? 0]));

    const creditAllocations = await this.prisma.creditNoteAllocation.groupBy({
      by: ["invoiceId"],
      _sum: { amount: true },
      where: {
        creditNote: {
          orgId,
          status: "POSTED",
          creditNoteDate: { lte: asOf },
        },
      },
    });
    for (const row of creditAllocations) {
      const current = dec(allocationMap.get(row.invoiceId) ?? 0);
      allocationMap.set(row.invoiceId, dec(current).add(row._sum.amount ?? 0));
    }

    const totals = createAgingTotals();
    const customerMap = new Map<
      string,
      { id: string; name: string; totals: ReturnType<typeof createAgingTotals>; lines: AgingLine[] }
    >();

    for (const invoice of invoices) {
      const allocated = dec(allocationMap.get(invoice.id) ?? 0);
      const outstanding = sub(invoice.total, allocated);
      if (!gt(outstanding, 0)) {
        continue;
      }
      const agingDate = invoice.dueDate ?? invoice.invoiceDate;
      const bucket = getAgingBucket(agingDate, asOf);
      const ageDays = Math.max(
        0,
        Math.floor((toStartOfDayUtc(asOf).getTime() - toStartOfDayUtc(agingDate).getTime()) / (24 * 60 * 60 * 1000)),
      );

      const customer = invoice.customer;
      const existing = customerMap.get(customer.id) ?? {
        id: customer.id,
        name: customer.name,
        totals: createAgingTotals(),
        lines: [],
      };

      const line: AgingLine = {
        id: invoice.id,
        number: invoice.number ?? "Invoice",
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: agingDate.toISOString(),
        currency: invoice.currency,
        outstanding: toString2(outstanding),
        bucket,
        ageDays,
      };

      existing.lines.push(line);
      addToAgingTotals(existing.totals, bucket, outstanding);
      addToAgingTotals(totals, bucket, outstanding);
      customerMap.set(customer.id, existing);
    }

    const customers = Array.from(customerMap.values()).map((customer) => ({
      ...customer,
      totals: {
        current: toString2(customer.totals.current),
        days1To30: toString2(customer.totals.days1To30),
        days31To60: toString2(customer.totals.days31To60),
        days61To90: toString2(customer.totals.days61To90),
        days91Plus: toString2(customer.totals.days91Plus),
      },
    }));

    customers.sort((a, b) => a.name.localeCompare(b.name));

    return {
      asOf: asOf.toISOString(),
      currency,
      totals: {
        current: toString2(totals.current),
        days1To30: toString2(totals.days1To30),
        days31To60: toString2(totals.days31To60),
        days61To90: toString2(totals.days61To90),
        days91Plus: toString2(totals.days91Plus),
      },
      customers,
    };
  }

  async getApAging(orgId?: string, input?: ReportAgingInput) {
    if (!input) {
      throw new BadRequestException("Invalid report date");
    }
    const currency = await this.getOrgCurrency(orgId);
    const asOf = toEndOfDayUtc(input.asOf);

    const bills = await this.prisma.bill.findMany({
      where: {
        orgId,
        status: "POSTED",
        billDate: {
          lte: asOf,
        },
      },
      select: {
        id: true,
        billNumber: true,
        systemNumber: true,
        billDate: true,
        dueDate: true,
        total: true,
        currency: true,
        vendor: {
          select: { id: true, name: true },
        },
      },
    });

    const allocations = await this.prisma.vendorPaymentAllocation.groupBy({
      by: ["billId"],
      _sum: { amount: true },
      where: {
        bill: { orgId },
        vendorPayment: {
          status: "POSTED",
          paymentDate: { lte: asOf },
        },
      },
    });
    const allocationMap = new Map(allocations.map((row) => [row.billId, row._sum.amount ?? 0]));

    const totals = createAgingTotals();
    const vendorMap = new Map<
      string,
      { id: string; name: string; totals: ReturnType<typeof createAgingTotals>; lines: AgingLine[] }
    >();

    for (const bill of bills) {
      const allocated = dec(allocationMap.get(bill.id) ?? 0);
      const outstanding = sub(bill.total, allocated);
      if (!gt(outstanding, 0)) {
        continue;
      }
      const agingDate = bill.dueDate ?? bill.billDate;
      const bucket = getAgingBucket(agingDate, asOf);
      const ageDays = Math.max(
        0,
        Math.floor((toStartOfDayUtc(asOf).getTime() - toStartOfDayUtc(agingDate).getTime()) / (24 * 60 * 60 * 1000)),
      );

      const vendor = bill.vendor;
      const existing = vendorMap.get(vendor.id) ?? {
        id: vendor.id,
        name: vendor.name,
        totals: createAgingTotals(),
        lines: [],
      };

      const line: AgingLine = {
        id: bill.id,
        number: bill.systemNumber ?? bill.billNumber ?? "Bill",
        invoiceDate: bill.billDate.toISOString(),
        dueDate: agingDate.toISOString(),
        currency: bill.currency,
        outstanding: toString2(outstanding),
        bucket,
        ageDays,
      };

      existing.lines.push(line);
      addToAgingTotals(existing.totals, bucket, outstanding);
      addToAgingTotals(totals, bucket, outstanding);
      vendorMap.set(vendor.id, existing);
    }

    const vendors = Array.from(vendorMap.values()).map((vendor) => ({
      ...vendor,
      totals: {
        current: toString2(vendor.totals.current),
        days1To30: toString2(vendor.totals.days1To30),
        days31To60: toString2(vendor.totals.days31To60),
        days61To90: toString2(vendor.totals.days61To90),
        days91Plus: toString2(vendor.totals.days91Plus),
      },
    }));

    vendors.sort((a, b) => a.name.localeCompare(b.name));

    return {
      asOf: asOf.toISOString(),
      currency,
      totals: {
        current: toString2(totals.current),
        days1To30: toString2(totals.days1To30),
        days31To60: toString2(totals.days31To60),
        days61To90: toString2(totals.days61To90),
        days91Plus: toString2(totals.days91Plus),
      },
      vendors,
    };
  }

  async getVatSummary(orgId?: string, input?: ReportVatSummaryInput) {
    if (!input) {
      throw new BadRequestException("Invalid report range");
    }
    const currency = await this.getOrgCurrency(orgId);
    const { from, to } = this.normalizeRange(input);

    const accounts = await this.prisma.account.findMany({
      where: { orgId, subtype: { in: ["VAT_PAYABLE", "VAT_RECEIVABLE"] } },
      select: { id: true, code: true, name: true, subtype: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const vatLines = accountIds.length
      ? await this.prisma.gLLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: accountIds },
            header: {
              orgId,
              postingDate: {
                gte: from,
                lte: to,
              },
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        })
      : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const outputAccounts: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    const inputAccounts: Array<{ accountId: string; code: string; name: string; amount: string }> = [];
    let outputTotal = dec(0);
    let inputTotal = dec(0);

    for (const row of vatLines) {
      const account = accountMap.get(row.accountId);
      if (!account) {
        continue;
      }
      const debit = dec(row._sum.debit ?? 0);
      const credit = dec(row._sum.credit ?? 0);

      if (account.subtype === "VAT_PAYABLE") {
        const amount = sub(credit, debit);
        outputTotal = add(outputTotal, amount);
        outputAccounts.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      } else if (account.subtype === "VAT_RECEIVABLE") {
        const amount = sub(debit, credit);
        inputTotal = add(inputTotal, amount);
        inputAccounts.push({
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          amount: toString2(amount),
        });
      }
    }

    outputAccounts.sort((a, b) => a.code.localeCompare(b.code));
    inputAccounts.sort((a, b) => a.code.localeCompare(b.code));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency,
      outputVat: {
        total: toString2(outputTotal),
        accounts: outputAccounts,
      },
      inputVat: {
        total: toString2(inputTotal),
        accounts: inputAccounts,
      },
      netVat: toString2(sub(outputTotal, inputTotal)),
    };
  }
}
