# 10 - Accounting Improvements Roadmap (UAE SME Focus)

## Purpose

This document proposes product improvements to make LedgerLite easier for SME users while keeping accounting controls strong.  
It is based on the current codebase structure and current UAE SME accounting product patterns.

## Current baseline observed in this repository

- Inventory exists at item + movement level (`Item`, `InventoryMovement` in `apps/api/prisma/schema.prisma`), with auto-movements from bills/invoices/credit notes.
- Inventory costing is currently resolved from item purchase price, then fallback to historical positive movements (`apps/api/src/common/inventory-cost.ts`).
- `InventorySourceType` includes `ADJUSTMENT`, but there is no dedicated inventory-adjustment workflow exposed in current API/UI.
- Reconciliation is currently manual match-driven (`apps/api/src/modules/reconciliation-sessions/*`, `apps/web/app/(protected)/reconciliation/*`).
- Invite email is SMTP-based and working, but basic (single template, no resend/reminder/status lifecycle) (`apps/api/src/common/mailer.service.ts`, `apps/api/src/modules/org-users/org-users.service.ts`).
- VAT summary reporting exists, but not a complete guided VAT return workspace (`apps/api/src/modules/reports/reports.service.ts`).

## A. Inventory & stock operations (highest impact)

| Improvement | Why it matters for SMEs | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Inventory Adjustment workflow | Users need controlled corrections for damages, shrinkage, opening corrections, write-offs | Add `inventory-adjustments` module (reason code, date, notes, approval/post), generate `InventoryMovement` with `ADJUSTMENT`, and post balancing GL entry | P0 |
| Stock on hand dashboard | Users need one page to see availability quickly | New `/inventory` page with on-hand, available, low-stock, stock value by item; add inventory summary API | P0 |
| Reorder automation | `reorderPoint` exists but no user workflow | Add low-stock alerts, reorder suggestions, and conversion to draft purchase documents | P0 |
| Warehouses/locations | UAE SMEs with multiple branches/warehouses need location-level stock | Add `Warehouse`, `StockLocation`, `InventoryTransfer`; require location on movements; show per-location stock | P1 |
| Stock count / cycle count | Periodic counting is critical for trustworthy COGS and valuation | Add count sessions, freeze snapshot, variance posting, and audit trail | P1 |
| Batch/lot/serial + expiry | Needed for food/pharma/trading traceability | Add optional lot/serial tracking and expiry dates at movement level | P1 |
| Landed cost allocation | Import-heavy SMEs need freight/customs distributed into stock cost | Add landed-cost document allocating to bill lines/items with valuation update | P1 |
| Inventory valuation reports | Finance team needs valuation and movement transparency | Add stock valuation, stock aging, movement ledger, and COGS by item reports | P1 |

## B. Sales, receivables, and customer collections

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Quotes/estimates to invoice | Sales teams need pre-invoice commercial docs | Add quote entity with convert-to-invoice flow and versioning | P1 |
| Recurring invoices | Common SME pattern for rent/services/retainers | Add schedule templates with auto-draft generation | P1 |
| Dunning/reminder automation | Reduces DSO and manual follow-up work | Add reminder rules by aging buckets and outbound email templates | P1 |
| Customer statement packs | Customers ask for statement + overdue details | Add statement report per customer with invoice-level aging | P1 |
| Customer portal-lite | Reduce back-and-forth on invoice status | Shared secure invoice links + payment status + download | P2 |

## C. Purchases, payables, and spend control

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Purchase Orders + 3-way match | Controls overbuying and duplicate bills | Add PO entity and optional PO→GRN→Bill matching | P1 |
| Bill approvals by threshold | Managers need control without blocking all users | Add approval matrix (amount/category based) before post | P1 |
| Vendor prepayment clearing UX | Model supports prepayments; UX can be simpler | Guided allocation wizard for prepayments to bills | P1 |
| Expense OCR and extraction | Cuts manual entry time significantly | OCR pipeline for receipt capture, line extraction, review queue | P2 |

## D. Banking, reconciliation, and cash

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Rules-based auto reconciliation | Manual matching does not scale | Add match rules (description/ref/amount tolerances), confidence scoring, bulk accept | P0 |
| Split/merge reconciliation UX | Real bank lines map to multiple docs often | Add split match editor and remaining-balance tracker | P1 |
| Bank feed integrations | Manual import is a friction point | Build connector framework; start with CSV parser presets + prioritized UAE bank feeds | P1 |
| Cash forecast with due schedules | Better short-term liquidity planning | Dashboard forecast from AR/AP due dates + recurring commitments | P2 |

