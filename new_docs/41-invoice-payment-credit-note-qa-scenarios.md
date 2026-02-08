# 41 - Invoice, Payment, and Credit Note QA Scenarios

## Objective
Validate end-to-end behavior for:
- Invoice creation and posting
- Payment receipt and allocation
- Credit note creation, posting, apply, and refund
- VAT reversal and inventory reversal

## Preconditions
- App running with latest migrations and seed data.
- Test org has:
  - Base currency `AED`
  - VAT code `VAT 5%`
  - One customer (for example: `Globex Hospitality`)
  - One inventory item with UOM conversion (`EA` base, `DOZEN = 12 EA`)
  - One service item (for non-inventory credit-note checks)
  - Bank/Cash account available for refunds

## Scenario 1 - Partial Payment, Then Credit Note Apply
Purpose: verify outstanding invoice can be reduced by credit allocation.

1. Create invoice for customer:
   - Item total (before VAT): `AED 1,000`
   - VAT: `5%`
   - Invoice total expected: `AED 1,050`
2. Post invoice.
3. Receive payment of `AED 600` and post it.
4. Confirm invoice outstanding is `AED 450`.
5. Create a credit note (any valid return/adjustment) for `AED 210` total.
6. Post credit note.
7. Apply `AED 210` from credit note to the invoice.

Expected results:
- Invoice outstanding becomes `AED 240`.
- Credit note `Applied = AED 210`, `Remaining = AED 0`.
- UI shows cumulative `Credited / Applied / Remaining` clearly.

## Scenario 2 - Fully Paid Invoice, Credit Note Requires Refund Path
Purpose: verify allocation is blocked when there is no outstanding invoice.

1. Create invoice total `AED 1,050` and post it.
2. Receive full payment `AED 1,050` and post it.
3. Create credit note total `AED 105` and post it.
4. Open credit note apply section.

Expected results:
- No eligible invoice appears in allocation selector.
- Allocation row is hidden or disabled with a clear message.
- User is guided to `Refund to customer` flow.
- No silent failure and no confusing empty selector behavior.

## Scenario 3 - Inventory Return With Different UOM
Purpose: verify UOM conversion and inventory reversal consistency.

1. Create invoice line for inventory item: `1 DOZEN` at a valid unit price.
2. Post invoice and verify stock decreases by `12 EA`.
3. Create credit note from invoice and set return quantity to `1 EA`.
4. Post credit note.

Expected results:
- System accepts return in alternate UOM and converts correctly.
- Inventory increases by `1 EA` (not 1 DOZEN).
- COGS reversal is proportional to returned quantity using system cost logic.
- Credit note amount/tax reflects returned quantity only.

## Scenario 4 - Financial Credit Note (No Inventory Return)
Purpose: verify adjustment-only credit note does not change stock.

1. Create posted invoice for inventory item.
2. Create credit note as financial adjustment (no stock return mode).
3. Post credit note.

Expected results:
- Revenue and VAT reverse according to credit amount.
- Inventory quantity does not increase.
- COGS is not reversed for this mode.
- Audit trail identifies adjustment mode.

## Scenario 5 - VAT-Inclusive Credit Note With Mixed Settlement
Purpose: verify split settlement behavior and VAT-inclusive correctness.

1. Create VAT-inclusive invoice and post it.
2. Receive partial payment.
3. Create VAT-inclusive credit note and post it.
4. Apply part of credit note to outstanding invoice.
5. Refund remaining balance to customer via bank/cash refund flow.

Expected results:
- Apply amount reduces invoice outstanding exactly.
- Refund amount reduces customer credit balance.
- VAT reversal equals the VAT portion of the credited amount.
- Final `Applied + Refunded + Remaining = Credited`.

## Scenario 6 - Customer Credit Balance Visibility
Purpose: verify unapplied credit wallet is visible and actionable.

1. Use any scenario that leaves credit note with remaining amount.
2. Open customer detail and invoice creation/list screens.

Expected results:
- Unapplied customer credit balance is visible.
- New invoice flow can use this available credit.
- Labels are explicit (for example: `Customer Credit Available`).

## Scenario 7 - UI/Workflow Regression Checks
Purpose: catch common UX confusion points.

Validate these behaviors:
- After posting payment, user is redirected back to list screen.
- Credit note screen clearly separates actions:
  - `Apply to invoice`
  - `Refund to customer`
- Reference/memo hidden if intentionally removed from UX scope.
- Filters in lists remain compact in quick mode; advanced filters open on demand.

## Accounting Verification Checklist (Per Scenario)
Use this checklist after each scenario:
- Trial balance remains balanced (debits = credits).
- AR changes match invoice, payment, and credit operations.
- VAT payable reverses correctly for credited tax.
- Inventory movement only occurs for return mode, not adjustment mode.
- COGS reversal only occurs for return mode.
- No negative inventory warning behavior is consistent with current policy (`WARN`).

## Optional DB/API Spot Checks
- Verify invoice outstanding via invoice detail endpoint.
- Verify credit note `credited/applied/remaining` fields via credit note detail endpoint.
- Verify inventory movement rows for return scenarios.
- Verify GL lines created for:
  - Invoice post
  - Payment post
  - Credit note post
  - Credit application/refund (as applicable)

## Exit Criteria
QA pass when:
- All 7 scenarios pass without accounting mismatch.
- No runtime/UI errors in credit note pages.
- No blocked flow without actionable user guidance.
- Expected GL + inventory side effects match scenario intent.
