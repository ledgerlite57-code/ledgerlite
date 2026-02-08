import { Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type CreditNoteListRecord = Prisma.CreditNoteGetPayload<{
  include: { customer: true };
}>;

type CreditNoteDetailRecord = Prisma.CreditNoteGetPayload<{
  include: {
    customer: true;
    lines: { include: { item: true; taxCode: true } };
    allocations: {
      include: {
        invoice: {
          select: {
            id: true;
            number: true;
            invoiceDate: true;
            dueDate: true;
            total: true;
            amountPaid: true;
            currency: true;
          };
        };
      };
    };
    refunds: {
      include: {
        bankAccount: {
          select: {
            id: true;
            name: true;
          };
        };
        paymentAccount: {
          select: {
            id: true;
            name: true;
            subtype: true;
          };
        };
      };
    };
  };
}>;

type CreditNoteUpdateRecord = Prisma.CreditNoteGetPayload<{
  include: { lines: true };
}>;

type CreditNotePostRecord = Prisma.CreditNoteGetPayload<{
  include: { customer: true; lines: true };
}>;

type CreditNoteListParams = {
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
export class CreditNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: CreditNoteListParams): Promise<{ data: CreditNoteListRecord[]; total: number }> {
    const { orgId, q, status, customerId, dateFrom, dateTo, amountMin, amountMax, page, pageSize, sortBy, sortDir } =
      params;
    const where: Prisma.CreditNoteWhereInput = { orgId };

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
      where.creditNoteDate = dateFilter;
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
      this.prisma.creditNote.findMany({
        where,
        include: { customer: true },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.creditNote.count({ where }),
    ]);

    return { data, total };
  }

  findForDetail(orgId: string, creditNoteId: string, tx?: Prisma.TransactionClient): Promise<CreditNoteDetailRecord | null> {
    const client = tx ?? this.prisma;
    return client.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      include: {
        customer: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                number: true,
                invoiceDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                currency: true,
              },
            },
          },
        },
        refunds: {
          include: {
            bankAccount: { select: { id: true, name: true } },
            paymentAccount: { select: { id: true, name: true, subtype: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  findForUpdate(orgId: string, creditNoteId: string, tx?: Prisma.TransactionClient): Promise<CreditNoteUpdateRecord | null> {
    const client = tx ?? this.prisma;
    return client.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      include: { lines: true },
    });
  }

  findForPosting(orgId: string, creditNoteId: string, tx?: Prisma.TransactionClient): Promise<CreditNotePostRecord | null> {
    const client = tx ?? this.prisma;
    return client.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      include: { customer: true, lines: true },
    });
  }

  create(data: Prisma.CreditNoteUncheckedCreateInput): Promise<CreditNoteDetailRecord> {
    return this.prisma.creditNote.create({
      data,
      include: {
        customer: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                number: true,
                invoiceDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                currency: true,
              },
            },
          },
        },
        refunds: {
          include: {
            bankAccount: { select: { id: true, name: true } },
            paymentAccount: { select: { id: true, name: true, subtype: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  update(
    creditNoteId: string,
    data: Prisma.CreditNoteUpdateInput | Prisma.CreditNoteUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.creditNote.update({ where: { id: creditNoteId }, data });
  }

  deleteLines(creditNoteId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.creditNoteLine.deleteMany({ where: { creditNoteId } });
  }

  createLines(lines: Prisma.CreditNoteLineCreateManyInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.creditNoteLine.createMany({ data: lines });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.CreditNoteOrderByWithRelationInput {
    if (!sortBy) {
      return { creditNoteDate: "desc" };
    }
    const direction: Prisma.SortOrder = sortDir ?? "desc";
    switch (sortBy) {
      case "total":
        return { total: direction };
      case "status":
        return { status: direction };
      case "number":
        return { number: direction };
      case "createdAt":
        return { createdAt: direction };
      case "creditNoteDate":
      default:
        return { creditNoteDate: direction };
    }
  }
}
