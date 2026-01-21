# LedgerLite – Design System & UI Guidelines

This document defines the **official design system** for LedgerLite.  
It ensures **consistency, speed, correctness, and scalability** across all screens and future features.

This design system is aligned with:
- Business Requirements (BRD)
- User Stories
- Technical Architecture (NestJS + Next.js)
- shadcn/ui philosophy
- Accounting-grade UX standards (accuracy > decoration)

> **Version:** v1.0 (Refined)  
> **Status:** FROZEN (changes require v1.1+)  
> **Audience:** Product, Design, Engineering, Codex  
> **Tone:** Minimal · Modern · Accounting-Safe

---

## 1. Design Philosophy (Non-Negotiable)

LedgerLite is **financial infrastructure**, not a marketing website.

### Core Principles

1. **Information density without clutter**  
   Every pixel must serve a purpose.

2. **Consistency over creativity**  
   Predictable workflows beat clever design.

3. **Scan-first UX**  
   Users must understand a screen in under **3 seconds**.

4. **Modern minimalism**  
   Clean typography, neutral colors, subtle depth.

5. **Ledger safety first**  
   Posting, voiding, and destructive actions must feel deliberate and serious.

> If a design makes posting feel casual, it is incorrect.

---

## 2. Layout System

### 2.1 Global App Shell (MANDATORY)

┌──────────────────────────────────────────────┐
│ Header (Org | Global Actions | User Menu) │
├───────────────┬──────────────────────────────┤
│ Sidebar │ Main Content (scroll only) │
│ Modules │ │
│ │ │
└───────────────┴──────────────────────────────┘



**Rules**
- Header height: fixed
- Sidebar width: fixed
- Main content is the **only scroll container**
- No nested scroll areas (except tables)
- No horizontal scrolling

---

### 2.2 Sidebar Navigation

**Modules**
- Dashboard
- Sales
  - Customers
  - Invoices
  - Payments
- Purchases
  - Vendors
  - Bills
  - Vendor Payments
- Banking
- Accounting
  - Chart of Accounts
  - Journals
- Reports
- Settings

**Rules**
- Icon + text (always visible)
- Clear active state
- Collapsible groups
- Permission-aware (hide inaccessible items)
- No decorative badges

---

## 3. Page Structure Pattern (STRICT)

Every page **must** follow this structure.

### 3.1 Page Header

- Page title (H1, left)
- **Single primary action** (right)

Example:



**Rules**
- No secondary actions in header
- Use explicit action names (`New Invoice`, not `Create`)

---

### 3.2 Filters Row

**Allowed Filters**
- Search
- Date range
- Status
- Clear filters

**Rules**
- Filters never trigger destructive actions
- Clear filters must be one click
- Structure remains consistent across pages

---

### 3.3 Main Content Area

One of:
- Data table (list)
- Form (create/edit)
- Read-only document view

Never mix multiple primary content types on the same page.

---

### 3.4 Secondary Actions

- Export
- Bulk actions
- Advanced options

**Rules**
- Must not visually compete with primary action
- Destructive bulk actions require confirmation

---

## 4. Component Standards (shadcn/ui)

### 4.1 Buttons

**Primary**
- Create
- Save
- Post

Rules:
- Only one primary button per screen
- Disabled until valid
- Verb-based labels only

**Secondary**
- Cancel
- Back
- Close

**Destructive**
- Void
- Delete

Rules:
- Confirmation dialog required
- Consequences must be explained
- Never default-focused

---

### 4.2 Forms

**Technical Rules**
- `react-hook-form` + `zod` (mandatory)
- Client + server validation
- Controlled inputs only

**UX Rules**
- Required fields marked with `*`
- Inline validation messages
- Errors must explain what is wrong

**Layout**
- Desktop: two-column grid
- Mobile: single column
- Logical sections with subtle separators

---

### 4.3 Tables (Accounting-Critical)

**Library**
- TanStack Table

**Mandatory Features**
- Sorting
- Pagination
- Sticky headers
- Column visibility toggle
- Right-aligned numeric columns
- Totals row where applicable

**Status Indicators**
- Draft → Neutral / Gray
- Posted → Green
- Void → Red

Rules:
- Status must include text + color
- Monetary values are never truncated

---

### 4.4 Drawers & Modals

**Drawer (Side Panel)**
- Create / Edit entities
- Record payments
- Quick edits

**Modal (Dialog)**
- Confirmations
- Warnings
- Posting previews

Rules:
- Avoid full page navigation for CRUD
- Modals must be dismissible unless destructive

---

## 5. Accounting-Specific UX Rules (CRITICAL)

### 5.1 Document Lifecycle

**Statuses**
- Draft → Editable
- Posted → Locked
- Void → Locked + Warning banner

Rules:
- Posted & Void documents are read-only
- No edits after posting
- Corrections require reversal or void patterns

---

### 5.2 Posting Confirmation (MANDATORY)

Posting must **never** be instant.

Required:
- Explicit confirmation
- Ledger impact preview
- Clear action wording

Example:


This action will post the invoice and update the ledger.

Ledger Impact:
• Debit Accounts Receivable AED 1,050.00
• Credit Sales Revenue AED 1,000.00
• Credit VAT Payable AED 50.00

[Cancel] [Post Invoice]


---

### 5.3 Money & Numbers

Rules:
- Always display currency
- Thousands separators required
- Fixed decimal precision
- Negative values visually distinct
- Totals visually emphasized

---

## 6. Attachments & Documents

Rules:
- List view only
- Display file type and size
- Drag & drop upload supported
- Download permission-controlled
- No inline editing of financial attachments

---

## 7. Design Tokens

### 7.1 Colors

- Base: Neutral / Slate scale
- Accent: Muted blue
- Success: Green
- Warning: Amber
- Error: Red

Rules:
- No gradients
- No neon or saturated colors
- Status colors used sparingly

---

### 7.2 Typography

- Font: Inter (or system fallback)
- Clear hierarchy (H1 → H3)
- Numeric alignment consistent
- No decorative fonts

---

### 7.3 Spacing

- Base unit: 4px
- Allowed spacing: 8, 12, 16, 24
- Avoid arbitrary margins

---

## 8. Error Handling UX

Rules:
- Field-level errors inline
- Global errors via toast
- Financial errors must explain **why**

Example:
> Cannot post invoice: VAT Payable account is not configured.

---

## 9. Empty States

Every list page must include:
- Clear empty message
- Short guidance text
- Call-to-action button

Example:
> No invoices yet. Create your first invoice to start billing customers.

---

## 10. Accessibility (Baseline)

- Keyboard navigation supported
- Visible focus states
- Proper labels and aria attributes
- Sufficient contrast for text and numbers

---

## 11. Design → Development Contract

Every user story must map to:
- Page(s)
- UI components
- User actions
- API calls
- Ledger impact
- Permissions
- Audit trail

Design must **never violate**:
- Ledger immutability
- Posting confirmations
- Permission boundaries
- Audit requirements

---

## 12. What This Design System Enables

- Deterministic UI generation
- Faster development cycles
- Consistent user experience
- Safer accounting workflows
- Codex-driven enforcement

---

This design system is **authoritative** for LedgerLite v1.0.  
Any new screen or feature must comply with these rules.

