import { Permissions, type PermissionCode } from "./permissions";

export const OnboardingTracks = {
  OWNER: "OWNER",
  ACCOUNTANT: "ACCOUNTANT",
  OPERATOR: "OPERATOR",
} as const;

export type OnboardingTrack = (typeof OnboardingTracks)[keyof typeof OnboardingTracks];

export const OnboardingStepIds = {
  ORG_PROFILE: "ORG_PROFILE",
  CHART_DEFAULTS: "CHART_DEFAULTS",
  TAX_SETUP: "TAX_SETUP",
  BANK_SETUP: "BANK_SETUP",
  MASTER_DATA: "MASTER_DATA",
  FIRST_TRANSACTION: "FIRST_TRANSACTION",
  TEAM_INVITE: "TEAM_INVITE",
} as const;

export type OnboardingStepId = (typeof OnboardingStepIds)[keyof typeof OnboardingStepIds];

export const OnboardingRuleCodes = {
  ORG_PROFILE_CORE_FIELDS_SET: "ORG_PROFILE_CORE_FIELDS_SET",
  ORG_SETTINGS_PRESENT: "ORG_SETTINGS_PRESENT",
  CORE_ACCOUNTS_PRESENT: "CORE_ACCOUNTS_PRESENT",
  DEFAULT_GL_LINKS_PRESENT: "DEFAULT_GL_LINKS_PRESENT",
  VAT_DISABLED_OR_TAX_CODE_EXISTS: "VAT_DISABLED_OR_TAX_CODE_EXISTS",
  ACTIVE_BANK_ACCOUNT_EXISTS: "ACTIVE_BANK_ACCOUNT_EXISTS",
  MASTER_DATA_BY_PERMISSION_READY: "MASTER_DATA_BY_PERMISSION_READY",
  FIRST_POSTED_TRANSACTION_EXISTS: "FIRST_POSTED_TRANSACTION_EXISTS",
  TEAM_MEMBER_OR_INVITE_EXISTS: "TEAM_MEMBER_OR_INVITE_EXISTS",
} as const;

export type OnboardingRuleCode = (typeof OnboardingRuleCodes)[keyof typeof OnboardingRuleCodes];

export type OnboardingStepDefinition = {
  id: OnboardingStepId;
  title: string;
  description: string;
  completionRules: readonly OnboardingRuleCode[];
  requiredAnyPermissions?: readonly PermissionCode[];
  autoCompleteWhenNoPermission?: boolean;
};

const firstTransactionPermissions = [
  Permissions.INVOICE_POST,
  Permissions.BILL_POST,
  Permissions.EXPENSE_POST,
  Permissions.PAYMENT_RECEIVED_POST,
  Permissions.VENDOR_PAYMENT_POST,
  Permissions.JOURNAL_POST,
  Permissions.PDC_POST,
] as const;

export const ONBOARDING_STEP_DEFINITIONS: Record<OnboardingStepId, OnboardingStepDefinition> = {
  [OnboardingStepIds.ORG_PROFILE]: {
    id: OnboardingStepIds.ORG_PROFILE,
    title: "Complete organization profile",
    description: "Set legal identity and localization details for the organization.",
    completionRules: [OnboardingRuleCodes.ORG_PROFILE_CORE_FIELDS_SET],
    requiredAnyPermissions: [Permissions.ORG_WRITE],
  },
  [OnboardingStepIds.CHART_DEFAULTS]: {
    id: OnboardingStepIds.CHART_DEFAULTS,
    title: "Validate chart defaults",
    description: "Confirm core chart accounts and org settings default account links.",
    completionRules: [
      OnboardingRuleCodes.ORG_SETTINGS_PRESENT,
      OnboardingRuleCodes.CORE_ACCOUNTS_PRESENT,
      OnboardingRuleCodes.DEFAULT_GL_LINKS_PRESENT,
    ],
    requiredAnyPermissions: [Permissions.COA_READ, Permissions.ORG_READ],
  },
  [OnboardingStepIds.TAX_SETUP]: {
    id: OnboardingStepIds.TAX_SETUP,
    title: "Configure VAT and tax codes",
    description: "Ensure tax codes are available when VAT is enabled.",
    completionRules: [OnboardingRuleCodes.VAT_DISABLED_OR_TAX_CODE_EXISTS],
    requiredAnyPermissions: [Permissions.TAX_READ, Permissions.ORG_READ],
    autoCompleteWhenNoPermission: true,
  },
  [OnboardingStepIds.BANK_SETUP]: {
    id: OnboardingStepIds.BANK_SETUP,
    title: "Link at least one bank account",
    description: "Create an active bank account connected to a valid GL account.",
    completionRules: [OnboardingRuleCodes.ACTIVE_BANK_ACCOUNT_EXISTS],
    requiredAnyPermissions: [Permissions.BANK_READ],
    autoCompleteWhenNoPermission: true,
  },
  [OnboardingStepIds.MASTER_DATA]: {
    id: OnboardingStepIds.MASTER_DATA,
    title: "Create first master record",
    description: "Create at least one customer or vendor based on assigned role capabilities.",
    completionRules: [OnboardingRuleCodes.MASTER_DATA_BY_PERMISSION_READY],
    requiredAnyPermissions: [Permissions.CUSTOMER_WRITE, Permissions.VENDOR_WRITE],
    autoCompleteWhenNoPermission: true,
  },
  [OnboardingStepIds.FIRST_TRANSACTION]: {
    id: OnboardingStepIds.FIRST_TRANSACTION,
    title: "Post first transaction",
    description: "Post at least one accounting transaction in the role's allowed module.",
    completionRules: [OnboardingRuleCodes.FIRST_POSTED_TRANSACTION_EXISTS],
    requiredAnyPermissions: firstTransactionPermissions,
    autoCompleteWhenNoPermission: true,
  },
  [OnboardingStepIds.TEAM_INVITE]: {
    id: OnboardingStepIds.TEAM_INVITE,
    title: "Invite your team",
    description: "Send at least one invite or add one additional member to the organization.",
    completionRules: [OnboardingRuleCodes.TEAM_MEMBER_OR_INVITE_EXISTS],
    requiredAnyPermissions: [Permissions.USER_INVITE],
    autoCompleteWhenNoPermission: true,
  },
};

