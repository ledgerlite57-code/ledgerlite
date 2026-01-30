import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { PERMISSIONS_KEY } from "./permissions.decorator";
import { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { PermissionCode, Permissions } from "@ledgerlite/shared";

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Missing auth context");
    }

    const isBootstrapOrgCreate =
      request.method === "POST" &&
      (request.path === "/orgs" || request.path === "/orgs/") &&
      required.includes(Permissions.ORG_WRITE) &&
      !user.orgId &&
      !user.roleId;

    if (isBootstrapOrgCreate) {
      return true;
    }
    const isBootstrapOrgRead =
      request.method === "GET" &&
      (request.path === "/orgs/current" || request.path === "/orgs/current/") &&
      required.includes(Permissions.ORG_READ) &&
      !user.orgId &&
      !user.roleId;

    if (isBootstrapOrgRead) {
      return true;
    }

    if (!user.orgId || !user.roleId || !user.membershipId) {
      throw new ForbiddenException("Missing membership context");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: user.membershipId,
        userId: user.sub,
        orgId: user.orgId,
        isActive: true,
      },
      select: { roleId: true },
    });

    if (!membership || membership.roleId !== user.roleId) {
      throw new ForbiddenException("Membership is inactive or invalid");
    }

    const roleId = membership.roleId;
    if (!roleId) {
      throw new ForbiddenException("Insufficient permissions");
    }

    const count = await this.prisma.rolePermission.count({
      where: {
        roleId,
        permissionCode: { in: required },
      },
    });

    if (count !== required.length) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
