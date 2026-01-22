import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { add, dec, gt, sub, toString2 } from "../../common/money";
import { addToAgingTotals, createAgingTotals, getAgingBucket } from "../../reports.utils";
import type {
  ReportAsOfInput,
  ReportAgingInput,
  ReportLedgerLinesInput,
  ReportRangeInput,
  ReportVatSummaryInput,
} from "@ledgerlite/shared";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

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
      select: { baseCurrency: true, fiscalYearStartMonth: true },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }
    return {
      baseCurrency: org.baseCurrency ?? "AED",
      fiscalYearStartMonth: org.fiscalYearStartMonth ?? 1,
    };
  }

  private async getOrgCurrency(orgId?: string) {
    const settings = await this.getOrgSettings(orgId);
    return settings.baseCurrency;
  }

  private normalizeRange(range: ReportRangeInput) {
    return {
      from: startOfDay(range.from),
      to: endOfDay(range.to),
    };
  }

  async getTrialBalance(orgId?: string, input?: ReportRangeInput) {
    if (!input) {
      throw new BadRequestException("Invalid report range");
    }
    const currency = await this.getOrgCurrency(orgId);
    const { from, to } = this.normalizeRange(input);

    const grouped = await this.prisma.gLLine.groupBy({
      by: ["accountId"],
      where: {
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
    });

    const accountIds = grouped.map((row) => row.accountId);
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { orgId, id: { in: accountIds } },
          select: { id: true, code: true, name: true, type: true },
        })
      : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const totals = grouped.reduce(
      (acc, row) => {
        acc.debit = add(acc.debit, row._sum.debit ?? 0);
        acc.credit = add(acc.credit, row._sum.credit ?? 0);
        return acc;
      },
      { debit: dec(0), credit: dec(0) },
    );

    const rows = grouped
      .map((row) => {
        const account = accountMap.get(row.accountId);
        if (!account) {
          return null;
        }
        return {
          accountId: row.accountId,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: toAmountString(row._sum.debit),
          credit: toAmountString(row._sum.credit),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
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
    const currency = await this.getOrgCurrency(orgId);
    const { from, to } = this.normalizeRange(input);

    const accounts = await this.prisma.account.findMany({
      where: { orgId, type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const grouped = accountIds.length
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
    const asOf = endOfDay(input.asOf);
    const fiscalYearStartMonth = settings.fiscalYearStartMonth;
    const fiscalYearStart =
      fiscalYearStartMonth >= 1 && fiscalYearStartMonth <= 12
        ? startOfDay(
            new Date(
              asOf.getMonth() + 1 >= fiscalYearStartMonth ? asOf.getFullYear() : asOf.getFullYear() - 1,
              fiscalYearStartMonth - 1,
              1,
            ),
          )
        : startOfDay(new Date(asOf.getFullYear(), 0, 1));

    const accounts = await this.prisma.account.findMany({
      where: { orgId, type: { in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY] } },
      select: { id: true, code: true, name: true, type: true },
    });
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
    const asOf = endOfDay(input.asOf);

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
        Math.floor((startOfDay(asOf).getTime() - startOfDay(agingDate).getTime()) / (24 * 60 * 60 * 1000)),
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
    const asOf = endOfDay(input.asOf);

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
        Math.floor((startOfDay(asOf).getTime() - startOfDay(agingDate).getTime()) / (24 * 60 * 60 * 1000)),
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
