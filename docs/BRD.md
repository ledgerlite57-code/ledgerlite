# LedgerLite – Business Requirements Document (BRD)

This document defines the **business scope, user stories, and non-functional requirements** for LedgerLite.
It is a **frozen v1.0 specification** and acts as the contractual input for UI, database, and implementation work.

> **Version:** v1.0  
> **Status:** FROZEN (changes require v1.1+)  
> **Audience:** Product, Engineering, Codex

---

## 1. Product Overview

**Product Name:** LedgerLite  
**Category:** Cloud-based Accounting Software (Zoho Books–class)  
**Target Market:** Small & Medium Businesses (SMBs), startups, freelancers  
**Initial Geography:** UAE (VAT-focused), globally extensible

### Product Vision
LedgerLite provides a **simple, correct, and modern accounting system** that removes unnecessary complexity while preserving enterprise-grade accounting accuracy.

### Key Principles
- Ledger-first (double-entry accounting as source of truth)
- Minimal but complete feature set
- Clean, fast, accountant-safe UI
- Auditability and correctness over shortcuts
- Scalable from small business to mid-market

---

## 2. Business Goals

- Enable SMBs to manage sales, purchases, taxes, and cash flow
- Reduce dependency on accountants for day-to-day bookkeeping
- Ensure compliance-ready records (VAT, audit trail)
- Offer a modern alternative to Zoho Books with simpler UX
- Support both SaaS and future on-prem deployment

---

## 3. Stakeholders & User Personas

### 3.1 Business Owner
- Oversees financial health
- Reviews reports and KPIs
- Approves sensitive actions
- Manages users and configuration

### 3.2 Accountant / Finance Manager
- Posts journals and adjustments
- Manages VAT and period closing
- Ensures accounting correctness
- Generates statutory reports

### 3.3 Sales User
- Creates quotes and invoices
- Tracks customer balances
- Follows up on receivables

### 3.4 Purchases User
- Records vendor bills
- Tracks payables and due dates
- Coordinates vendor payments

### 3.5 Viewer / Auditor
- Read-only access
- Reviews transactions, journals, and reports
- Cannot modify data

---

## 4. Functional Scope (Modules)

1. Organization & Settings  
2. Users, Roles & Permissions  
3. Chart of Accounts  
4. Customers & Vendors  
5. Items (Products & Services)  
6. Sales (Quotes, Invoices, Payments)  
7. Purchases (Bills, Payments)  
8. Taxes (VAT)  
9. General Ledger & Journals  
10. Banking & Reconciliation  
11. Reports & Analytics  
12. Attachments & Documents  
13. Audit & Compliance  

---

## 5. Detailed User Stories (MVP)

### 5.1 Organization & Setup

**US-ORG-01**  
As an Owner, I want to create an organization so that all accounting data is scoped correctly.

**Acceptance Criteria**
- Organization has base currency
- Fiscal year and VAT configuration
- Default chart of accounts auto-created
- Organization settings editable only by Owner

---

### 5.2 Users, Roles & Permissions

**US-AUTH-01**  
As an Owner, I want to invite users and assign roles so that duties are separated.

**Acceptance Criteria**
- Roles: Owner, Accountant, Sales, Purchases, Viewer
- Permissions enforced at API and UI level
- User actions audited

---

### 5.3 Chart of Accounts

**US-COA-01**  
As an Accountant, I want to manage the chart of accounts so transactions post correctly.

**Acceptance Criteria**
- System accounts protected
- Custom accounts allowed
- Accounts cannot be deleted if used
- Account type controls posting behavior

---

### 5.4 Customers & Vendors

**US-CUST-01**  
As a Sales user, I want to manage customers so I can invoice them.

**US-VEND-01**  
As a Purchases user, I want to manage vendors so I can track bills.

**Acceptance Criteria**
- Payment terms
- VAT/TRN support
- Default accounts and tax codes

---

### 5.5 Items (Products & Services)