export const ONBOARDING_TRACK_STEPS: Record<OnboardingTrack, readonly OnboardingStepId[]> = {
  [OnboardingTracks.OWNER]: [
    OnboardingStepIds.ORG_PROFILE,
    OnboardingStepIds.CHART_DEFAULTS,
    OnboardingStepIds.TAX_SETUP,
    OnboardingStepIds.BANK_SETUP,
    OnboardingStepIds.FIRST_TRANSACTION,
    OnboardingStepIds.TEAM_INVITE,
  ],
  [OnboardingTracks.ACCOUNTANT]: [
    OnboardingStepIds.CHART_DEFAULTS,
    OnboardingStepIds.TAX_SETUP,
    OnboardingStepIds.BANK_SETUP,
    OnboardingStepIds.FIRST_TRANSACTION,
  ],
  [OnboardingTracks.OPERATOR]: [OnboardingStepIds.MASTER_DATA, OnboardingStepIds.FIRST_TRANSACTION],
};

export const ROLE_NAME_TO_ONBOARDING_TRACK: Record<string, OnboardingTrack> = {
  Owner: OnboardingTracks.OWNER,
  Accountant: OnboardingTracks.ACCOUNTANT,
  Sales: OnboardingTracks.OPERATOR,
  Purchases: OnboardingTracks.OPERATOR,
  Viewer: OnboardingTracks.OPERATOR,
};

export const ONBOARDING_RULE_NOTES: Record<OnboardingRuleCode, string> = {
  [OnboardingRuleCodes.ORG_PROFILE_CORE_FIELDS_SET]:
    "Organization has name, legalName, countryCode, baseCurrency, fiscalYearStartMonth, and timeZone.",
  [OnboardingRuleCodes.ORG_SETTINGS_PRESENT]: "Org settings row exists for the organization.",
  [OnboardingRuleCodes.CORE_ACCOUNTS_PRESENT]:
    "Core chart contains AR, AP, VAT Payable, and at least one bank/cash account.",
  [OnboardingRuleCodes.DEFAULT_GL_LINKS_PRESENT]:
    "Org settings default AR/AP account links are set; inventory defaults are recommended when inventory is used.",
  [OnboardingRuleCodes.VAT_DISABLED_OR_TAX_CODE_EXISTS]:
    "Step is complete when VAT is disabled OR when at least one active tax code exists.",
  [OnboardingRuleCodes.ACTIVE_BANK_ACCOUNT_EXISTS]:
    "At least one active bank account exists with a linked GL account.",
  [OnboardingRuleCodes.MASTER_DATA_BY_PERMISSION_READY]:
    "If role can manage customers/vendors, at least one relevant master record exists; otherwise mark not-applicable.",
  [OnboardingRuleCodes.FIRST_POSTED_TRANSACTION_EXISTS]:
    "At least one posted document exists in any module the role can post.",
  [OnboardingRuleCodes.TEAM_MEMBER_OR_INVITE_EXISTS]:
    "Organization has at least one invite sent or more than one membership.",
};

export const DEFAULT_ONBOARDING_TRACK: OnboardingTrack = OnboardingTracks.OPERATOR;

export const resolveOnboardingTrack = (roleName?: string | null): OnboardingTrack => {
  if (!roleName) {
    return DEFAULT_ONBOARDING_TRACK;
  }
  const normalizedRoleName = roleName.trim().toLowerCase();
  if (!normalizedRoleName) {
    return DEFAULT_ONBOARDING_TRACK;
  }
  const knownRoleName = Object.keys(ROLE_NAME_TO_ONBOARDING_TRACK).find(
    (name) => name.toLowerCase() === normalizedRoleName,
  );
  if (!knownRoleName) {
    return DEFAULT_ONBOARDING_TRACK;
  }
  return ROLE_NAME_TO_ONBOARDING_TRACK[knownRoleName];
};
