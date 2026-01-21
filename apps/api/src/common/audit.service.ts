import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContext } from "../logging/request-context";
import { AuditAction } from "@prisma/client";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    orgId: string;
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
  }) {
    const context = RequestContext.get();
    return this.prisma.auditLog.create({
      data: {
        orgId: params.orgId,
        actorUserId: params.actorUserId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
        requestId: context?.requestId,
      },
    });
  }
}
