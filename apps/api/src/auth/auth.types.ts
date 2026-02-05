export type AuthTokenPayload = {
  sub: string;
  isInternal?: boolean;
  internalRole?: "LEDGERLITE_PRODUCT_MANAGER";
  orgId?: string;
  membershipId?: string;
  roleId?: string;
};

export type RefreshTokenPayload = {
  sub: string;
  tokenId: string;
  orgId?: string;
  membershipId?: string;
};
