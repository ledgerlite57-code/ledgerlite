# 37 - Purchase Orders User Stories

## Purpose
Define detailed user stories and acceptance criteria for a Purchase Order (PO) module that fits LedgerLite’s current patterns (draft → post/close) and supports conversion to Bills.

## Scope
- Purchases > Purchase Orders list + detail.
- PO creation, approval (optional), sending, and conversion to Bill.
- Partial receipts and partial billing.
- Attachments, audit logs, and permissions.

---

## Epic 1: Purchase Order Lifecycle

### PO-01 - List & filter purchase orders
**As a** payables user,  
**I want** a PO list with filters,  
**So that** I can track open and closed purchase orders.

**Acceptance Criteria**
- List includes: PO number, vendor, PO date, expected delivery date, total, status.
- Filters: status, vendor, date range, amount range, search (number/vendor).
- Status chips show: `DRAFT`, `SENT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`, `CANCELLED`.

### PO-02 - Create a draft purchase order
**As a** payables user,  
**I want** to create a draft PO,  
**So that** I can stage orders before sending.

**Acceptance Criteria**
- Required fields: Vendor, PO Date, Currency.
- Optional fields: Expected Delivery Date, Reference, Notes.
- Line items support: Item, Description, Qty, Unit, Unit Price, Tax Code, Line Total.
- Draft can be saved without sending.

### PO-03 - Send purchase order
**As a** payables user,  
**I want** to send a PO to a vendor,  
**So that** the vendor receives the order.

**Acceptance Criteria**
- Send action marks PO as `SENT`.
- Email includes PO PDF and vendor contact details.
- Audit log records sender and timestamp.

### PO-04 - Close or cancel a PO
**As a** payables user,  
**I want** to close or cancel a PO,  
**So that** I stop further receiving/billing.

**Acceptance Criteria**
- Cancelled POs cannot be received or billed.
- Closed POs can no longer be edited.
- Audit log records close/cancel action.

---

## Epic 2: Receipts & Billing

### PO-05 - Receive items (partial or full)
**As a** payables user,  
**I want** to record receipts against a PO,  
**So that** inventory and fulfillment tracking is accurate.

**Acceptance Criteria**
- Receipt supports partial quantities per line.
- PO status updates: `PARTIALLY_RECEIVED` or `RECEIVED`.
- Receipt creates inventory movement for inventory items.
- Receipt date is required and respects lock dates.

### PO-06 - Convert PO to Bill
**As a** payables user,  
**I want** to convert a PO into a Bill,  
**So that** I avoid re-entry.

**Acceptance Criteria**
- “Convert to Bill” is available from PO detail.
- Bill pre-fills vendor, lines, taxes, and quantities.
- If partial received, conversion uses received quantities only (configurable).
- Converted PO shows linked Bill(s).

### PO-07 - Track PO to Bill coverage
**As a** payables user,  
**I want** to see how much of a PO is billed,  
**So that** I know remaining exposure.

**Acceptance Criteria**
- PO detail shows billed amount and remaining amount.
- Partial bills update the remaining balance.

---

## Epic 3: Approvals (Optional, Phase 2)

### PO-08 - PO approval workflow
**As a** manager,  
**I want** POs to require approval above a threshold,  
**So that** high-value orders are controlled.

**Acceptance Criteria**
- Org setting: approval threshold.
- Status flow: `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `SENT`.
- Approval action requires permission.
- Audit log captures approvals and rejections.

---

## Epic 4: Accounting, Taxes, and Currency

### PO-09 - Tax handling on PO lines
**As a** payables user,  
**I want** PO tax totals to follow tax codes,  
**So that** I can estimate landed cost.

**Acceptance Criteria**
- Line tax uses tax code rules.
- Total = subtotal + tax (minus discounts if any).
- Tax totals are visible on PO.

### PO-10 - Multi-currency support (baseline)
**As a** payables user,  
**I want** to issue POs in vendor currency,  
**So that** foreign orders are accurate.

**Acceptance Criteria**
- Currency set at PO header.
- Exchange rate stored at PO level (read-only after send).
- Conversion to bill uses PO currency and rate.

---

## Epic 5: Attachments & Audit

### PO-11 - Attach documents to PO
**As a** payables user,  
**I want** to attach vendor quotes and files,  
**So that** supporting documents are centralized.

**Acceptance Criteria**
- Attachments can be uploaded or linked.
- Attachments appear on PO detail.

### PO-12 - Audit log for PO actions
**As an** admin,  
**I want** PO actions logged,  
**So that** changes are traceable.

**Acceptance Criteria**
- Create, update, send, approve, receive, cancel, close are logged.

---

## Non-Functional Requirements
- Role-based permissions for create, send, approve, receive, and convert.
- Idempotent conversion to Bill.
- Lock date enforcement for receipt and bill creation.
- No breaking changes to existing Bills flow.

---

## Notes
- AP control accounts remain in Bills; POs should not post GL entries until converted or received (depending on policy).
- Receipt logic should align with inventory movement rules already in place.
