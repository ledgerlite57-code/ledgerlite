import { Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type InvoiceListRecord = Prisma.InvoiceGetPayload<{
  include: { customer: true };
}>;

type InvoiceDetailRecord = Prisma.InvoiceGetPayload<{
  include: { customer: true; lines: { include: { item: true; taxCode: true } } };
}>;

type InvoiceUpdateRecord = Prisma.InvoiceGetPayload<{
  include: { lines: true };
}>;

type InvoicePostRecord = Prisma.InvoiceGetPayload<{
  include: { customer: true; lines: true };
}>;

type InvoiceListParams = {
  orgId: string;
  q?: string;
  status?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: Prisma.SortOrder;
};

@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: InvoiceListParams): Promise<{ data: InvoiceListRecord[]; total: number }> {
    const { orgId, q, status, customerId, dateFrom, dateTo, amountMin, amountMax, page, pageSize, sortBy, sortDir } =
      params;
    const where: Prisma.InvoiceWhereInput = { orgId };

    if (status) {
      const normalized = status.toUpperCase() as DocumentStatus;
      if (Object.values(DocumentStatus).includes(normalized)) {
        where.status = normalized;
      }
    }
    if (customerId) {
      where.customerId = customerId;
    }
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (dateFrom || dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (dateFrom) {
        dateFilter.gte = toStartOfDayUtc(dateFrom);
      }
      if (dateTo) {
        dateFilter.lte = toEndOfDayUtc(dateTo);
      }
      where.invoiceDate = dateFilter;
    }
    if (amountMin !== undefined || amountMax !== undefined) {
      const amountFilter: Prisma.DecimalFilter = {};
      if (amountMin !== undefined) {
        amountFilter.gte = amountMin;
      }
      if (amountMax !== undefined) {
        amountFilter.lte = amountMax;
      }
      where.total = amountFilter;
    }

    const orderBy = this.resolveSort(sortBy, sortDir);
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { customer: true },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total };
  }

  findForDetail(orgId: string, invoiceId: string, tx?: Prisma.TransactionClient): Promise<InvoiceDetailRecord | null> {
    const client = tx ?? this.prisma;
    return client.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: {
        customer: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
      },
    });
  }

  findForUpdate(orgId: string, invoiceId: string, tx?: Prisma.TransactionClient): Promise<InvoiceUpdateRecord | null> {
    const client = tx ?? this.prisma;
    return client.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { lines: true },
    });
  }

  findForPosting(orgId: string, invoiceId: string, tx?: Prisma.TransactionClient): Promise<InvoicePostRecord | null> {
    const client = tx ?? this.prisma;
    return client.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: { customer: true, lines: true },
    });
  }

  create(data: Prisma.InvoiceUncheckedCreateInput): Promise<InvoiceDetailRecord> {
    return this.prisma.invoice.create({
      data,
      include: {
        customer: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
      },
    });
  }

  update(
    invoiceId: string,
    data: Prisma.InvoiceUpdateInput | Prisma.InvoiceUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.invoice.update({ where: { id: invoiceId }, data });
  }

  deleteLines(invoiceId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.invoiceLine.deleteMany({ where: { invoiceId } });
  }

  createLines(lines: Prisma.InvoiceLineCreateManyInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.invoiceLine.createMany({ data: lines });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.InvoiceOrderByWithRelationInput {
    if (!sortBy) {
      return { invoiceDate: "desc" };
    }
    const direction: Prisma.SortOrder = sortDir ?? "desc";
    switch (sortBy) {
      case "dueDate":
        return { dueDate: direction };
      case "total":
        return { total: direction };
      case "status":
        return { status: direction };
      case "number":
        return { number: direction };
      case "createdAt":
        return { createdAt: direction };
      case "invoiceDate":
      default:
        return { invoiceDate: direction };
    }
  }
}
