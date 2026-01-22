# LedgerLite Deep Audit (Ledger Logic)

## 1) Posting rules per document

### Invoice posting
- Status transitions: `InvoicesService.createInvoice` sets `status: "DRAFT"` in `apps/api/src/modules/invoices/invoices.service.ts`; `InvoicesService.updateInvoice` blocks non-DRAFT edits in `apps/api/src/modules/invoices/invoices.service.ts`; `InvoicesService.postInvoice` sets `status: "POSTED"` and `postedAt: new Date()` in `apps/api/src/modules/invoices/invoices.service.ts`
- GL lines created: `buildInvoicePostingLines` in `apps/api/src/invoices.utils.ts`
  - Line 1: debit AR for full total (`accountId: arAccountId`, `debit: total`)
  - Revenue lines: credit each income account from items (`accountId: item.incomeAccountId`, `credit: lineSubTotal`)
  - VAT lines: credit VAT payable (`accountId: vatAccountId`, `credit: lineTax`, `taxCodeId` attached)
- Account selection: AR account by subtype in `InvoicesService.postInvoice` in `apps/api/src/modules/invoices/invoices.service.ts`; VAT account by subtype `VAT_PAYABLE` in `InvoicesService.postInvoice`; revenue accounts from `Item.incomeAccountId` in `buildInvoicePostingLines` in `apps/api/src/invoices.utils.ts`; active account validation in `InvoicesService.postInvoice`
- VAT computation: line-level in `calculateInvoiceLines` in `apps/api/src/invoices.utils.ts` using tax code rate when `type === "STANDARD"`; VAT disabled check in `calculateInvoiceLines` and `InvoicesService.postInvoice`; rounding via `round2` (HALF_UP) in `apps/api/src/common/money.ts`
- Totals calculation/validation: `calculateInvoiceLines` computes `lineSubTotal`, `lineTax`, `lineTotal`, `subTotal`, `taxTotal`, `total` in `apps/api/src/invoices.utils.ts`; `InvoicesService.postInvoice` uses stored totals and checks `eq(totalDebit, totalCredit)` in `apps/api/src/modules/invoices/invoices.service.ts`
- Transaction boundaries + idempotency: `InvoicesService.postInvoice` runs in `prisma.$transaction` and writes GL + audit in `apps/api/src/modules/invoices/invoices.service.ts`; idempotency check uses `hashRequestBody` in `apps/api/src/common/idempotency.ts` and stores in `IdempotencyKey` in `InvoicesService.postInvoice` and `InvoicesService.createInvoice`
- LockDate enforcement: Not found in `InvoicesService.postInvoice` in `apps/api/src/modules/invoices/invoices.service.ts` (no checks against `OrgSettings.lockDate`)
- Multi-currency handling: currency set from input or `org.baseCurrency` in `InvoicesService.createInvoice`; `exchangeRate` stored but not used in computations; GL header currency set to invoice currency in `InvoicesService.postInvoice`

### Bill posting
- Status transitions: `BillsService.createBill` sets `status: "DRAFT"` in `apps/api/src/modules/bills/bills.service.ts`; `BillsService.updateBill` blocks non-DRAFT edits; `BillsService.postBill` sets `status: "POSTED"` and `postedAt: new Date()` in `apps/api/src/modules/bills/bills.service.ts`
- GL lines created: `buildBillPostingLines` in `apps/api/src/bills.utils.ts`
  - Expense lines: debit expense accounts from bill lines (`accountId: expenseAccountId`, `debit: lineSubTotal`)
  - VAT lines: debit VAT receivable (`accountId: vatAccountId`, `debit: lineTax`, `taxCodeId` attached)
  - AP line: credit AP for total (`accountId: apAccountId`, `credit: total`)