## E. General ledger, close process, and controls

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Period close checklist | Helps non-accountants close month safely | Checklist states: unposted docs, unreconciled bank lines, VAT checks, lock period | P0 |
| Auto-reversing journals | Standard accrual accounting need | Add reversible journals with auto-reverse date | P1 |
| Accrual/deferral schedules | Common prepaid/deferred accounting requirement | Add schedule engine posting monthly recognized entries | P1 |
| Fixed asset register + depreciation | Fixed-asset items exist, but ongoing depreciation workflow is missing | Add asset register, capitalization docs, monthly depreciation posting, and disposal flow | P1 |
| Budget vs actual | Key management reporting for SMEs | Add budget model by account/month and variance reports | P2 |
| Dimension tags (project/cost center) | Better profitability analysis | Add optional dimensions on lines + reports | P2 |

## F. UAE tax/compliance improvements

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| VAT return workspace (VAT201 mapping) | Current VAT summary is helpful but not filing-oriented | Add box-level VAT mapping, mismatch checks, and return period lock workflow | P0 |
| Tax invoice compliance checker | Prevent non-compliant invoice output | Add invoice template validator against Article 59 required fields before post/print | P0 |
| eInvoicing readiness layer | UAE rollout is phased; preparation now reduces rework | Add structured invoice payload model, ASP connector abstraction, status tracking | P1 |
| Corporate tax reporting pack | SME accountants need repeatable CT pack | Add profit adjustments schedule, disallowable expenses tags, and audit export bundle | P1 |

## G. Onboarding, SMTP invite flow, and usability

| Improvement | Why it matters | Suggested implementation direction | Priority |
| --- | --- | --- | --- |
| Role-based onboarding checklist | Speeds time-to-first-value | Guided setup: org, bank, tax, opening balances, first invoice/bill | P0 |
| Invite lifecycle management | Current invite exists but is minimal | Add resend, revoke, expiry reminders, acceptance status, last sent timestamp | P0 |
| SMTP quality and trust improvements | Improves deliverability and confidence | Add branded templates, sender verification checks, bounce/error surfaces in UI | P1 |
| Data import wizard | SMEs migrate from Excel/other apps | CSV import flows for customers/vendors/items/opening balances with preview | P1 |
| In-app accounting guidance | Helps non-accountant users avoid mistakes | Context tooltips, posting preview, "why this failed" human hints | P1 |

## H. Coding standards and delivery guardrails

- Keep all new workflows behind feature flags for controlled rollout.
- Prefer small domain services over single large service classes in new modules.
- Enforce contract tests on posting/void/reversal rules before enabling features in production.
- Add regression test suites specifically for:
  - inventory valuation and adjustments
  - VAT computation and return mapping
  - reconciliation auto-match correctness
  - invite lifecycle and SMTP failure handling
- Maintain org-scoped query enforcement and idempotency for all new mutating endpoints.

## Suggested phased rollout (practical sequence)

### Phase 1 (0-6 weeks): simplify daily accounting work

1. Inventory adjustment workflow  
2. Stock dashboard + reorder alerts  
3. Reconciliation rules (basic)  
4. Invite resend/revoke/status

### Phase 2 (6-12 weeks): close & compliance confidence

1. Period close checklist  
2. VAT return workspace (box-level)  
3. Tax invoice compliance checker  
4. Purchase approvals and PO-lite

### Phase 3 (12-20 weeks): scale operations

1. Warehouses/locations and transfers  
2. Stock count sessions and valuation reports  
3. OCR-assisted bill/expense intake  
4. eInvoicing readiness connector layer

## External benchmarks and references (UAE SME relevant)

- Wafeq (UAE-focused): invoicing, purchase orders, inventory tracking, VAT/Corporate Tax positioning  
  https://www.wafeq.com/en-ae
- Zoho Books UAE VAT filing with EmaraTax integration details  
  https://www.zoho.com/ae/books/help/vat-uae/vat-return-filing.html
- QuickBooks UAE VAT tracking and invoice/expense VAT automation positioning  
  https://quickbooks.intuit.com/ae/vat-tracking/
- Xero bank reconciliation and rules/suggested matches pattern  
  https://www.xero.com/us/accounting-software/reconcile-bank-transactions/
- Xero stock control UX ideas (tracked quantities, stock value, adjustments)  
  https://www.xero.com/explore/stock-control/
- Odoo UAE localization and inventory valuation references  
  https://www.odoo.com/documentation/master/applications/finance/fiscal_localizations/united_arab_emirates.html  
  https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/valuation_by_lots.html
- UAE VAT invoice legal reference (Article 59)  
  https://uaelegislation.gov.ae/en/legislations/1226
- UAE eInvoicing portal + implementation decision references  
  https://mof.gov.ae/einvoicing/  
  https://mof.gov.ae/wp-content/uploads/2025/09/Ministerial-Decision-No.-244-of-2025-on-the-Implementation-of-the-Electronic-Invoicing-System.pdf

## Assumptions and notes

- This roadmap is feature-planning only (no code changes proposed in this document).
- Regulatory interpretation items should be validated by your tax advisor before production enforcement.
- Timelines and eInvoicing obligations should be re-checked against MoF updates before implementation.
