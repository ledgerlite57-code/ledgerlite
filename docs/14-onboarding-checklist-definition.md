# 14 - Role-Based Onboarding Checklist Definition (Sprint 1 / S1-O001-T01)

## Purpose

Define a shared, implementation-ready checklist contract for `US-P1-ONB-001` before persistence and APIs are added.

## Role track mapping

Current system roles are mapped to onboarding tracks as follows:

| System Role (`Role.name`) | Onboarding Track | Notes |
| --- | --- | --- |
| `Owner` | `OWNER` | Full setup + team provisioning path. |
| `Accountant` | `ACCOUNTANT` | Finance setup path. |
| `Sales` | `OPERATOR` | Transaction-operator path. |
| `Purchases` | `OPERATOR` | Transaction-operator path. |
| `Viewer` | `OPERATOR` | Read-only users may auto-complete permission-gated steps as not-applicable. |

> Source of truth: `packages/shared/src/onboarding.ts`

## Step catalog and completion intent

| Step ID | Title | Completion rule codes | Permission gating |
| --- | --- | --- | --- |
| `ORG_PROFILE` | Complete organization profile | `ORG_PROFILE_CORE_FIELDS_SET` | `ORG_WRITE` |
| `CHART_DEFAULTS` | Validate chart defaults | `ORG_SETTINGS_PRESENT`, `CORE_ACCOUNTS_PRESENT`, `DEFAULT_GL_LINKS_PRESENT` | `COA_READ` or `ORG_READ` |
| `TAX_SETUP` | Configure VAT and tax codes | `VAT_DISABLED_OR_TAX_CODE_EXISTS` | `TAX_READ` or `ORG_READ` (auto-complete if not permitted) |
| `BANK_SETUP` | Link at least one bank account | `ACTIVE_BANK_ACCOUNT_EXISTS` | `BANK_READ` (auto-complete if not permitted) |
| `MASTER_DATA` | Create first master record | `MASTER_DATA_BY_PERMISSION_READY` | `CUSTOMER_WRITE` or `VENDOR_WRITE` (auto-complete if not permitted) |
| `FIRST_TRANSACTION` | Post first transaction | `FIRST_POSTED_TRANSACTION_EXISTS` | Any `*_POST` permission (auto-complete if not permitted) |
| `TEAM_INVITE` | Invite your team | `TEAM_MEMBER_OR_INVITE_EXISTS` | `USER_INVITE` (auto-complete if not permitted) |

## Track sequences

| Track | Ordered steps |
| --- | --- |
| `OWNER` | `ORG_PROFILE` -> `CHART_DEFAULTS` -> `TAX_SETUP` -> `BANK_SETUP` -> `FIRST_TRANSACTION` -> `TEAM_INVITE` |
| `ACCOUNTANT` | `CHART_DEFAULTS` -> `TAX_SETUP` -> `BANK_SETUP` -> `FIRST_TRANSACTION` |
| `OPERATOR` | `MASTER_DATA` -> `FIRST_TRANSACTION` |

## Rule semantics (for next tasks)

The following rule semantics are defined as notes in `ONBOARDING_RULE_NOTES`:

- `ORG_PROFILE_CORE_FIELDS_SET`: organization has core legal/localization fields.
- `ORG_SETTINGS_PRESENT`: org settings row exists.
- `CORE_ACCOUNTS_PRESENT`: AR/AP/VAT/bank-cash foundations exist.
- `DEFAULT_GL_LINKS_PRESENT`: org default AR/AP links exist (inventory defaults recommended).
- `VAT_DISABLED_OR_TAX_CODE_EXISTS`: VAT off OR at least one active tax code.
- `ACTIVE_BANK_ACCOUNT_EXISTS`: at least one active bank account with GL link.
- `MASTER_DATA_BY_PERMISSION_READY`: customer/vendor data based on role capabilities.
- `FIRST_POSTED_TRANSACTION_EXISTS`: first posted document in an allowed module.
- `TEAM_MEMBER_OR_INVITE_EXISTS`: at least one invite sent or additional member joined.

## Assumptions and TODOs

- Assumption: "operator" in user stories maps to `Sales`, `Purchases`, and `Viewer` roles in current codebase.
- Assumption: permission-gated steps can be marked not-applicable when a role lacks required permissions.
- TODO (`S1-O001-T02/T03`): implement persistence and evaluation engine that calculates completion and not-applicable states per member.
- TODO (`S1-O001-T04/T05`): render checklist UI and bind step progress to real module actions.