- Account selection: AP account by subtype in `BillsService.postBill` in `apps/api/src/modules/bills/bills.service.ts`; VAT account by subtype `VAT_RECEIVABLE` in `BillsService.postBill`; expense accounts from `BillLine.expenseAccountId` in `buildBillPostingLines` in `apps/api/src/bills.utils.ts`; active account validation in `BillsService.postBill`
- VAT computation: line-level in `calculateBillLines` in `apps/api/src/bills.utils.ts` using tax code rate when `type === "STANDARD"`; VAT disabled check in `calculateBillLines` and `BillsService.postBill`; rounding via `round2` in `apps/api/src/common/money.ts`
- Totals calculation/validation: `calculateBillLines` computes totals in `apps/api/src/bills.utils.ts`; `BillsService.postBill` checks `eq(totalDebit, totalCredit)` in `apps/api/src/modules/bills/bills.service.ts`
- Transaction boundaries + idempotency: `BillsService.postBill` runs in `prisma.$transaction` in `apps/api/src/modules/bills/bills.service.ts`; idempotency uses `hashRequestBody` in `apps/api/src/common/idempotency.ts` and `IdempotencyKey` writes in `BillsService.postBill` and `BillsService.createBill`
- LockDate enforcement: Not found in `BillsService.postBill` in `apps/api/src/modules/bills/bills.service.ts`
- Multi-currency handling: currency set from input or `org.baseCurrency` in `BillsService.createBill`; `exchangeRate` stored but not used; GL header currency set to bill currency in `BillsService.postBill`

### PaymentReceived posting
- Status transitions: `PaymentsReceivedService.createPayment` sets `status: "DRAFT"` in `apps/api/src/modules/payments-received/payments-received.service.ts`; `PaymentsReceivedService.updatePayment` blocks non-DRAFT edits; `PaymentsReceivedService.postPayment` sets `status: "POSTED"` and `postedAt: new Date()`
- GL lines created: `buildPaymentPostingLines` in `apps/api/src/payments-received.utils.ts`
  - Debit bank GL account (`accountId: bankAccount.glAccountId`, `debit: amountTotal`)
  - Credit AR (`accountId: arAccountId`, `credit: amountTotal`)
- Account selection: bank account from `bankAccountId` with `glAccount` in `PaymentsReceivedService.postPayment` in `apps/api/src/modules/payments-received/payments-received.service.ts`; AR account by subtype in `PaymentsReceivedService.postPayment`
- VAT computation: Not applicable (no VAT lines) in `buildPaymentPostingLines` in `apps/api/src/payments-received.utils.ts`
- Totals calculation/validation: `calculatePaymentTotal` in `apps/api/src/payments-received.utils.ts` used in `PaymentsReceivedService.createPayment` and `PaymentsReceivedService.updatePayment`; `PaymentsReceivedService.postPayment` validates `amountTotal` equals allocation sum using `eq(round2(...))`
- Transaction boundaries + idempotency: `PaymentsReceivedService.postPayment` runs in `prisma.$transaction` with row locks (`tx.$queryRaw ... FOR UPDATE`) in `apps/api/src/modules/payments-received/payments-received.service.ts`; idempotency via `hashRequestBody` in `apps/api/src/common/idempotency.ts` and `IdempotencyKey` writes in `PaymentsReceivedService.postPayment` and `PaymentsReceivedService.createPayment`
- LockDate enforcement: Not found in `PaymentsReceivedService.postPayment` in `apps/api/src/modules/payments-received/payments-received.service.ts`
- Multi-currency handling: requires payment currency match bank account currency in `PaymentsReceivedService.createPayment` and `PaymentsReceivedService.postPayment`; `exchangeRate` stored but not used; GL header currency set to payment currency in `PaymentsReceivedService.postPayment`

