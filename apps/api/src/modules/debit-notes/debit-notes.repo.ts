import { Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type DebitNoteListRecord = Prisma.DebitNoteGetPayload<{
  include: { vendor: true };
}>;

type DebitNoteDetailRecord = Prisma.DebitNoteGetPayload<{
  include: {
    vendor: true;
    lines: { include: { item: true; taxCode: true } };
    allocations: {
      include: {
        bill: {
          select: {
            id: true;
            billNumber: true;
            systemNumber: true;
            billDate: true;
            dueDate: true;
            total: true;
            amountPaid: true;
            currency: true;
          };
        };
      };
    };
  };
}>;

type DebitNoteUpdateRecord = Prisma.DebitNoteGetPayload<{
  include: { lines: true };
}>;

type DebitNotePostRecord = Prisma.DebitNoteGetPayload<{
  include: { vendor: true; lines: true };
}>;

type DebitNoteListParams = {
  orgId: string;
  q?: string;
  status?: string;
  vendorId?: string;
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
export class DebitNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: DebitNoteListParams): Promise<{ data: DebitNoteListRecord[]; total: number }> {
    const { orgId, q, status, vendorId, dateFrom, dateTo, amountMin, amountMax, page, pageSize, sortBy, sortDir } =
      params;
    const where: Prisma.DebitNoteWhereInput = { orgId };

    if (status) {
      const normalized = status.toUpperCase() as DocumentStatus;
      if (Object.values(DocumentStatus).includes(normalized)) {
        where.status = normalized;
      }
    }
    if (vendorId) {
      where.vendorId = vendorId;
    }
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
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
      where.debitNoteDate = dateFilter;
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
      this.prisma.debitNote.findMany({
        where,
        include: { vendor: true },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.debitNote.count({ where }),
    ]);

    return { data, total };
  }

  findForDetail(orgId: string, debitNoteId: string, tx?: Prisma.TransactionClient): Promise<DebitNoteDetailRecord | null> {
    const client = tx ?? this.prisma;
    return client.debitNote.findFirst({
      where: { id: debitNoteId, orgId },
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
        allocations: {
          include: {
            bill: {
              select: {
                id: true,
                billNumber: true,
                systemNumber: true,
                billDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                currency: true,
              },
            },
          },
        },
      },
    });
  }

  findForUpdate(orgId: string, debitNoteId: string, tx?: Prisma.TransactionClient): Promise<DebitNoteUpdateRecord | null> {
    const client = tx ?? this.prisma;
    return client.debitNote.findFirst({
      where: { id: debitNoteId, orgId },
      include: { lines: true },
    });
  }

  findForPosting(orgId: string, debitNoteId: string, tx?: Prisma.TransactionClient): Promise<DebitNotePostRecord | null> {
    const client = tx ?? this.prisma;
    return client.debitNote.findFirst({
      where: { id: debitNoteId, orgId },
      include: { vendor: true, lines: true },
    });
  }

  create(data: Prisma.DebitNoteUncheckedCreateInput): Promise<DebitNoteDetailRecord> {
    return this.prisma.debitNote.create({
      data,
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true }, orderBy: { lineNo: "asc" } },
        allocations: {
          include: {
            bill: {
              select: {
                id: true,
                systemNumber: true,
                billNumber: true,
                billDate: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                currency: true,
              },
            },
          },
        },
      },
    });
  }

  update(
    debitNoteId: string,
    data: Prisma.DebitNoteUpdateInput | Prisma.DebitNoteUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.debitNote.update({ where: { id: debitNoteId }, data });
  }

  deleteLines(debitNoteId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.debitNoteLine.deleteMany({ where: { debitNoteId } });
  }

  createLines(lines: Prisma.DebitNoteLineCreateManyInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.debitNoteLine.createMany({ data: lines });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.DebitNoteOrderByWithRelationInput {
    if (!sortBy) {
      return { debitNoteDate: "desc" };
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
      case "debitNoteDate":
      default:
        return { debitNoteDate: direction };
    }
  }
}
