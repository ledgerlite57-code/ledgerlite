import { Injectable } from "@nestjs/common";
import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";

type PurchaseOrderListRecord = Prisma.PurchaseOrderGetPayload<{
  include: { vendor: true };
}>;

type PurchaseOrderDetailRecord = Prisma.PurchaseOrderGetPayload<{
  include: {
    vendor: true;
    bills: true;
    lines: { include: { item: true; taxCode: true; expenseAccount: true; unitOfMeasure: true } };
  };
}>;

type PurchaseOrderUpdateRecord = Prisma.PurchaseOrderGetPayload<{
  include: { lines: true };
}>;

type PurchaseOrderListParams = {
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
export class PurchaseOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: PurchaseOrderListParams): Promise<{ data: PurchaseOrderListRecord[]; total: number }> {
    const { orgId, q, status, vendorId, dateFrom, dateTo, amountMin, amountMax, page, pageSize, sortBy, sortDir } =
      params;
    const where: Prisma.PurchaseOrderWhereInput = { orgId };

    if (status) {
      const normalized = status.toUpperCase() as PurchaseOrderStatus;
      if (Object.values(PurchaseOrderStatus).includes(normalized)) {
        where.status = normalized;
      }
    }
    if (q) {
      where.OR = [
        { systemNumber: { contains: q, mode: "insensitive" } },
        { poNumber: { contains: q, mode: "insensitive" } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (vendorId) {
      where.vendorId = vendorId;
    }
    if (dateFrom || dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (dateFrom) {
        dateFilter.gte = toStartOfDayUtc(dateFrom);
      }
      if (dateTo) {
        dateFilter.lte = toEndOfDayUtc(dateTo);
      }
      where.poDate = dateFilter;
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
      this.prisma.purchaseOrder.findMany({
        where,
        include: { vendor: true },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data, total };
  }

  findForDetail(
    orgId: string,
    purchaseOrderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PurchaseOrderDetailRecord | null> {
    const client = tx ?? this.prisma;
    return client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, orgId },
      include: {
        vendor: true,
        bills: true,
        lines: {
          include: { item: true, taxCode: true, expenseAccount: true, unitOfMeasure: true },
          orderBy: { lineNo: "asc" },
        },
      },
    });
  }

  findForUpdate(orgId: string, purchaseOrderId: string, tx?: Prisma.TransactionClient): Promise<PurchaseOrderUpdateRecord | null> {
    const client = tx ?? this.prisma;
    return client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, orgId },
      include: { lines: true },
    });
  }

  create(data: Prisma.PurchaseOrderUncheckedCreateInput): Promise<PurchaseOrderDetailRecord> {
    return this.prisma.purchaseOrder.create({
      data,
      include: {
        vendor: true,
        bills: true,
        lines: {
          include: { item: true, taxCode: true, expenseAccount: true, unitOfMeasure: true },
          orderBy: { lineNo: "asc" },
        },
      },
    });
  }

  update(
    purchaseOrderId: string,
    data: Prisma.PurchaseOrderUpdateInput | Prisma.PurchaseOrderUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.purchaseOrder.update({ where: { id: purchaseOrderId }, data });
  }

  deleteLines(purchaseOrderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.purchaseOrderLine.deleteMany({ where: { purchaseOrderId } });
  }

  createLines(lines: Prisma.PurchaseOrderLineCreateManyInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.purchaseOrderLine.createMany({ data: lines });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.PurchaseOrderOrderByWithRelationInput {
    if (!sortBy) {
      return { poDate: "desc" };
    }
    const direction: Prisma.SortOrder = sortDir ?? "desc";
    switch (sortBy) {
      case "status":
        return { status: direction };
      case "total":
        return { total: direction };
      case "expectedDeliveryDate":
        return { expectedDeliveryDate: direction };
      case "systemNumber":
        return { systemNumber: direction };
      case "createdAt":
        return { createdAt: direction };
      case "poDate":
      default:
        return { poDate: direction };
    }
  }
}