### VendorPayment posting
- Status transitions: `VendorPaymentsService.createPayment` sets `status: "DRAFT"` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`; `VendorPaymentsService.updatePayment` blocks non-DRAFT edits; `VendorPaymentsService.postPayment` sets `status: "POSTED"` and `postedAt: new Date()`
- GL lines created: `buildVendorPaymentPostingLines` in `apps/api/src/vendor-payments.utils.ts`
  - Debit AP (`accountId: apAccountId`, `debit: amountTotal`)
  - Credit bank GL account (`accountId: bankAccount.glAccountId`, `credit: amountTotal`)
- Account selection: AP account by subtype in `VendorPaymentsService.postPayment` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`; bank account from `bankAccountId` with `glAccount`
- VAT computation: Not applicable (no VAT lines) in `buildVendorPaymentPostingLines` in `apps/api/src/vendor-payments.utils.ts`
- Totals calculation/validation: `calculateVendorPaymentTotal` in `apps/api/src/vendor-payments.utils.ts` used in `VendorPaymentsService.createPayment` and `VendorPaymentsService.updatePayment`; `VendorPaymentsService.postPayment` validates `amountTotal` equals allocation sum using `eq(round2(...))`
- Transaction boundaries + idempotency: `VendorPaymentsService.postPayment` runs in `prisma.$transaction` with row locks (`tx.$queryRaw ... FOR UPDATE`) in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`; idempotency via `hashRequestBody` in `apps/api/src/common/idempotency.ts` and `IdempotencyKey` writes in `VendorPaymentsService.postPayment` and `VendorPaymentsService.createPayment`
- LockDate enforcement: Not found in `VendorPaymentsService.postPayment` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
- Multi-currency handling: requires payment currency match bank account currency in `VendorPaymentsService.createPayment` and `VendorPaymentsService.postPayment`; `exchangeRate` stored but not used; GL header currency set to payment currency in `VendorPaymentsService.postPayment`

### Journal posting
- Status transitions: `JournalsService.createJournal` sets `status: "DRAFT"` in `apps/api/src/modules/journals/journals.service.ts`; `JournalsService.updateJournal` blocks non-DRAFT edits; `JournalsService.postJournal` sets `status: "POSTED"` and `postedAt: new Date()`
- GL lines created: `JournalsService.postJournal` maps each journal line into GL lines in `apps/api/src/modules/journals/journals.service.ts`; no account subtype mapping beyond provided `accountId`
- Account selection: `JournalsService.validateLineReferences` requires active accounts and optional customer/vendor in `apps/api/src/modules/journals/journals.service.ts`
- VAT computation: Not applicable (journals are manual) in `JournalsService.postJournal`
- Totals calculation/validation: `ensureValidJournalLines` and `calculateJournalTotals` in `apps/api/src/journals.utils.ts`; `JournalsService.postJournal` enforces balanced totals via `eq(totalDebit, totalCredit)`
- Transaction boundaries + idempotency: `JournalsService.postJournal` runs in `prisma.$transaction` in `apps/api/src/modules/journals/journals.service.ts`; idempotency via `hashRequestBody` in `apps/api/src/common/idempotency.ts` and `IdempotencyKey` writes in `JournalsService.postJournal` and `JournalsService.createJournal`
- LockDate enforcement: Not found in `JournalsService.postJournal` in `apps/api/src/modules/journals/journals.service.ts`
- Multi-currency handling: requires `org.baseCurrency` in `JournalsService.postJournal` and writes GL header `currency: org.baseCurrency`, `exchangeRate: null`

## 2) Allocation integrity rules
- Allocation sum equals payment total: `PaymentsReceivedService.postPayment` compares `payment.amountTotal` vs `allocatedTotal` from `calculatePaymentTotal` in `apps/api/src/modules/payments-received/payments-received.service.ts` and `apps/api/src/payments-received.utils.ts`; `VendorPaymentsService.postPayment` does the same using `calculateVendorPaymentTotal` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts` and `apps/api/src/vendor-payments.utils.ts`
- Allocation <= outstanding: `PaymentsReceivedService.validateAllocationsAgainstInvoices` in `apps/api/src/modules/payments-received/payments-received.service.ts`; `VendorPaymentsService.validateAllocationsAgainstBills` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
- Updates to amountPaid/paymentStatus: `PaymentsReceivedService.postPayment` updates `Invoice.amountPaid` and `Invoice.paymentStatus` to UNPAID/PARTIAL/PAID based on `newPaid` in `apps/api/src/modules/payments-received/payments-received.service.ts`; `VendorPaymentsService.postPayment` updates `Bill.amountPaid` and `Bill.paymentStatus` in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
- Partial payments behavior: `PaymentsReceivedService.postPayment` sets `paymentStatus` to PARTIAL when `0 < newPaid < total` in `apps/api/src/modules/payments-received/payments-received.service.ts`; `VendorPaymentsService.postPayment` does the same for bills in `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
- Allocation validation: `PaymentsReceivedService.normalizeAllocations` and `VendorPaymentsService.normalizeAllocations` enforce positive amounts and no duplicate invoice/bill allocations in `apps/api/src/modules/payments-received/payments-received.service.ts` and `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`

## 3) Reports formulas
- Trial Balance: `ReportsService.getTrialBalance` in `apps/api/src/modules/reports/reports.service.ts` uses `GLLine.groupBy` filtered by `GLHeader.postingDate` between range; totals = sum(debit), sum(credit); returns `currency = org.baseCurrency` from `ReportsService.getOrgCurrency`
- Profit & Loss: `ReportsService.getProfitLoss` in `apps/api/src/modules/reports/reports.service.ts` loads accounts where `type IN (INCOME, EXPENSE)` and groups GL lines by account and `postingDate` range; income amount = credit - debit; expense amount = debit - credit; netProfit = incomeTotal - expenseTotal
- Balance Sheet: `ReportsService.getBalanceSheet` in `apps/api/src/modules/reports/reports.service.ts` loads accounts where `type IN (ASSET, LIABILITY, EQUITY)` and groups GL lines with `postingDate <= asOf`; assets = debit - credit; liabilities/equity = credit - debit; no explicit assets = liabilities + equity validation beyond returning `totalLiabilitiesAndEquity`
- Ledger Lines: `ReportsService.getLedgerLines` in `apps/api/src/modules/reports/reports.service.ts` queries `GLLine.findMany` by `accountId` and `GLHeader.postingDate` range; includes `GLHeader` only (no customer/vendor join); returns `sourceType/sourceId`, `memo`, `currency`
- AR Aging: `ReportsService.getArAging` in `apps/api/src/modules/reports/reports.service.ts` selects posted invoices with `invoiceDate <= asOf`, groups `PaymentReceivedAllocation` for posted payments with `paymentDate <= asOf`, outstanding = invoice.total - allocated; bucketed by `getAgingBucket` in `apps/api/src/reports.utils.ts`
- AP Aging: `ReportsService.getApAging` in `apps/api/src/modules/reports/reports.service.ts` selects posted bills with `billDate <= asOf`, groups `VendorPaymentAllocation` for posted vendor payments with `paymentDate <= asOf`, outstanding = bill.total - allocated; bucketed by `getAgingBucket` in `apps/api/src/reports.utils.ts`
- VAT Summary: `ReportsService.getVatSummary` in `apps/api/src/modules/reports/reports.service.ts` uses GL lines for accounts with subtype `VAT_PAYABLE` and `VAT_RECEIVABLE`; output VAT = credit - debit for payable; input VAT = debit - credit for receivable; netVat = output - input

## 4) Voids/Reversals
- Not implemented: no `void`/`reverse` functions in `InvoicesService`, `BillsService`, `PaymentsReceivedService`, `VendorPaymentsService`, or `JournalsService` under `apps/api/src/modules/*` (rg search for `void|reverse|reversal` returned no code matches)
- Schema hooks without implementation: `GLHeader.reversedByHeaderId` and `GLStatus` enum exist in `apps/api/prisma/schema.prisma` but are unused in `apps/api/src`

## 5) Money math usage
- Server rounding: `round2` uses `Prisma.Decimal.ROUND_HALF_UP` in `apps/api/src/common/money.ts`; used in `calculateInvoiceLines` and `buildInvoicePostingLines` in `apps/api/src/invoices.utils.ts`, `calculateBillLines` and `buildBillPostingLines` in `apps/api/src/bills.utils.ts`, `calculatePaymentTotal` and `buildPaymentPostingLines` in `apps/api/src/payments-received.utils.ts`, `calculateVendorPaymentTotal` and `buildVendorPaymentPostingLines` in `apps/api/src/vendor-payments.utils.ts`, `calculateJournalTotals` in `apps/api/src/journals.utils.ts`
- Decimal -> Number conversions: tax rate conversions `Number(tax.rate)` in `InvoicesService.resolveInvoiceRefs` in `apps/api/src/modules/invoices/invoices.service.ts` and `BillsService.resolveBillRefs` in `apps/api/src/modules/bills/bills.service.ts`
- Web float math: `Math.round` previews in `apps/web/app/(protected)/invoices/[id]/page.tsx`, `apps/web/app/(protected)/bills/[id]/page.tsx`, `apps/web/app/(protected)/payments-received/[id]/page.tsx`, `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`, `apps/web/app/(protected)/journals/[id]/page.tsx`; conversions via `Number(...)` in `apps/web/src/lib/format.ts`
- Risk points: UI previews can diverge from server Decimal calculations; reports in UI show formatted amounts derived from API strings in `apps/web/src/lib/format.ts`

## 6) Security & auth checks (short)
- Refresh cookie protections: `AuthController.refresh` in `apps/api/src/auth/auth.controller.ts` sets `refresh_token` with `httpOnly: true`, `sameSite: "lax"`, `secure: NODE_ENV === "production"`, `path: "/auth"`; no CSRF token check
- Default owner credentials: `AuthService.validateUser` and `ALLOW_DEFAULT_OWNER` gating in `apps/api/src/auth/auth.service.ts` allow default owner when `NODE_ENV !== "production"`

## 7) List of MUST-FIX bugs (top 10 correctness gaps)
1) Lock date not enforced for posting or editing; `OrgSettings.lockDate` exists in `apps/api/prisma/schema.prisma` but no checks in `InvoicesService.postInvoice`, `BillsService.postBill`, `PaymentsReceivedService.postPayment`, `VendorPaymentsService.postPayment`, or `JournalsService.postJournal` in `apps/api/src/modules/*`
2) No void/reversal workflow for posted docs or GL; `GLStatus` and `GLHeader.reversedByHeaderId` exist in `apps/api/prisma/schema.prisma` but no `void*`/`reverse*` functions in `apps/api/src/modules/*`
3) Multi-currency not implemented: `exchangeRate` stored in `InvoicesService.createInvoice`, `BillsService.createBill`, `PaymentsReceivedService.createPayment`, `VendorPaymentsService.createPayment` in `apps/api/src/modules/*` but never applied to GL amounts or reports
4) Reports assume base currency while aggregating GL lines across potentially mixed document currencies; `ReportsService.getTrialBalance`/`getProfitLoss`/`getBalanceSheet` return `currency = org.baseCurrency` in `apps/api/src/modules/reports/reports.service.ts` without conversions
5) Bill numbers are not unique at DB level; no `@@unique` for `Bill.billNumber` or `Bill.systemNumber` in `apps/api/prisma/schema.prisma`, unlike invoices
6) Posted data immutability enforced only in service layer; no DB constraint prevents updates to posted `Invoice`, `Bill`, `PaymentReceived`, `VendorPayment`, `JournalEntry`, or `GLLine` rows in `apps/api/prisma/schema.prisma`
7) AR/AP aging not derived from GL; `ReportsService.getArAging` and `ReportsService.getApAging` use invoices/bills + allocations in `apps/api/src/modules/reports/reports.service.ts`, so adjustments via journals will not reflect in aging
8) VAT summary can diverge from document VAT; `ReportsService.getVatSummary` uses VAT GL accounts only in `apps/api/src/modules/reports/reports.service.ts` with no cross-check to invoice/bill tax codes
9) Allocation currency mismatches are not handled; `PaymentsReceivedService.postPayment` and `VendorPaymentsService.postPayment` validate amounts but do not reconcile payment currency vs invoice/bill currency beyond bank account checks in `apps/api/src/modules/*`
10) Posting/reporting correctness tests missing for reports and reversals; no tests for `ReportsService` outputs or reversal flows in `apps/api/test` (Not found)
