# 35 - Bills (Zoho-Style) User Stories

## Purpose
Capture the Bills flows and screens that should mirror Zoho Books behavior.

## User Stories

### BILLS-ZH-01 - Bills list with statuses and filters
**As a** payables user,  
**I want** a Bills list with clear statuses and quick filters,  
**So that** I can track what is due and what is paid.

**Acceptance Criteria**
- Bills support statuses: Draft, Pending Approval, Open, Overdue, Unpaid, Partially Paid, Paid, Void.
- Bills list supports filter by status via a dropdown.
- Users can define custom views with their own criteria.

### BILLS-ZH-02 - Create bill header (Zoho field set)
**As a** payables user,  
**I want** a bill creation screen that matches Zoho’s core fields,  
**So that** entry is familiar and complete.

**Acceptance Criteria**
- Header fields include: Vendor Name, Bill#, Order Number, Bill Date, Due Date, Payment Terms.
- Selecting Payment Terms auto-adjusts the Due Date.
- Create action is available from Purchases > Bills with a prominent “+ New” button.

### BILLS-ZH-03 - Line items with bulk add
**As a** payables user,  
**I want** to add bill line items quickly,  
**So that** large bills are easy to enter.

**Acceptance Criteria**
- Users can add item lines to a bill.
- Users can add items in bulk from a dropdown action.

### BILLS-ZH-04 - Convert Purchase Order to Bill
**As a** payables user,  
**I want** to convert a Purchase Order into a Bill,  
**So that** I can avoid duplicate entry.

**Acceptance Criteria**
- A Purchase Order detail screen offers a “Convert to Bill” action.
- The New Bill page opens with PO data prefilled.

### BILLS-ZH-05 - Record bill payments
**As a** payables user,  
**I want** to record bill payments from a dedicated Payments Made flow,  
**So that** payment tracking is centralized.

**Acceptance Criteria**
- Payments Made supports statuses: Draft, Pending Approval, Approval Rejected, Approved, Paid, Void.
- Bill payment form includes Vendor Name, Branch (if enabled), and Location (if enabled).

### BILLS-ZH-06 - Attach files to bills
**As a** payables user,  
**I want** to attach receipts and documents to a bill,  
**So that** the bill has all supporting evidence.

**Acceptance Criteria**
- Attachments can be added from Desktop, Documents, or Cloud sources.
- Attachments are visible on the bill’s details page.

### BILLS-ZH-07 - Apply vendor credits to bills
**As a** payables user,  
**I want** to apply vendor credits to bills,  
**So that** bill balances are reduced correctly.

**Acceptance Criteria**
- Vendor credits can be applied to bills for the same vendor.
- Credits can be split across multiple bills.
- Bills show “Use Credits” actions when credits are available.

### BILLS-ZH-08 - Vendor portal document upload to bill
**As a** vendor,  
**I want** to upload transaction documents in a portal,  
**So that** the accounting team can verify and convert them to bills.

**Acceptance Criteria**
- Vendor portal allows upload of transaction documents.
- Accepted documents can be converted into bills by the accounting user.

### BILLS-ZH-09 - Documents module auto-scan
**As a** payables user,  
**I want** uploaded documents to be auto-scanned into transactions,  
**So that** bill entry is faster.

**Acceptance Criteria**
- Documents module supports upload and autoscan.
- Autoscan can create new transactions (including bills).
