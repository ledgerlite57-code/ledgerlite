# 18 - Release Identification & Public UX User Stories

## Purpose

Define user stories and acceptance criteria for:

- release identification in-app (version + environment),
- a clear public landing page,
- a conversion-focused signup experience.

Implementation task breakdown:
- `docs/19-release-identification-and-public-ux-implementation-tasks.md`

---

## Epic 1: Application Release Identification & Environment Awareness

### Goal

Ensure users, testers, and support teams can instantly identify the app version and environment (`DEV` / `STAGE` / `PROD`) to reduce confusion and deployment/reporting mistakes.

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

`LedgerLite © 2026 • v1.4.2`

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

`LedgerLite © 2026 • v1.4.2 • PROD`

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

### Goal

Create a professional landing page that quickly explains product value to non-technical users, builds trust, and drives signup.

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
Manage your business finances, invoices, and taxes — all in one place.

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

### Goal

Reduce signup friction and make account creation feel simple, safe, and fast.

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
  - "You can add your company details later"
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

## Non-Functional Requirements

- Fast page load
- Responsive across desktop, tablet, mobile
- Content structure should support future localization
- Footer version info must not expose sensitive data
