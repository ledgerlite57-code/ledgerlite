# 25 - Completed Sprint User Stories

## Purpose

Keep a status-sorted snapshot of sprint-planning user stories that are implemented and validated.

Last updated: 2026-02-05

Source story documents:
- `docs/18-release-identification-and-public-ux-user-stories.md`
- `docs/20-inventory-and-ops-usability-user-stories.md`
- `docs/22-auth-onboarding-monitoring-admin-user-stories.md`

---

## Release Identification & Public UX (Doc 18)

## Epic 1: Application Release Identification & Environment Awareness

### User Story 1.1 - Display Application Version in Footer

As a system user (Admin, Accountant, or Staff),
I want to see the application version number in the dashboard footer,
So that I can easily identify which release I am currently using.

#### Acceptance Criteria

- Footer displays:
  - application name
  - version number (example: `v1.4.2`)
- Version is visible on:
  - dashboard
  - all authenticated pages
- Version is read-only from UI
- Version source:
  - build metadata (preferred), or
  - environment configuration

#### Example

`LedgerLite (c) 2026 - v1.4.2`

### User Story 1.2 - Display Environment Indicator (DEV / STAGE / PROD)

As a developer, tester, or support engineer,
I want a clear environment label in the footer,
So that I do not confuse test data with live production data.

#### Acceptance Criteria

- Environment label is shown alongside version
- Supported labels:
  - `DEV`
  - `STAGE`
  - `PROD`
- Color coding:
  - `DEV` -> Blue
  - `STAGE` -> Orange
  - `PROD` -> Green
- `PROD` must not show debug-style warnings

#### Example

`LedgerLite (c) 2026 - v1.4.2 - PROD`

### User Story 1.3 - Environment Safety Awareness (Optional)

As a system administrator,
I want visual confirmation when I am working in non-production,
So that accidental actions in test environments are clearly understood.

#### Acceptance Criteria

- `DEV` / `STAGE` can optionally show:
  - subtle banner, or
  - small badge
- `PROD` remains clean/professional
- Feature is configurable by environment

---

## Epic 2: Public Landing Page - Product-Focused & Easy to Understand

### User Story 2.1 - Create a Clear, Modern Landing Page

As a visitor or potential customer,
I want a clean and informative landing page,
So that I understand what the application does within a few seconds.

#### Acceptance Criteria

- Landing page includes:
  - hero section with value proposition
  - simple explanation of what app does
  - who app is for
  - key benefits
  - CTA (`Sign Up` / `Get Started`)
- Content avoids accounting jargon
- Language is simple and business-friendly

#### Example Hero Message

**Simple Accounting. Clear Numbers. Full Control.**
Manage your business finances, invoices, and taxes - all in one place.

### User Story 2.2 - Explain Features in Simple Language

As a non-technical business owner,
I want features explained in simple terms,
So that I do not feel overwhelmed or confused.

#### Acceptance Criteria

- Features are grouped visually
- Each feature has:
  - icon
  - short title
  - one-line explanation

#### Example Features

- **Invoices & Bills** - Create and track what you send and receive
- **Expenses** - Know where your money goes
- **Reports** - See profit, loss, and tax summaries
- **Audit-Ready** - Keep records clean and compliant

### User Story 2.3 - Build Trust Through Professional Design

As a first-time visitor,
I want the site to look modern and trustworthy,
So that I feel confident signing up.

#### Acceptance Criteria

- Consistent color palette
- Clean typography
- Readable spacing and layout
- Mobile-responsive design
- No clutter or excessive text

---

## Epic 3: Signup Page - Clean, Friendly & Conversion-Focused

### User Story 3.1 - Improve Signup Page UI/UX

As a new user,
I want a simple and welcoming signup page,
So that I can create an account without confusion.

#### Acceptance Criteria

- Signup page includes:
  - only required fields
  - clear labels/placeholders
  - helpful validation messages
- Visual style matches landing page branding
- No unnecessary technical wording

### User Story 3.2 - Guide Users During Signup

As a first-time user,
I want clarity on what happens after signup,
So that I feel comfortable completing the process.

#### Acceptance Criteria

- Helper text examples:
  - "No credit card required"
- Trust signals shown (secure signup / privacy note)

### User Story 3.3 - Clear Call-to-Action & Navigation

As a visitor,
I want clear buttons and navigation,
So that I know exactly what to do next.

#### Acceptance Criteria

- Primary CTA: `Create Free Account`
- Secondary CTA: `Already have an account? Sign in`
- CTA buttons are visually prominent

---

## Inventory and Operations Usability (Doc 20)

## Epic 2: Transaction Entry Usability

### User Story 2.1 - Wider line-item search selector

As a billing user,
I want a wider line-item search box,
So that I can read long item names/SKUs without truncation.

#### Acceptance Criteria

- Line-item combobox width is increased on desktop.
- Mobile layout remains full-width and usable.
- Search result rows can show item name + SKU cleanly.

## Epic 3: Organization Settings with Progressive Completion

### User Story 3.1 - Only critical organization fields are mandatory

As a new organization admin,
I want only the most important fields required upfront,
So that I can complete setup quickly and continue using the app.

#### Acceptance Criteria

- Mandatory fields are limited to critical setup data.
- Non-critical fields become optional.
- Validation messages clearly distinguish required vs optional.

### User Story 3.2 - Allow save-and-complete-later flow

As an organization admin,
I want to save settings with partial data,
So that I can return later to finish complete profile details.

#### Acceptance Criteria

- Partial saves are allowed.
- Completion indicator shows setup completeness state.
- Missing optional fields do not block core app usage.

---

## Auth and Invitations (Doc 22)

## Epic 4: Secure Signup and Email Verification

### User Story 4.1 - Email verification during signup

As a new user,
I want to verify my email after signup,
So that only valid and controlled accounts can activate.

#### Acceptance Criteria

- Signup creates account in `UNVERIFIED` state.
- Verification email is mandatory and sent immediately.
- Verification link:
  - expires in 24 hours,
  - is one-time use,
  - cannot be replayed after success.
- Unverified users cannot complete login.
- Login response for unverified user includes actionable message:
  - "Please verify your email."
- Successful verification activates user.
- After verification, organization setup may be suggested, but is not enforced as a hard gate.

## Epic 5: User Invitations and Secure Password Creation

### User Story 5.1 - Send invite emails with tracked lifecycle

As an organization admin,
I want to invite users by email and role,
So that team access is added safely.

#### Acceptance Criteria

- Admin can send invite with:
  - email,
  - role.
- Invite status is tracked:
  - `SENT`,
  - `ACCEPTED`,
  - `EXPIRED`,
  - optional `REVOKED`.
- Resend/revoke are audited actions.

### User Story 5.2 - Invite link password creation flow

As an invited user,
I want to set my own password from a secure invite link,
So that credentials remain private.

#### Acceptance Criteria

- Invite email includes one-time tokenized link.
- Link expiry is 48 hours.
- Flow:
  - open link,
  - set password,
  - account activates,
  - login succeeds.
- Reused or expired links are rejected with clear message.

