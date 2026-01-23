# LedgerLite UI Design Guide v1

## Goals
- Make every page feel calm, consistent, and safe for accounting workflows.
- Keep primary actions obvious and irreversible actions explicit.
- Reduce cognitive load with clear grouping and progressive disclosure.

## Layout Patterns
- Page header: title on the left, StatusChip and primary action on the right.
- Section header: short title, optional helper text, and secondary actions aligned right.
- Form grid: 2 to 4 columns on desktop, stacked on mobile.
- Filter row: search, status, date range, then action button aligned to the end.
- Spacing: use 12, 16, 24, 32 px gaps; avoid arbitrary values.

## Typography
- Headings: use native h1/h2 tags for structure.
- Supporting text: use muted text for secondary details and hints.
- Numbers: always use formatMoney; dates: always use formatDate.

## Components
- StatusChip: always visible near the title for documents with status.
- Buttons:
  - Primary: Save, Post, or main action.
  - Secondary: Cancel, Back, or non-destructive actions.
  - Destructive: Void/Delete with confirmation only.
- Tables:
  - Compact headers, consistent right alignment for numbers.
  - Always include an empty state when there are no rows.
- Loading:
  - Use the shared loader style for inline loading text.
- Empty states:
  - Short sentence + CTA button where relevant.
- Validation hints:
  - Inline message under inputs for format, totals, and allocation hints.

## Interaction Rules
- Posted documents are read-only and cannot be edited.
- Disable Post when validation fails or totals are unbalanced.
- Always confirm destructive actions (Void/Delete).
- Keep totals visible at all times on detail pages.

## Examples
### Page Header
```tsx
<div className="page-header">
  <div>
    <h1>Invoice INV-1001</h1>
    <p className="muted">Acme Trading LLC | AED</p>
  </div>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <StatusChip status="POSTED" />
    <Button variant="secondary">Export</Button>
  </div>
</div>
```

### Totals Summary
```tsx
<div className="section-header">
  <div>
    <strong>Totals</strong>
    <p className="muted">Sub-total, tax, and grand total.</p>
  </div>
  <div>
    <div>Subtotal: {formatMoney(subTotal, currency)}</div>
    <div>Tax: {formatMoney(taxTotal, currency)}</div>
    <div><strong>Total: {formatMoney(total, currency)}</strong></div>
  </div>
</div>
```
