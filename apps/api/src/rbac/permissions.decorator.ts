import { SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "@ledgerlite/shared";

export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
