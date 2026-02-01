export type AuthTokenPayload = {
  sub: string;
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
