import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuditLogQueryInput } from "@ledgerlite/shared";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(orgId?: string, params?: AuditLogQueryInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = { orgId };

    if (params?.from || params?.to) {
      where.createdAt = {};
      if (params.from) {
        where.createdAt.gte = startOfDay(params.from);
      }
      if (params.to) {
        where.createdAt.lte = endOfDay(params.to);
      }
    }

    if (params?.entityType) {
      const entityType = params.entityType.trim();
      if (entityType) {
        where.entityType = { contains: entityType, mode: "insensitive" };
      }
    }

    if (params?.actor) {
      const actor = params.actor.trim();
      if (isUuid(actor)) {
        where.actorUserId = actor;
      } else if (actor) {
        where.actor = { email: { contains: actor, mode: "insensitive" } };
      }
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      pageInfo: {
        page,
        pageSize,
        total,
      },
    };
  }
}
