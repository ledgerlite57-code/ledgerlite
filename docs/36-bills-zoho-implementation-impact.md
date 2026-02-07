# 36 - Bills Zoho-Style Implementation Impact

## Goal
Categorize the `docs/35-bills-stories.md` changes into quick wins, medium impact, and high impact, and ensure changes are incremental without breaking current behavior.

## Quick Wins (Low Risk, Mostly UI/UX)
- Add Payment Terms selector in Bills UI and auto-calc Due Date (keep manual override).
- Add “Order Number” field label (or clarify `Reference / PO`) to match Zoho wording.
- Add Bulk Add Items action (UI only, uses existing items endpoint).
- Add Attachments panel to Bill detail using existing `/attachments` API.
- Add “Use Credits” call-to-action on Bills to jump to Debit Notes apply flow.
- Add list status chips for computed views (Open, Overdue) without changing backend statuses.

## Medium Impact (Backend + UI, Still Within Existing Model)
- Add computed status filters in Bills list: Open/Overdue/Partially Paid using `paymentStatus` + `dueDate`.
- Add Payment Terms snapshot on bill (store terms days at creation to keep history stable).
- Add bill-level totals preview on list and detail (ensure money minor units).

## High Impact (New Models, Workflows, or Cross-Module)
- Approval workflow for bills and vendor payments (new statuses + permissions + audit).
- Purchase Orders module and “Convert PO → Bill” flow.
- Vendor Portal for uploads and approvals.
- Documents inbox + autoscan/OCR.

## Incremental Delivery Principles
- Keep existing statuses (`DRAFT`, `POSTED`, `VOID`) intact; add computed views instead of new persisted statuses first.
- Introduce new fields behind feature flags or optional UI; never make them required in existing flows.
- Add additive DB migrations only; no destructive or breaking changes.
- Update API responses in a backward-compatible way (new fields optional).
- Ship UI changes that can be toggled without impacting current posting logic.
- Add tests per change, and keep legacy tests passing.

## Suggested Sequence (Non-Breaking)
1. Quick Wins (UI-only + attachments).
2. Computed status filters + payment terms snapshot.
3. Approvals or PO module (separately scoped epics).
