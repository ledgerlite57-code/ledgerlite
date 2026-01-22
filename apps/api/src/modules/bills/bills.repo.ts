import { Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type BillListRecord = Prisma.BillGetPayload<{
  include: { vendor: true };
}>;

type BillDetailRecord = Prisma.BillGetPayload<{
  include: { vendor: true; lines: { include: { item: true; taxCode: true; expenseAccount: true } } };
}>;

type BillUpdateRecord = Prisma.BillGetPayload<{
  include: { lines: true };
}>;

type BillPostRecord = Prisma.BillGetPayload<{
  include: { vendor: true; lines: true };
}>;

type BillListParams = {
  orgId: string;
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: Prisma.SortOrder;
};

@Injectable()
export class BillsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: BillListParams): Promise<{ data: BillListRecord[]; total: number }> {
    const { orgId, q, status, page, pageSize, sortBy, sortDir } = params;
    const where: Prisma.BillWhereInput = { orgId };

    if (status) {
      const normalized = status.toUpperCase() as DocumentStatus;
      if (Object.values(DocumentStatus).includes(normalized)) {
        where.status = normalized;
      }
    }
    if (q) {
      where.OR = [
        { systemNumber: { contains: q, mode: "insensitive" } },
        { billNumber: { contains: q, mode: "insensitive" } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const orderBy = this.resolveSort(sortBy, sortDir);
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        include: { vendor: true },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.bill.count({ where }),
    ]);

    return { data, total };
  }

  findForDetail(orgId: string, billId: string, tx?: Prisma.TransactionClient): Promise<BillDetailRecord | null> {
    const client = tx ?? this.prisma;
    return client.bill.findFirst({
      where: { id: billId, orgId },
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true, expenseAccount: true }, orderBy: { lineNo: "asc" } },
      },
    });
  }

  findForUpdate(orgId: string, billId: string, tx?: Prisma.TransactionClient): Promise<BillUpdateRecord | null> {
    const client = tx ?? this.prisma;
    return client.bill.findFirst({
      where: { id: billId, orgId },
      include: { lines: true },
    });
  }

  findForPosting(orgId: string, billId: string, tx?: Prisma.TransactionClient): Promise<BillPostRecord | null> {
    const client = tx ?? this.prisma;
    return client.bill.findFirst({
      where: { id: billId, orgId },
      include: { vendor: true, lines: true },
    });
  }

  create(data: Prisma.BillUncheckedCreateInput): Promise<BillDetailRecord> {
    return this.prisma.bill.create({
      data,
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true, expenseAccount: true }, orderBy: { lineNo: "asc" } },
      },
    });
  }

  update(
    billId: string,
    data: Prisma.BillUpdateInput | Prisma.BillUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.bill.update({ where: { id: billId }, data });
  }

  deleteLines(billId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.billLine.deleteMany({ where: { billId } });
  }

  createLines(lines: Prisma.BillLineCreateManyInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.billLine.createMany({ data: lines });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.BillOrderByWithRelationInput {
    if (!sortBy) {
      return { billDate: "desc" };
    }
    const direction: Prisma.SortOrder = sortDir ?? "desc";
    switch (sortBy) {
      case "dueDate":
        return { dueDate: direction };
      case "total":
        return { total: direction };
      case "status":
        return { status: direction };
      case "systemNumber":
        return { systemNumber: direction };
      case "createdAt":
        return { createdAt: direction };
      case "billDate":
      default:
        return { billDate: direction };
    }
  }
}