**US-ITEM-01**  
As a user, I want to create products and services so prices and accounts are auto-filled.

**Acceptance Criteria**
- Income and expense account mapping
- Default tax code
- Active/inactive control

---

### 5.6 Sales – Quotes & Invoices

**US-SALES-01**  
As a Sales user, I want to create invoices so I can bill customers.

**Acceptance Criteria**
- Draft → Posted lifecycle
- VAT calculated automatically
- Ledger entries created only on post
- Posted invoices are immutable

**Ledger Impact**
- Dr Accounts Receivable  
- Cr Sales Revenue  
- Cr VAT Payable  

---

### 5.7 Sales – Payments

**US-SALES-02**  
As a Finance user, I want to record customer payments so receivables are reduced.

**Acceptance Criteria**
- Partial payments allowed
- Cannot exceed outstanding balance
- Supports allocation across invoices

**Ledger Impact**
- Dr Bank / Cash  
- Cr Accounts Receivable  

---

### 5.8 Purchases – Bills

**US-PUR-01**  
As a Purchases user, I want to record vendor bills so expenses and payables are tracked.

**Acceptance Criteria**
- Draft → Posted lifecycle
- VAT calculated
- Linked to vendors

**Ledger Impact**
- Dr Expense  
- Dr VAT Receivable  
- Cr Accounts Payable  

---

### 5.9 Purchases – Payments

**US-PUR-02**  
As a Finance user, I want to pay vendor bills so liabilities are cleared.

**Acceptance Criteria**
- Partial payments allowed
- Payment allocation enforced

**Ledger Impact**
- Dr Accounts Payable  
- Cr Bank / Cash  

---

### 5.10 General Ledger & Journals

**US-GL-01**  
As an Accountant, I want to post manual journals so I can make adjustments.

**Acceptance Criteria**
- Debit equals credit enforced
- Journals immutable after posting
- Reversals via reversing journals only

---

### 5.11 Banking & Reconciliation

**US-BANK-01**  
As a Finance user, I want to manage bank accounts so cash balances are tracked.

**US-BANK-02**  
As a Finance user, I want to reconcile bank transactions so books match reality.

**Acceptance Criteria**
- Import bank transactions
- Match or manually reconcile
- Reconciliation audit preserved

---

### 5.12 Attachments & Documents

**US-DOC-01**  
As a user, I want to attach files to transactions so supporting documents are preserved.

**Acceptance Criteria**
- Files stored outside DB
- Permission-checked access
- Download audit trail

---

### 5.13 Reports & Analytics

**US-REP-01** Profit & Loss  
**US-REP-02** Balance Sheet  
**US-REP-03** Trial Balance  
**US-REP-04** AR/AP Aging  
**US-REP-05** VAT Summary  

**Acceptance Criteria**
- Drill-down to source transactions
- Export to PDF and CSV
- Period locking respected

---

### 5.14 Audit & Compliance

**US-AUD-01**  
As an Auditor, I want to view a full audit trail so all changes are traceable.

**Acceptance Criteria**
- User, timestamp, action logged
- Before/after values captured
- Immutable audit records

---

## 6. Non-Functional Requirements

### Performance
- <300ms API response for standard operations
- Heavy reports allowed async generation

### Security
- RBAC enforcement
- Encrypted secrets
- Secure authentication flows

### Availability
- 99.5%+ uptime target

### Data Integrity
- DB constraints
- ACID transactions
- Idempotent posting APIs

### Scalability
- Single database initially
- Horizontal API scaling
- Read replicas (future)

---

## 7. Out of Scope (v1)

- PayrollA
- Inventory valuation
- Multi-entity consolidation
- Advanced forecasting
- Multi-currency accounting

---

## Final Note

This BRD, together with the **Technical Architecture**, **Design System**, **DB Schema**, and **End-to-End Mapping**, forms the **authoritative specification** for LedgerLite v1.0.
