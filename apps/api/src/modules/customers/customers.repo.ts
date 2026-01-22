import { Injectable } from "@nestjs/common";
import { Prisma, type Customer } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type CustomerListParams = {
  orgId: string;
  q?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: Prisma.SortOrder;
};

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: CustomerListParams): Promise<{ data: Customer[]; total: number }> {
    const { orgId, q, isActive, page, pageSize, sortBy, sortDir } = params;
    const where: Prisma.CustomerWhereInput = { orgId };

    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy = this.resolveSort(sortBy, sortDir);
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy, skip, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total };
  }

  findById(orgId: string, customerId: string) {
    return this.prisma.customer.findFirst({ where: { id: customerId, orgId } });
  }

  create(data: Prisma.CustomerUncheckedCreateInput) {
    return this.prisma.customer.create({ data });
  }

  update(customerId: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({ where: { id: customerId }, data });
  }

  private resolveSort(sortBy?: string, sortDir?: Prisma.SortOrder): Prisma.CustomerOrderByWithRelationInput {
    const direction: Prisma.SortOrder = sortDir ?? "asc";

    switch (sortBy) {
      case "createdAt":
        return { createdAt: direction };
      case "email":
        return { email: direction };
      default:
        return { name: direction };
    }
  }
}
